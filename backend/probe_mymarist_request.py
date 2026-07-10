"""Send one diagnostic MyMarist request using backend-only environment values."""

import json
import os
import sys
from contextlib import redirect_stderr, redirect_stdout
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


load_dotenv(override=False)


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required.")
    return value


def get_json_object(name: str) -> dict[str, Any]:
    value = os.getenv(name, "").strip()
    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} must contain valid JSON: {exc.msg}") from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object.")
    return parsed


def get_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_headers(cookie: str) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Cookie": cookie,
    }

    optional_headers = {
        "User-Agent": os.getenv("MYMARIST_USER_AGENT"),
        "Referer": os.getenv("MYMARIST_REFERER"),
        "Origin": os.getenv("MYMARIST_ORIGIN"),
    }
    headers.update({name: value for name, value in optional_headers.items() if value})

    extra_headers = get_json_object("MYMARIST_EXTRA_HEADERS")
    headers.update({str(name): str(value) for name, value in extra_headers.items()})
    return headers


def looks_like_login_page(response: httpx.Response) -> bool:
    content_type = response.headers.get("content-type", "").lower()
    if "text/html" not in content_type:
        return False

    preview = response.text[:5000].lower()
    return any(marker in preview for marker in ("sign in", "log in", "login", "single sign-on", "sso"))


def save_response(response: httpx.Response, response_dir: Path, started_at: datetime) -> Path:
    response_dir.mkdir(parents=True, exist_ok=True)
    timestamp = started_at.strftime("%Y%m%dT%H%M%S.%fZ")
    content_type = response.headers.get("content-type", "").lower()

    is_json = False
    try:
        parsed_json = response.json()
        is_json = True
    except json.JSONDecodeError:
        parsed_json = None

    if is_json:
        extension = "json"
        content = json.dumps(parsed_json, indent=2, ensure_ascii=False) + "\n"
    elif "text/html" in content_type:
        extension = "html"
        content = response.text
    else:
        extension = "txt"
        content = response.text

    response_path = response_dir / f"{timestamp}_status-{response.status_code}.{extension}"
    response_path.write_text(content, encoding="utf-8")

    if extension == "json" and response.is_success:
        (response_dir / "latest.json").write_text(content, encoding="utf-8")

    return response_path


def run_probe(response_dir: Path, started_at: datetime) -> int:
    try:
        url = get_required_env("MYMARIST_REGISTRATION_URL")
        cookie = get_required_env("MYMARIST_COOKIE")
        method = os.getenv("MYMARIST_METHOD", "GET").strip().upper()
        query = get_json_object("MYMARIST_QUERY")
        json_body = get_json_object("MYMARIST_JSON_BODY")
        headers = build_headers(cookie)
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        print(f"Configuration error: unsupported MYMARIST_METHOD {method!r}.", file=sys.stderr)
        return 2

    if "cf_clearance=" in cookie and "User-Agent" not in headers:
        print(
            "Warning: cf_clearance is present but MYMARIST_USER_AGENT is missing; "
            "Cloudflare may reject the request."
        )

    print(f"Sending {method} {url}")
    print(f"Cookie header loaded ({len(cookie)} characters; value redacted).")

    try:
        with httpx.Client(
            timeout=float(os.getenv("MYMARIST_TIMEOUT_SECONDS", "30")),
            follow_redirects=get_bool_env("MYMARIST_FOLLOW_REDIRECTS"),
        ) as client:
            response = client.request(
                method,
                url,
                headers=headers,
                params=query or None,
                json=json_body or None,
            )
    except (httpx.HTTPError, ValueError) as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    print(f"Status: {response.status_code}")
    print(f"Content-Type: {response.headers.get('content-type', 'not provided')}")
    print(f"Final URL: {response.url}")

    if response.is_redirect:
        print(f"Redirect target: {response.headers.get('location', 'not provided')}")
        print("The session may be expired if this points to a login or SSO page.")
    elif looks_like_login_page(response):
        print("Warning: the response appears to be an HTML login page.")

    try:
        response_path = save_response(response, response_dir, started_at)
    except OSError as exc:
        print(f"Could not save response body: {exc}", file=sys.stderr)
        return 1

    print(f"Response body: {len(response.content)} bytes")
    print(f"Response saved to: {response_path}")

    return 0 if response.is_success else 1


def main() -> int:
    log_path = Path(os.getenv("MYMARIST_LOG_PATH", "logs/mymarist_probe.txt"))
    response_dir = Path(os.getenv("MYMARIST_RESPONSE_DIR", str(log_path.parent / "responses")))
    started_at = datetime.now(UTC)
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log_file:
            with redirect_stdout(log_file), redirect_stderr(log_file):
                print("\n" + "=" * 72)
                print(f"MyMarist probe started at {started_at.isoformat()}")
                result = run_probe(response_dir, started_at)
                print(f"Probe finished with exit code {result}.")
    except OSError as exc:
        print(f"Could not write probe log {log_path}: {exc}", file=sys.stderr)
        return 1

    print(f"Probe log written to {log_path.resolve()}")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
