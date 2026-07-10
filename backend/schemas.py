from datetime import datetime

from pydantic import BaseModel


class RMPProfessorOut(BaseModel):
    id: str
    profile_url: str
    name: str
    department: str | None
    overall_rating: float | None
    num_ratings: int | None
    percent_take_again: float | None
    level_of_difficulty: float | None


class RMPProfessorPageOut(BaseModel):
    school_id: int
    total: int
    page_size: int
    has_next_page: bool
    next_cursor: str | None
    professors: list[RMPProfessorOut]


class RMPDepartmentOut(BaseModel):
    name: str
    count: int


class RMPSyncResult(BaseModel):
    school_id: int
    fetched: int
    inserted: int
    updated: int
    unchanged: int
    deleted: int
    synced_at: datetime


class RegistrationSyncResult(BaseModel):
    term: str
    term_description: str
    source_path: str
    fetched: int
    courses_inserted: int
    courses_updated: int
    instructors_inserted: int
    instructors_updated: int
    sections_inserted: int
    sections_updated: int
    sections_unchanged: int
    sections_deactivated: int
    links_inserted: int
    links_updated: int
    links_deleted: int
    links_skipped: int
    synced_at: datetime


class SectionInstructorOut(BaseModel):
    id: int
    banner_id: str
    display_name: str
    email: str | None
    primary_indicator: bool | None


class CourseSectionOut(BaseModel):
    id: int
    term: str
    crn: str
    course_id: int
    subject: str
    course_number: str
    course_title: str
    title: str
    enrollment: int | None
    seats_available: int | None
    instructors: list[SectionInstructorOut]


class CourseSectionPageOut(BaseModel):
    total: int
    limit: int
    offset: int
    sections: list[CourseSectionOut]


class TermOptionOut(BaseModel):
    code: str
    description: str


class CourseDirectoryOptionsOut(BaseModel):
    terms: list[TermOptionOut]
    subjects: list[str]
