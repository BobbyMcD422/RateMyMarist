from datetime import UTC, datetime
from functools import lru_cache

from rmp_client import HttpError, ParsingError, RMPAPIError, RMPClient, RMPError, RetryError
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from backend.models import RMPProfessorSnapshot
from backend.schemas import RMPDepartmentOut, RMPProfessorOut, RMPProfessorPageOut, RMPSyncResult


class RMPClientServiceError(RuntimeError):
    pass


def get_professor_profile_url(professor_id: str) -> str:
    return f"https://www.ratemyprofessors.com/professor/{professor_id}"


@lru_cache(maxsize=8)
def _get_all_professors_for_school(school_id: int) -> tuple[RMPProfessorOut, ...]:
    return _fetch_all_professors_for_school(school_id)


def _fetch_all_professors_for_school(school_id: int) -> tuple[RMPProfessorOut, ...]:
    try:
        with RMPClient() as client:
            professors_by_id = {
                professor.id: RMPProfessorOut(
                    id=professor.id,
                    profile_url=get_professor_profile_url(professor.id),
                    name=professor.name,
                    department=professor.department,
                    overall_rating=professor.overall_rating,
                    num_ratings=professor.num_ratings,
                    percent_take_again=professor.percent_take_again,
                    level_of_difficulty=professor.level_of_difficulty,
                )
                for professor in client.iter_professors_for_school(school_id)
            }
    except (HttpError, ParsingError, RMPAPIError, RetryError, RMPError) as exc:
        raise RMPClientServiceError(str(exc)) from exc

    return tuple(professors_by_id.values())


def sync_professors_for_school(db: Session, school_id: int) -> RMPSyncResult:
    professors = _fetch_all_professors_for_school(school_id)
    synced_at = datetime.now(UTC)
    existing = {
        professor.rmp_id: professor
        for professor in db.scalars(
            select(RMPProfessorSnapshot).where(RMPProfessorSnapshot.school_id == school_id)
        )
    }
    fetched_ids: set[str] = set()
    inserted = 0
    updated = 0
    unchanged = 0

    for professor in professors:
        fetched_ids.add(professor.id)
        values = {
            "profile_url": professor.profile_url,
            "name": professor.name,
            "department": professor.department,
            "overall_rating": professor.overall_rating,
            "num_ratings": professor.num_ratings,
            "percent_take_again": professor.percent_take_again,
            "level_of_difficulty": professor.level_of_difficulty,
        }
        saved = existing.get(professor.id)
        if saved is None:
            db.add(
                RMPProfessorSnapshot(
                    school_id=school_id,
                    rmp_id=professor.id,
                    synced_at=synced_at,
                    **values,
                )
            )
            inserted += 1
            continue

        changed = any(getattr(saved, key) != value for key, value in values.items())
        for key, value in values.items():
            setattr(saved, key, value)
        saved.synced_at = synced_at
        if changed:
            updated += 1
        else:
            unchanged += 1

    stale_ids = set(existing) - fetched_ids
    if stale_ids:
        db.execute(
            delete(RMPProfessorSnapshot).where(
                RMPProfessorSnapshot.school_id == school_id,
                RMPProfessorSnapshot.rmp_id.in_(stale_ids),
            )
        )

    db.commit()
    _get_all_professors_for_school.cache_clear()
    return RMPSyncResult(
        school_id=school_id,
        fetched=len(professors),
        inserted=inserted,
        updated=updated,
        unchanged=unchanged,
        deleted=len(stale_ids),
        synced_at=synced_at,
    )


def list_saved_departments(db: Session, school_id: int) -> list[RMPDepartmentOut]:
    rows = db.execute(
        select(RMPProfessorSnapshot.department, func.count(RMPProfessorSnapshot.id))
        .where(
            RMPProfessorSnapshot.school_id == school_id,
            RMPProfessorSnapshot.department.is_not(None),
            RMPProfessorSnapshot.department != "",
        )
        .group_by(RMPProfessorSnapshot.department)
        .order_by(func.lower(RMPProfessorSnapshot.department))
    ).all()
    return [RMPDepartmentOut(name=department, count=count) for department, count in rows]


