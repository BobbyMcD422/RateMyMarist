from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db import Base


class Professor(Base):
    __tablename__ = "professors"
    __table_args__ = (
        UniqueConstraint("name", "category", "source_url", name="uq_professor_source_identity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="Faculty", index=True)
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    rmp_score: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rmp_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_catalog_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
