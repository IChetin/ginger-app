from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.admin_dashboard import AdminDashboardResponse
from app.services import admin_dashboard as dashboard_service

router = APIRouter(tags=["admin-dashboard"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def get_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminDashboardResponse:
    return await dashboard_service.get_dashboard(db)