def list_saved_professors(
    db: Session,
    school_id: int,
    query: str | None = None,
    department: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> RMPProfessorPageOut:
    filters = [RMPProfessorSnapshot.school_id == school_id]
    if department:
        filters.append(func.lower(RMPProfessorSnapshot.department) == department.strip().lower())
    if query:
        filters.append(RMPProfessorSnapshot.name.ilike(f"%{query.strip()}%"))

    total = db.scalar(select(func.count(RMPProfessorSnapshot.id)).where(*filters)) or 0
    rating_sort = case(
        (RMPProfessorSnapshot.num_ratings > 0, func.coalesce(RMPProfessorSnapshot.overall_rating, -1)),
        else_=-1,
    )
    rows = db.scalars(
        select(RMPProfessorSnapshot)
        .where(*filters)
        .order_by(rating_sort.desc(), RMPProfessorSnapshot.name)
        .offset(offset)
        .limit(limit)
    ).all()
    return RMPProfessorPageOut(
        school_id=school_id,
        total=total,
        page_size=len(rows),
        has_next_page=offset + len(rows) < total,
        next_cursor=None,
        professors=[
            RMPProfessorOut(
                id=row.rmp_id,
                profile_url=row.profile_url or get_professor_profile_url(row.rmp_id),
                name=row.name,
                department=row.department,
                overall_rating=row.overall_rating,
                num_ratings=row.num_ratings,
                percent_take_again=row.percent_take_again,
                level_of_difficulty=row.level_of_difficulty,
            )
            for row in rows
        ],
    )


def list_departments_for_school(school_id: int) -> list[RMPDepartmentOut]:
    counts: dict[str, int] = {}
    for professor in _get_all_professors_for_school(school_id):
        if not professor.department:
            continue

        department = professor.department.strip()
        if not department:
            continue

        counts[department] = counts.get(department, 0) + 1

    return [
        RMPDepartmentOut(name=name, count=count)
        for name, count in sorted(counts.items(), key=lambda item: item[0].lower())
    ]


def list_professors_for_school(
    school_id: int,
    query: str | None = None,
    department: str | None = None,
    page_size: int = 20,
    cursor: str | None = None,
) -> RMPProfessorPageOut:
    if department:
        query_lower = query.lower().strip() if query else None
        department_lower = department.lower().strip()
        professors = [
            professor
            for professor in _get_all_professors_for_school(school_id)
            if professor.department
            and professor.department.lower().strip() == department_lower
            and (not query_lower or query_lower in professor.name.lower())
        ]
        professors.sort(key=get_sortable_rating, reverse=True)

        return RMPProfessorPageOut(
            school_id=school_id,
            total=len(professors),
            page_size=len(professors),
            has_next_page=False,
            next_cursor=None,
            professors=professors,
        )

    try:
        with RMPClient() as client:
            result = client.list_professors_for_school(
                school_id,
                query=query or None,
                page_size=page_size,
                cursor=cursor or None,
            )
    except (HttpError, ParsingError, RMPAPIError, RetryError, RMPError) as exc:
        raise RMPClientServiceError(str(exc)) from exc

    return RMPProfessorPageOut(
        school_id=school_id,
        total=result.total,
        page_size=result.page_size,
        has_next_page=result.has_next_page,
        next_cursor=result.next_cursor,
        professors=[
            RMPProfessorOut(
                id=professor.id,
                profile_url=get_professor_profile_url(professor.id),
                name=professor.name,
                department=professor.department,
                overall_rating=professor.overall_rating,
                num_ratings=professor.num_ratings,
                percent_take_again=professor.percent_take_again,
                level_of_difficulty=professor.level_of_difficulty,
            )
            for professor in result.professors
        ],
    )


def get_sortable_rating(professor: RMPProfessorOut) -> float:
    if not professor.num_ratings or not professor.overall_rating:
        return -1

    return professor.overall_rating
