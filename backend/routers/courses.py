from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import AcademicTerm, Course, Instructor, InstructorRMPLink, RMPProfessorSnapshot, Section, SectionInstructor
from backend.schemas import (
    CourseDetailOut,
    CoursePageOut,
    CourseSectionOut,
    CourseSummaryOut,
    SectionInstructorOut,
)
from backend.services.term_labels import derive_term_description


router = APIRouter(prefix="/courses", tags=["courses"])


def resolve_term(db: Session, term: str | None) -> str | None:
    if term:
        return term
    return db.scalar(
        select(Section.term)
        .where(Section.is_active.is_(True))
        .distinct()
        .order_by(Section.term.desc())
        .limit(1)
    )


@router.get("", response_model=CoursePageOut)
def list_courses(
    q: str | None = Query(default=None),
    term: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CoursePageOut:
    selected_term = resolve_term(db, term)
    if selected_term is None:
        return CoursePageOut(total=0, limit=limit, offset=offset, courses=[])

    active_sections = [
        Section.course_id == Course.id,
        Section.term == selected_term,
        Section.is_active.is_(True),
    ]
    filters = [exists(select(1).select_from(Section).where(*active_sections))]
    if subject:
        filters.append(Course.subject == subject)
    if q:
        pattern = f"%{q.strip()}%"
        instructor_match = exists(
            select(1)
            .select_from(Section)
            .join(SectionInstructor, SectionInstructor.section_id == Section.id)
            .join(Instructor, Instructor.id == SectionInstructor.instructor_id)
            .where(
                Section.course_id == Course.id,
                Section.term == selected_term,
                Section.is_active.is_(True),
                Instructor.display_name.ilike(pattern),
            )
        )
        filters.append(
            or_(
                Course.subject.ilike(pattern),
                Course.course_number.ilike(pattern),
                Course.title.ilike(pattern),
                func.concat(Course.subject, " ", Course.course_number).ilike(pattern),
                instructor_match,
            )
        )

    section_count = (
        select(func.count(Section.id))
        .where(*active_sections)
        .correlate(Course)
        .scalar_subquery()
    )
    instructor_count = (
        select(func.count(func.distinct(SectionInstructor.instructor_id)))
        .select_from(Section)
        .join(SectionInstructor, SectionInstructor.section_id == Section.id)
        .where(*active_sections)
        .correlate(Course)
        .scalar_subquery()
    )
    total = db.scalar(select(func.count(Course.id)).where(*filters)) or 0
    rows = db.execute(
        select(Course, section_count.label("section_count"), instructor_count.label("instructor_count"))
        .where(*filters)
        .order_by(Course.subject, Course.course_number)
        .offset(offset)
        .limit(limit)
    ).all()
    return CoursePageOut(
        total=total,
        limit=limit,
        offset=offset,
        courses=[
            CourseSummaryOut(
                id=course.id,
                subject=course.subject,
                course_number=course.course_number,
                title=course.title,
                term=selected_term,
                section_count=sections,
                instructor_count=instructors,
            )
            for course, sections, instructors in rows
        ],
    )


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: int,
    term: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CourseDetailOut:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
    selected_term = resolve_term(db, term)
    if selected_term is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active course terms were found.")

    sections = list(
        db.scalars(
            select(Section)
            .where(
                Section.course_id == course.id,
                Section.term == selected_term,
                Section.is_active.is_(True),
            )
            .order_by(Section.crn)
        )
    )
    section_ids = [section.id for section in sections]
    instructors_by_section: dict[int, list[SectionInstructorOut]] = {
        section_id: [] for section_id in section_ids
    }
    if section_ids:
        rows = db.execute(
            select(SectionInstructor, Instructor, RMPProfessorSnapshot)
            .join(Instructor, Instructor.id == SectionInstructor.instructor_id)
            .outerjoin(
                InstructorRMPLink,
                and_(
                    InstructorRMPLink.instructor_id == Instructor.id,
                    InstructorRMPLink.match_status == "approved",
                ),
            )
            .outerjoin(RMPProfessorSnapshot, RMPProfessorSnapshot.id == InstructorRMPLink.rmp_professor_id)
            .where(SectionInstructor.section_id.in_(section_ids))
            .order_by(SectionInstructor.primary_indicator.desc().nullslast(), Instructor.display_name)
        ).all()
        for assignment, instructor, professor in rows:
            instructors_by_section[assignment.section_id].append(
                SectionInstructorOut(
                    id=instructor.id,
                    banner_id=instructor.banner_id,
                    display_name=instructor.display_name,
                    email=instructor.email,
                    primary_indicator=assignment.primary_indicator,
                    rmp_profile_url=professor.profile_url if professor else None,
                    rmp_overall_rating=professor.overall_rating if professor else None,
                    rmp_num_ratings=professor.num_ratings if professor else None,
                )
            )

    term_description = db.scalar(
        select(AcademicTerm.description).where(AcademicTerm.code == selected_term)
    ) or derive_term_description(selected_term)
    return CourseDetailOut(
        id=course.id,
        subject=course.subject,
        course_number=course.course_number,
        title=course.title,
        term=selected_term,
        term_description=term_description,
        sections=[
            CourseSectionOut(
                id=section.id,
                term=section.term,
                crn=section.crn,
                course_id=course.id,
                subject=course.subject,
                course_number=course.course_number,
                course_title=course.title,
                title=section.title,
                enrollment=section.enrollment,
                seats_available=section.seats_available,
                instructors=instructors_by_section[section.id],
            )
            for section in sections
        ],
    )
