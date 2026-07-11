from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import AcademicTerm, Course, Instructor, InstructorRMPLink, RMPProfessorSnapshot, Section, SectionInstructor
from backend.schemas import (
    CourseDirectoryOptionsOut,
    CourseSectionOut,
    CourseSectionPageOut,
    SectionInstructorOut,
    TermOptionOut,
)
from backend.services.term_labels import derive_term_description


router = APIRouter(prefix="/sections", tags=["sections"])


@router.get("/options", response_model=CourseDirectoryOptionsOut)
def get_course_directory_options(
    term: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CourseDirectoryOptionsOut:
    term_rows = db.execute(
        select(Section.term, AcademicTerm.description)
        .outerjoin(AcademicTerm, AcademicTerm.code == Section.term)
        .where(Section.is_active.is_(True))
        .distinct()
        .order_by(Section.term.desc())
    ).all()
    terms = [
        TermOptionOut(code=code, description=description or derive_term_description(code))
        for code, description in term_rows
    ]
    subject_statement = (
        select(Course.subject)
        .join(Section, Section.course_id == Course.id)
        .where(Section.is_active.is_(True))
    )
    if term:
        subject_statement = subject_statement.where(Section.term == term)
    subjects = list(db.scalars(subject_statement.distinct().order_by(Course.subject)))
    return CourseDirectoryOptionsOut(terms=terms, subjects=subjects)


@router.get("", response_model=CourseSectionPageOut)
def list_course_sections(
    q: str | None = Query(default=None),
    term: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CourseSectionPageOut:
    filters = []
    if not include_inactive:
        filters.append(Section.is_active.is_(True))
    if term:
        filters.append(Section.term == term)
    if subject:
        filters.append(Course.subject == subject)
    if q:
        pattern = f"%{q.strip()}%"
        instructor_match = exists(
            select(1)
            .select_from(SectionInstructor)
            .join(Instructor, Instructor.id == SectionInstructor.instructor_id)
            .where(
                SectionInstructor.section_id == Section.id,
                Instructor.display_name.ilike(pattern),
            )
        )
        filters.append(
            or_(
                Course.subject.ilike(pattern),
                Course.course_number.ilike(pattern),
                func.concat(Course.subject, " ", Course.course_number).ilike(pattern),
                Section.title.ilike(pattern),
                Section.crn.ilike(pattern),
                instructor_match,
            )
        )

    total = db.scalar(
        select(func.count(Section.id))
        .select_from(Section)
        .join(Course, Course.id == Section.course_id)
        .where(*filters)
    ) or 0
    rows = db.execute(
        select(Section, Course)
        .join(Course, Course.id == Section.course_id)
        .where(*filters)
        .order_by(Course.subject, Course.course_number, Section.crn)
        .offset(offset)
        .limit(limit)
    ).all()

    section_ids = [section.id for section, _ in rows]
    instructors_by_section: dict[int, list[SectionInstructorOut]] = {
        section_id: [] for section_id in section_ids
    }
    if section_ids:
        instructor_rows = db.execute(
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
        for assignment, instructor, professor in instructor_rows:
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

    return CourseSectionPageOut(
        total=total,
        limit=limit,
        offset=offset,
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
            for section, course in rows
        ],
    )
