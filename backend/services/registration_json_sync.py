import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select, tuple_
from sqlalchemy.orm import Session

from backend.models import AcademicTerm, Course, Instructor, Section, SectionInstructor
from backend.schemas import RegistrationSyncResult
from backend.services.term_labels import derive_term_description


class RegistrationSyncError(RuntimeError):
    pass


def require_text(record: dict[str, Any], key: str, index: int) -> str:
    value = record.get(key)
    if value is None or not str(value).strip():
        raise RegistrationSyncError(f"Section at data[{index}] is missing {key}.")
    return str(value).strip()


def optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise RegistrationSyncError(f"Expected an integer value, received {value!r}.") from exc


def optional_bool(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if str(value).strip().lower() in {"true", "t", "1", "yes", "y"}:
        return True
    if str(value).strip().lower() in {"false", "f", "0", "no", "n"}:
        return False
    raise RegistrationSyncError(f"Expected a boolean value, received {value!r}.")


def section_hash(values: dict[str, Any]) -> str:
    payload = json.dumps(values, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_complete_snapshot(path: str) -> tuple[str, str, list[dict[str, Any]]]:
    snapshot_path = Path(path)
    if not snapshot_path.exists():
        raise RegistrationSyncError(f"Registration JSON snapshot was not found: {snapshot_path}")

    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistrationSyncError(f"Could not read registration JSON snapshot: {exc}") from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise RegistrationSyncError("Registration snapshot must contain a top-level data array.")

    records = payload["data"]
    total_count = payload.get("totalCount")
    if not isinstance(total_count, int):
        raise RegistrationSyncError("Registration snapshot is missing an integer totalCount.")
    if len(records) != total_count:
        raise RegistrationSyncError(
            f"Registration snapshot is incomplete: data contains {len(records)} sections, "
            f"but totalCount reports {total_count}. Fetch every page before syncing."
        )
    if not records:
        raise RegistrationSyncError("Registration snapshot contains no sections.")
    if not all(isinstance(record, dict) for record in records):
        raise RegistrationSyncError("Every item in the registration data array must be an object.")

    terms = {require_text(record, "term", index) for index, record in enumerate(records)}
    if len(terms) != 1:
        raise RegistrationSyncError("A registration snapshot must contain exactly one term.")
    term = terms.pop()
    descriptions = {
        str(record.get("termDesc")).strip()
        for record in records
        if record.get("termDesc") and str(record.get("termDesc")).strip()
    }
    if len(descriptions) > 1:
        raise RegistrationSyncError("A registration snapshot contains conflicting term descriptions.")
    term_description = descriptions.pop() if descriptions else derive_term_description(term)
    return term, term_description, records


def sync_registration_json(db: Session, source_path: str) -> RegistrationSyncResult:
    term, term_description, records = load_complete_snapshot(source_path)
    synced_at = datetime.now(UTC)

    academic_term = db.get(AcademicTerm, term)
    if academic_term is None:
        db.add(AcademicTerm(code=term, description=term_description, last_synced_at=synced_at))
    else:
        academic_term.description = term_description
        academic_term.last_synced_at = synced_at

    courses_inserted = courses_updated = 0
    instructors_inserted = instructors_updated = 0
    sections_inserted = sections_updated = sections_unchanged = 0
    links_inserted = links_updated = links_deleted = links_skipped = 0

    courses = {(course.subject, course.course_number): course for course in db.scalars(select(Course))}
    instructors = {instructor.banner_id: instructor for instructor in db.scalars(select(Instructor))}
    sections = {
        section.crn: section
        for section in db.scalars(select(Section).where(Section.term == term))
    }
    seen_crns: set[str] = set()
    processed_course_keys: set[tuple[str, str]] = set()
    desired_links: dict[int, dict[int, bool | None]] = {}

    for index, record in enumerate(records):
        subject = require_text(record, "subject", index)
        course_number = require_text(record, "courseNumber", index)
        title = require_text(record, "courseTitle", index)
        crn = require_text(record, "courseReferenceNumber", index)
        if crn in seen_crns:
            raise RegistrationSyncError(f"Duplicate CRN {crn!r} in term {term}.")
        seen_crns.add(crn)

        course_key = (subject, course_number)
        course = courses.get(course_key)
        if course is None:
            course = Course(subject=subject, course_number=course_number, title=title)
            db.add(course)
            db.flush()
            courses[course_key] = course
            courses_inserted += 1
        elif course_key not in processed_course_keys and course.title != title:
            course.title = title
            courses_updated += 1
        processed_course_keys.add(course_key)

        section_values = {
            "course_id": course.id,
            "title": title,
            "enrollment": optional_int(record.get("enrollment")),
            "seats_available": optional_int(record.get("seatsAvailable")),
        }
        content_hash = section_hash(section_values)
        section = sections.get(crn)
        if section is None:
            section = Section(
                term=term,
                crn=crn,
                content_hash=content_hash,
                is_active=True,
                last_synced_at=synced_at,
                **section_values,
            )
            db.add(section)
            db.flush()
            sections[crn] = section
            sections_inserted += 1
        else:
            changed = section.content_hash != content_hash or not section.is_active
            for key, value in section_values.items():
                setattr(section, key, value)
            section.content_hash = content_hash
            section.is_active = True
            section.last_synced_at = synced_at
            if changed:
                sections_updated += 1
            else:
                sections_unchanged += 1

        section_links: dict[int, bool | None] = {}
        faculty = record.get("faculty") or []
        if not isinstance(faculty, list):
            raise RegistrationSyncError(f"Section {crn} has a non-array faculty value.")
        for faculty_record in faculty:
            if not isinstance(faculty_record, dict):
                links_skipped += 1
                continue
            banner_id = str(faculty_record.get("bannerId") or "").strip()
            display_name = str(faculty_record.get("displayName") or "").strip()
            if not banner_id or not display_name:
                links_skipped += 1
                continue

            email_value = faculty_record.get("emailAddress")
            email = str(email_value).strip() if email_value else None
            instructor = instructors.get(banner_id)
            if instructor is None:
                instructor = Instructor(banner_id=banner_id, display_name=display_name, email=email)
                db.add(instructor)
                db.flush()
                instructors[banner_id] = instructor
                instructors_inserted += 1
            elif instructor.display_name != display_name or instructor.email != email:
                instructor.display_name = display_name
                instructor.email = email
                instructors_updated += 1

            section_links[instructor.id] = optional_bool(faculty_record.get("primaryIndicator"))
        desired_links[section.id] = section_links

    stale_sections = [section for crn, section in sections.items() if crn not in seen_crns and section.is_active]
    for section in stale_sections:
        section.is_active = False
        section.last_synced_at = synced_at

    section_ids = list(desired_links)
    existing_links: dict[tuple[int, int], SectionInstructor] = {}
    if section_ids:
        existing_links = {
            (link.section_id, link.instructor_id): link
            for link in db.scalars(
                select(SectionInstructor).where(SectionInstructor.section_id.in_(section_ids))
            )
        }

    desired_keys: set[tuple[int, int]] = set()
    for section_id, instructors_for_section in desired_links.items():
        for instructor_id, primary_indicator in instructors_for_section.items():
            key = (section_id, instructor_id)
            desired_keys.add(key)
            existing_link = existing_links.get(key)
            if existing_link is None:
                db.add(
                    SectionInstructor(
                        section_id=section_id,
                        instructor_id=instructor_id,
                        primary_indicator=primary_indicator,
                    )
                )
                links_inserted += 1
            elif existing_link.primary_indicator != primary_indicator:
                existing_link.primary_indicator = primary_indicator
                links_updated += 1

    stale_link_keys = set(existing_links) - desired_keys
    if stale_link_keys:
        db.execute(
            delete(SectionInstructor).where(
                tuple_(SectionInstructor.section_id, SectionInstructor.instructor_id).in_(stale_link_keys)
            )
        )
        links_deleted = len(stale_link_keys)

    db.commit()
    return RegistrationSyncResult(
        term=term,
        term_description=term_description,
        source_path=source_path,
        fetched=len(records),
        courses_inserted=courses_inserted,
        courses_updated=courses_updated,
        instructors_inserted=instructors_inserted,
        instructors_updated=instructors_updated,
        sections_inserted=sections_inserted,
        sections_updated=sections_updated,
        sections_unchanged=sections_unchanged,
        sections_deactivated=len(stale_sections),
        links_inserted=links_inserted,
        links_updated=links_updated,
        links_deleted=links_deleted,
        links_skipped=links_skipped,
        synced_at=synced_at,
    )
