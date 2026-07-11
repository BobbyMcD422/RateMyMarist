import re
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Instructor, InstructorRMPLink, RMPProfessorSnapshot


def normalize_person_name(name: str) -> str:
    value = name.strip().lower()
    if "," in value:
        last, given = value.split(",", 1)
        value = f"{given} {last}"
    return " ".join(re.findall(r"[a-z0-9]+", value))


def suggest_exact_instructor_links(db: Session, school_id: int) -> int:
    instructors_by_name: dict[str, list[Instructor]] = defaultdict(list)
    for instructor in db.scalars(select(Instructor)):
        instructors_by_name[normalize_person_name(instructor.display_name)].append(instructor)

    professors_by_name: dict[str, list[RMPProfessorSnapshot]] = defaultdict(list)
    for professor in db.scalars(
        select(RMPProfessorSnapshot).where(RMPProfessorSnapshot.school_id == school_id)
    ):
        professors_by_name[normalize_person_name(professor.name)].append(professor)

    existing_links = {link.instructor_id: link for link in db.scalars(select(InstructorRMPLink))}
    linked_rmp_ids = {link.rmp_professor_id for link in existing_links.values()}

    for normalized_name, instructors in instructors_by_name.items():
        professors = professors_by_name.get(normalized_name, [])
        is_unique = bool(normalized_name) and len(instructors) == 1 and len(professors) == 1
        for instructor in instructors:
            link = existing_links.get(instructor.id)
            if link is None or link.match_method not in {"exact_name", "exact_unique_name"}:
                continue
            link.match_status = "approved" if is_unique and link.rmp_professor_id == professors[0].id else "pending"
            link.match_method = "exact_unique_name" if is_unique else "name_conflict"

    inserted = 0
    for normalized_name, instructors in instructors_by_name.items():
        professors = professors_by_name.get(normalized_name, [])
        if not normalized_name or len(instructors) != 1 or len(professors) != 1:
            continue
        if instructors[0].id in existing_links or professors[0].id in linked_rmp_ids:
            continue
        db.add(
            InstructorRMPLink(
                instructor_id=instructors[0].id,
                rmp_professor_id=professors[0].id,
                match_status="approved",
                match_confidence=1.0,
                match_method="exact_unique_name",
            )
        )
        linked_rmp_ids.add(professors[0].id)
        inserted += 1
    return inserted


def review_instructor_link(
    db: Session,
    instructor_id: int,
    rmp_professor_id: int,
    status: str,
) -> InstructorRMPLink:
    link = db.get(InstructorRMPLink, instructor_id)
    if link is None:
        link = InstructorRMPLink(
            instructor_id=instructor_id,
            rmp_professor_id=rmp_professor_id,
            match_method="manual",
        )
        db.add(link)
    else:
        link.rmp_professor_id = rmp_professor_id
    link.match_method = "manual"
    link.match_status = status
    link.match_confidence = 1.0 if status == "approved" else link.match_confidence
    link.reviewed_at = datetime.now(UTC)
    return link
