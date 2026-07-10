import os
from typing import Any
from datetime import UTC, datetime
from pathlib import Path

import httpx

from backend.probe_mymarist_request import (
    build_headers,
    build_registration_request,
    get_bool_env,
    get_json_object,
    get_required_env,
    redact_request_url,
    save_response,
)


class RegistrationFetchError(RuntimeError):
    pass


def parse_registration_page(response: httpx.Response) -> dict[str, Any]:
    if not response.is_success:
        raise RegistrationFetchError(f"Registration endpoint returned HTTP {response.status_code}.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise RegistrationFetchError("Registration endpoint did not return valid JSON.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise RegistrationFetchError("Registration response must contain a top-level data array.")
    if not isinstance(payload.get("totalCount"), int):
        raise RegistrationFetchError("Registration response is missing an integer totalCount.")
    return payload


def fetch_registration_snapshot() -> Path:
    try:
        url, query = build_registration_request(get_required_env("MYMARIST_REGISTRATION_URL"))
        cookie = get_required_env("MYMARIST_COOKIE")
        method = os.getenv("MYMARIST_METHOD", "GET").strip().upper()
        json_body = get_json_object("MYMARIST_JSON_BODY")
        headers = build_headers(cookie)
        timeout = float(os.getenv("MYMARIST_TIMEOUT_SECONDS", "30"))
    except ValueError as exc:
        raise RegistrationFetchError(str(exc)) from exc

    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        raise RegistrationFetchError(f"Unsupported MYMARIST_METHOD {method!r}.")

    log_path = Path(os.getenv("MYMARIST_LOG_PATH", "logs/mymarist_probe.txt"))
    response_dir = Path(os.getenv("MYMARIST_RESPONSE_DIR", str(log_path.parent / "responses")))
    started_at = datetime.now(UTC)

    try:
        with httpx.Client(
            timeout=timeout,
            follow_redirects=get_bool_env("MYMARIST_FOLLOW_REDIRECTS"),
        ) as client:
            response = client.request(
                method,
                url,
                headers=headers,
                params=query,
                json=json_body or None,
            )
            first_payload = parse_registration_page(response)
            total_count = first_payload["totalCount"]
            all_records = list(first_payload["data"])
            page_size = optional_page_size(first_payload, all_records)
            seen_sections = get_section_keys(all_records)
            pages_fetched = 1

            while len(all_records) < total_count:
                page_query = dict(query)
                page_query["pageOffset"] = len(all_records)
                page_query["pageMaxSize"] = page_size
                page_response = client.request(
                    method,
                    url,
                    headers=headers,
                    params=page_query,
                    json=json_body or None,
                )
                page_payload = parse_registration_page(page_response)
                if page_payload["totalCount"] != total_count:
                    raise RegistrationFetchError(
                        "Registration totalCount changed while fetching pages; retry the sync."
                    )
                page_records = page_payload["data"]
                if not page_records:
                    raise RegistrationFetchError(
                        f"Registration pagination stopped after {len(all_records)} of {total_count} sections."
                    )
                page_keys = get_section_keys(page_records)
                overlapping_keys = seen_sections & page_keys
                if overlapping_keys:
                    duplicate = sorted(overlapping_keys)[0]
                    raise RegistrationFetchError(
                        f"Registration pagination returned duplicate section {duplicate}; no data was synced."
                    )
                seen_sections.update(page_keys)
                all_records.extend(page_records)
                pages_fetched += 1
                if len(all_records) > total_count:
                    raise RegistrationFetchError(
                        f"Registration pagination returned {len(all_records)} records for totalCount {total_count}."
                    )

        combined_payload = dict(first_payload)
        combined_payload["data"] = all_records
        combined_payload["pageOffset"] = 0
        combined_payload["pageMaxSize"] = len(all_records)
        combined_payload["sectionsFetchedCount"] = len(all_records)
        combined_response = httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            json=combined_payload,
            request=response.request,
        )
        response_path = save_response(combined_response, response_dir, started_at, query, json_body)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write("\n" + "=" * 72 + "\n")
            log_file.write(f"Admin registration fetch started at {started_at.isoformat()}\n")
            log_file.write(f"Status: {combined_response.status_code}\n")
            log_file.write(f"Content-Type: {combined_response.headers.get('content-type', 'not provided')}\n")
            log_file.write(f"Final URL: {redact_request_url(response.url)}\n")
            log_file.write(f"Pages fetched: {pages_fetched}\n")
            log_file.write(f"Sections fetched: {len(all_records)} of {total_count}\n")
            log_file.write(f"Combined response body: {len(combined_response.content)} bytes\n")
            log_file.write(f"Response saved to: {response_path}\n")
    except httpx.HTTPError as exc:
        raise RegistrationFetchError(f"Registration request failed: {exc}") from exc
    except OSError as exc:
        raise RegistrationFetchError(f"Could not save registration response: {exc}") from exc

    return response_path


def optional_page_size(payload: dict[str, Any], records: list[Any]) -> int:
    value = payload.get("pageMaxSize")
    if isinstance(value, int) and value > 0:
        return value
    if records:
        return len(records)
    raise RegistrationFetchError("Registration response did not provide a usable page size.")


def get_section_keys(records: list[Any]) -> set[str]:
    keys: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise RegistrationFetchError("Every registration data item must be an object.")
        term = str(record.get("term") or "").strip()
        crn = str(record.get("courseReferenceNumber") or "").strip()
        if not term or not crn:
            raise RegistrationFetchError("A registration section is missing its term or CRN.")
        key = f"{term}:{crn}"
        if key in keys:
            raise RegistrationFetchError(f"Registration page contains duplicate section {key}.")
        keys.add(key)
    return keys
