from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from backend.db import Base


class RMPProfessorSnapshot(Base):
    __tablename__ = "rmp_professor_snapshots"
    __table_args__ = (
        UniqueConstraint("school_id", "rmp_id", name="uq_rmp_snapshot_school_professor"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    school_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    rmp_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    overall_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_ratings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percent_take_again: Mapped[float | None] = mapped_column(Float, nullable=True)
    level_of_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Instructor(Base):
    __tablename__ = "instructors"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    banner_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("subject", "course_number", name="uq_course_subject_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    subject: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    course_number: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)


class AcademicTerm(Base):
    __tablename__ = "terms"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    description: Mapped[str] = mapped_column(String(100), nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (
        UniqueConstraint("term", "crn", name="uq_section_term_crn"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    term: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    crn: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    enrollment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seats_available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SectionInstructor(Base):
    __tablename__ = "section_instructors"

    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"),
        primary_key=True,
    )
    instructor_id: Mapped[int] = mapped_column(
        ForeignKey("instructors.id", ondelete="CASCADE"),
        primary_key=True,
    )
    primary_indicator: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
