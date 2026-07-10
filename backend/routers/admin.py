from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.schemas import RMPSyncResult, SyncResult
from backend.services.marist_catalog_scraper import CatalogSourceError, sync_faculty_catalog
from backend.services.rmp_client_service import RMPClientServiceError, sync_professors_for_school


router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    if x_admin_token != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
        )


@router.post("/sync-catalog", response_model=SyncResult, dependencies=[Depends(require_admin_token)])
def sync_catalog(db: Session = Depends(get_db)) -> SyncResult:
    try:
        result = sync_faculty_catalog(db)
    except CatalogSourceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return SyncResult(
        fetched=result.fetched,
        inserted=result.inserted,
        updated=result.updated,
        skipped=result.skipped,
    )


@router.post("/sync-rmp", response_model=RMPSyncResult, dependencies=[Depends(require_admin_token)])
def sync_rmp(db: Session = Depends(get_db)) -> RMPSyncResult:
    try:
        return sync_professors_for_school(db, settings.rmp_school_id)
    except RMPClientServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
