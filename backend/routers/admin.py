from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import Instructor, InstructorRMPLink, RMPProfessorSnapshot
from backend.schemas import (
    InstructorRMPLinkOut,
    InstructorRMPLinkReview,
    RMPSyncResult,
    RegistrationSyncResult,
)
from backend.services.instructor_matching import review_instructor_link
from backend.services.rmp_client_service import RMPClientServiceError, sync_professors_for_school
from backend.services.registration_json_sync import RegistrationSyncError, sync_registration_json
from backend.services.registration_fetch_service import RegistrationFetchError, fetch_registration_snapshot


router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    if x_admin_token != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
        )


@router.post("/sync-rmp", response_model=RMPSyncResult, dependencies=[Depends(require_admin_token)])
def sync_rmp(db: Session = Depends(get_db)) -> RMPSyncResult:
    try:
        return sync_professors_for_school(db, settings.rmp_school_id)
    except RMPClientServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post(
    "/sync-registration-json",
    response_model=RegistrationSyncResult,
    dependencies=[Depends(require_admin_token)],
)
def sync_registration_snapshot(db: Session = Depends(get_db)) -> RegistrationSyncResult:
    try:
        return sync_registration_json(db, settings.registration_json_path)
    except RegistrationSyncError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post(
    "/sync-registration",
    response_model=RegistrationSyncResult,
    dependencies=[Depends(require_admin_token)],
)
def fetch_and_sync_registration(db: Session = Depends(get_db)) -> RegistrationSyncResult:
    try:
        snapshot_path = fetch_registration_snapshot()
        return sync_registration_json(db, str(snapshot_path))
    except RegistrationFetchError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except RegistrationSyncError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get(
    "/instructor-rmp-links",
    response_model=list[InstructorRMPLinkOut],
    dependencies=[Depends(require_admin_token)],
)
def list_instructor_rmp_links(
    match_status: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[InstructorRMPLinkOut]:
    statement = (
        select(InstructorRMPLink, Instructor, RMPProfessorSnapshot)
        .join(Instructor, Instructor.id == InstructorRMPLink.instructor_id)
        .join(RMPProfessorSnapshot, RMPProfessorSnapshot.id == InstructorRMPLink.rmp_professor_id)
        .order_by(InstructorRMPLink.match_status, Instructor.display_name)
    )
    if match_status:
        statement = statement.where(InstructorRMPLink.match_status == match_status)
    return [
        InstructorRMPLinkOut(
            instructor_id=instructor.id,
            instructor_name=instructor.display_name,
            instructor_email=instructor.email,
            rmp_professor_id=professor.id,
            rmp_name=professor.name,
            rmp_profile_url=professor.profile_url or f"https://www.ratemyprofessors.com/professor/{professor.rmp_id}",
            match_status=link.match_status,
            match_confidence=link.match_confidence,
            match_method=link.match_method,
            reviewed_at=link.reviewed_at,
        )
        for link, instructor, professor in db.execute(statement).all()
    ]


@router.put(
    "/instructor-rmp-links/{instructor_id}",
    response_model=InstructorRMPLinkOut,
    dependencies=[Depends(require_admin_token)],
)
def update_instructor_rmp_link(
    instructor_id: int,
    review: InstructorRMPLinkReview,
    db: Session = Depends(get_db),
) -> InstructorRMPLinkOut:
    instructor = db.get(Instructor, instructor_id)
    professor = db.get(RMPProfessorSnapshot, review.rmp_professor_id)
    if instructor is None or professor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instructor or RMP professor not found.")
    try:
        link = review_instructor_link(db, instructor.id, professor.id, review.match_status)
        db.commit()
        db.refresh(link)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That RMP professor is already linked to another instructor.",
        ) from exc
    return InstructorRMPLinkOut(
        instructor_id=instructor.id,
        instructor_name=instructor.display_name,
        instructor_email=instructor.email,
        rmp_professor_id=professor.id,
        rmp_name=professor.name,
        rmp_profile_url=professor.profile_url or f"https://www.ratemyprofessors.com/professor/{professor.rmp_id}",
        match_status=link.match_status,
        match_confidence=link.match_confidence,
        match_method=link.match_method,
        reviewed_at=link.reviewed_at,
    )
