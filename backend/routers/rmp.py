from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.schemas import RMPDepartmentOut, RMPProfessorPageOut
from backend.services.rmp_client_service import (
    RMPClientServiceError,
    list_departments_for_school,
    list_professors_for_school,
    list_saved_departments,
    list_saved_professors,
)


router = APIRouter(prefix="/rmp", tags=["rmp"])


@router.get("/professors", response_model=RMPProfessorPageOut)
def list_rmp_professors(
    school_id: int = Query(default=settings.rmp_school_id, description="RateMyProfessors school ID."),
    q: str | None = Query(default=None, description="Optional RMP search query."),
    department: str | None = Query(default=None, description="Optional exact RMP department filter."),
    page_size: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, description="RMP pagination cursor."),
) -> RMPProfessorPageOut:
    try:
        return list_professors_for_school(
            school_id=school_id,
            query=q,
            department=department,
            page_size=page_size,
            cursor=cursor,
        )
    except RMPClientServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/departments", response_model=list[RMPDepartmentOut])
def list_rmp_departments(
    school_id: int = Query(default=settings.rmp_school_id, description="RateMyProfessors school ID."),
) -> list[RMPDepartmentOut]:
    try:
        return list_departments_for_school(school_id)
    except RMPClientServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/saved/professors", response_model=RMPProfessorPageOut)
def list_saved_rmp_professors(
    school_id: int = Query(default=settings.rmp_school_id),
    q: str | None = Query(default=None),
    department: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RMPProfessorPageOut:
    return list_saved_professors(db, school_id, q, department, limit, offset)


@router.get("/saved/departments", response_model=list[RMPDepartmentOut])
def list_saved_rmp_departments(
    school_id: int = Query(default=settings.rmp_school_id),
    db: Session = Depends(get_db),
) -> list[RMPDepartmentOut]:
    return list_saved_departments(db, school_id)
