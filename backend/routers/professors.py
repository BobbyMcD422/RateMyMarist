from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import Professor
from backend.schemas import ProfessorOut


router = APIRouter(prefix="/professors", tags=["professors"])


@router.get("", response_model=list[ProfessorOut])
def list_professors(
    q: str | None = Query(default=None, description="Search by professor name or title."),
    category: str | None = Query(default=None, description="Filter by Faculty or Emeriti Faculty."),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Professor]:
    statement = select(Professor)

    if q:
        pattern = f"%{q}%"
        statement = statement.where(Professor.name.ilike(pattern) | Professor.title.ilike(pattern))

    if category:
        statement = statement.where(Professor.category == category)

    statement = statement.order_by(Professor.name).offset(offset).limit(limit)
    return list(db.scalars(statement).all())
