from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProfessorOut(BaseModel):
    id: int
    name: str
    title: str | None
    category: str
    rmp_score: str | None
    rmp_url: str | None
    updated_at: datetime
    last_catalog_sync_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class SyncResult(BaseModel):
    fetched: int
    inserted: int
    updated: int
    skipped: int


class RMPProfessorOut(BaseModel):
    id: str
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
