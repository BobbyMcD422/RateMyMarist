from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.schemas import RMPSyncResult, RegistrationSyncResult
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
