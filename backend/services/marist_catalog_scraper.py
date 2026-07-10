from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import re

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import Professor


YEAR_SUFFIX_RE = re.compile(r",\s*\d{4}\s*$")


class CatalogSourceError(RuntimeError):
    pass


@dataclass(frozen=True)
class ScrapedProfessor:
    name: str
    title: str | None
    category: str
    source_url: str


@dataclass(frozen=True)
class CatalogSyncResult:
    fetched: int
    inserted: int
    updated: int
    skipped: int


def fetch_catalog_html(url: str = settings.catalog_url) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 ProfessorCatalogSync/1.0 (+local development)",
        "Accept": "text/html,application/xhtml+xml",
    }
    with httpx.Client(timeout=20.0, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        response.raise_for_status()
        html = response.text

    if is_waf_challenge(html):
        raise CatalogSourceError(
            "The catalog site returned an AWS WAF JavaScript challenge instead of the Faculty page. "
            "Set CATALOG_HTML_PATH to a saved HTML copy of the catalog page, or use a source that is not WAF-blocked."
        )

    return html


def read_catalog_html_snapshot(path: str) -> str:
    snapshot_path = Path(path)
    if not snapshot_path.exists():
        raise CatalogSourceError(f"Catalog HTML snapshot was not found: {snapshot_path}")

    return snapshot_path.read_text(encoding="utf-8")


def parse_faculty_catalog(html: str, source_url: str = settings.catalog_url) -> list[ScrapedProfessor]:
    soup = BeautifulSoup(html, "html.parser")
    professors: list[ScrapedProfessor] = []
    category = "Faculty"

    for element in soup.find_all(["h2", "p"]):
        if not isinstance(element, Tag):
            continue

        if element.name == "h2" and "Emeriti Faculty" in element.get_text(" ", strip=True):
            category = "Emeriti Faculty"
            continue

        if element.name != "p":
            continue

        strong = element.find("strong")
        if strong is None:
            continue

        name = clean_name(strong.get_text(" ", strip=True))
        if not name:
            continue

        em = element.find("em")
        title = clean_text(em.get_text(" ", strip=True)) if em else None

        professors.append(
            ScrapedProfessor(
                name=name,
                title=title or None,
                category=category,
                source_url=source_url,
            )
        )

    return professors


def is_waf_challenge(html: str) -> bool:
    lowered = html.lower()
    return (
        "awswaf" in lowered
        or "challenge-container" in lowered
        or "verify that you're not a robot" in lowered
        or "verify that you&#39;re not a robot" in lowered
    )


def clean_name(value: str) -> str:
    value = clean_text(value).lstrip("*").strip()
    value = YEAR_SUFFIX_RE.sub("", value).strip()
    return value


def clean_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def sync_faculty_catalog(db: Session, html: str | None = None, source_url: str = settings.catalog_url) -> CatalogSyncResult:
    if html is None:
        if settings.catalog_html_path:
            html = read_catalog_html_snapshot(settings.catalog_html_path)
            source_url = f"file://{settings.catalog_html_path}"
        else:
            html = fetch_catalog_html(source_url)

    scraped = parse_faculty_catalog(html, source_url)
    if not scraped:
        raise CatalogSourceError(
            "No professor entries were found in the catalog source. "
            "Confirm the HTML source contains the Faculty page entries."
        )

    inserted = 0
    updated = 0
    skipped = 0
    synced_at = datetime.now(timezone.utc)

    for item in scraped:
        existing = db.scalar(
            select(Professor).where(
                Professor.name == item.name,
                Professor.category == item.category,
                Professor.source_url == item.source_url,
            )
        )

        if existing is None:
            db.add(
                Professor(
                    name=item.name,
                    title=item.title,
                    category=item.category,
                    source_url=item.source_url,
                    last_catalog_sync_at=synced_at,
                )
            )
            inserted += 1
            continue

        if existing.title != item.title:
            existing.title = item.title
            updated += 1
        else:
            skipped += 1

        existing.last_catalog_sync_at = synced_at

    db.commit()
    return CatalogSyncResult(fetched=len(scraped), inserted=inserted, updated=updated, skipped=skipped)
