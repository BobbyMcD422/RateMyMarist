"""Fetch a conservative batch of authenticated MyMarist detail responses by CRN."""

import argparse
import json
import math
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from sqlalchemy import select

from backend.db import SessionLocal
from backend.models import Section
from backend.probe_mymarist_request import build_headers, get_bool_env, get_json_object, get_required_env


load_dotenv(override=False)


def parse_crns(value: str) -> list[str]:
    crns = list(dict.fromkeys(part.strip() for part in value.replace("\n", ",").split(",") if part.strip()))
    if not crns:
        raise ValueError("Provide at least one CRN with --crns or MYMARIST_CRNS.")
    if any(not crn.isdigit() for crn in crns):
        raise ValueError("CRNs must contain digits only.")
    return crns


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--crns", default=os.getenv("MYMARIST_CRNS", ""), help="Comma-separated CRNs.")
    parser.add_argument("--term", default=os.getenv("MYMARIST_CRN_TERM", ""), help="Registration term used when CRNs are loaded from Postgres.")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many CRNs before selecting a batch.")
    parser.add_argument("--limit", type=int, default=None, help="Requests in this run; defaults to MYMARIST_CRN_BATCH_SIZE or 5.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the batch without sending requests.")
    return parser.parse_args()


def load_crns_from_db(term: str | None) -> tuple[list[str], str]:
    with SessionLocal() as db:
        selected_term = term or db.scalar(
            select(Section.term)
            .where(Section.is_active.is_(True))
            .distinct()
            .order_by(Section.term.desc())
            .limit(1)
        )
        if not selected_term:
            raise ValueError("No active registration term was found in Postgres.")
        crns = list(
            db.scalars(
                select(Section.crn)
                .where(Section.term == selected_term, Section.is_active.is_(True))
                .order_by(Section.crn)
            )
        )
    if not crns:
        raise ValueError(f"No active CRNs were found for term {selected_term}.")
    return crns, selected_term


def request_parts(crn: str) -> tuple[str, dict[str, Any], dict[str, Any]]:
    url_template = get_required_env("MYMARIST_CRN_DETAIL_URL")
    parameter = os.getenv("MYMARIST_CRN_PARAM", "courseReferenceNumber").strip()
    placement = os.getenv("MYMARIST_CRN_PLACEMENT", "query").strip().lower()
    query = get_json_object("MYMARIST_CRN_QUERY")
    body = get_json_object("MYMARIST_CRN_JSON_BODY")

    if placement == "path":
        if "{crn}" not in url_template:
            raise ValueError("MYMARIST_CRN_DETAIL_URL must contain {crn} when placement is path.")
        url = url_template.replace("{crn}", quote(crn, safe=""))
    elif placement == "query":
        url = url_template
        query[parameter] = crn
    elif placement == "json":
        url = url_template
        body[parameter] = crn
    else:
        raise ValueError("MYMARIST_CRN_PLACEMENT must be query, json, or path.")
    return url, query, body


def save_response(response: httpx.Response, crn: str, run_dir: Path) -> tuple[Path, bool]:
    content_type = response.headers.get("content-type", "").lower()
    try:
        payload = response.json()
        content = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        extension = "json"
        is_json = True
    except json.JSONDecodeError:
        content = response.text
        extension = "html" if "text/html" in content_type else "txt"
        is_json = False
    path = run_dir / f"crn_{crn}_status_{response.status_code}.{extension}"
    path.write_text(content, encoding="utf-8")
    return path, is_json


def main() -> int:
    args = parse_args()
    try:
        if args.crns.strip():
            crns = parse_crns(args.crns)
            selected_term = args.term.strip() or None
            crn_source = "explicit"
        else:
            crns, selected_term = load_crns_from_db(args.term.strip() or None)
            crn_source = "database"
        batch_size = args.limit if args.limit is not None else int(os.getenv("MYMARIST_CRN_BATCH_SIZE", "5"))
        if args.offset < 0 or not 1 <= batch_size <= 25:
            raise ValueError("Offset must be non-negative and batch size must be between 1 and 25.")
        selected = crns[args.offset:args.offset + batch_size]
        if not selected:
            raise ValueError("The selected offset is past the end of the CRN list.")
        method = os.getenv("MYMARIST_CRN_METHOD", "GET").strip().upper()
        if method not in {"GET", "POST", "PUT", "PATCH"}:
            raise ValueError("MYMARIST_CRN_METHOD must be GET, POST, PUT, or PATCH.")
        configured_delay = max(0.0, float(os.getenv("MYMARIST_CRN_DELAY_SECONDS", "0.5")))
        requests_to_send = [(crn, *request_parts(crn)) for crn in selected]
    except (ValueError, TypeError) as exc:
        print(f"Configuration error: {exc}")
        return 2

    term_label = f" for term {selected_term}" if selected_term else ""
    print(f"Selected {len(selected)} of {len(crns)} CRNs from {crn_source}{term_label} at offset {args.offset}: {', '.join(selected)}")
    remaining_count = max(0, len(crns) - args.offset)
    remaining_batches = math.ceil(remaining_count / batch_size)
    minimum_delay_seconds = max(0, remaining_count - remaining_batches) * configured_delay
    print(
        f"Workload from this offset: {remaining_count} requests across {remaining_batches} batches; "
        f"configured inter-request delays alone require about {minimum_delay_seconds:.1f} seconds."
    )
    if args.dry_run:
        for crn, url, _, _ in requests_to_send:
            print(f"DRY RUN {method} {url} for CRN {crn}")
        return 0

    try:
        headers = build_headers(get_required_env("MYMARIST_COOKIE"))
        delay = configured_delay
        timeout = float(os.getenv("MYMARIST_TIMEOUT_SECONDS", "30"))
    except ValueError as exc:
        print(f"Configuration error: {exc}")
        return 2

    started_at = datetime.now(UTC)
    root = Path(os.getenv("MYMARIST_CRN_RESPONSE_DIR", "logs/responses/crn-details"))
    run_dir = root / started_at.strftime("%Y%m%dT%H%M%S.%fZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []

    with httpx.Client(
        headers=headers,
        timeout=timeout,
        follow_redirects=get_bool_env("MYMARIST_FOLLOW_REDIRECTS"),
    ) as client:
        for index, (crn, url, query, body) in enumerate(requests_to_send):
            request_started = time.perf_counter()
            try:
                response = client.request(method, url, params=query or None, json=body or None)
                path, is_json = save_response(response, crn, run_dir)
                results.append(
                    {
                        "crn": crn,
                        "status_code": response.status_code,
                        "is_json": is_json,
                        "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                        "response_file": path.name,
                        "content_bytes": len(response.content),
                    }
                )
                print(f"CRN {crn}: {response.status_code} -> {path.name}")
            except httpx.HTTPError as exc:
                results.append({"crn": crn, "error": str(exc)})
                print(f"CRN {crn}: request failed: {exc}")
            if index + 1 < len(requests_to_send) and delay:
                time.sleep(delay)

    manifest = {
        "started_at": started_at.isoformat(),
        "method": method,
        "offset": args.offset,
        "crn_source": crn_source,
        "term": selected_term,
        "batch_size": len(selected),
        "total_crns": len(crns),
        "next_offset": args.offset + len(selected) if args.offset + len(selected) < len(crns) else None,
        "results": results,
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    failures = sum(1 for result in results if result.get("error") or not 200 <= result.get("status_code", 0) < 300)
    print(f"Saved run manifest to {run_dir / 'manifest.json'} ({failures} failures).")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
