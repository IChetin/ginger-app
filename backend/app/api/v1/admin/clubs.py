from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.exceptions import NotFoundError
from app.models.auth import User
from app.models.tournaments import TournamentTemplate
from app.schemas.clubs import ClubAdminRead, ClubAdminUpdate, ManualRateRead, ManualRateUpdate
from app.schemas.tournaments import TemplateDeleteResult, TemplateRead, TemplatesImportResult
from app.services import clubs as clubs_service
from app.services.tournaments.imports import import_club_templates
from app.services.tournaments.schedule_sync import delete_template

router = APIRouter()


@router.get("/clubs", response_model=list[ClubAdminRead])
async def list_clubs(db: Annotated[AsyncSession, Depends(get_db)]) -> list[ClubAdminRead]:
    return await clubs_service.list_admin_clubs(db)


@router.patch("/clubs/{club_id}", response_model=ClubAdminRead)
async def update_club(
    club_id: UUID,
    body: ClubAdminUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> ClubAdminRead:
    return await clubs_service.update_club(db, club_id, body)


@router.get("/clubs/{club_id}/templates", response_model=list[TemplateRead])
async def list_templates(
    club_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TemplateRead]:
    await clubs_service.get_club(db, club_id)
    templates = await db.scalars(
        select(TournamentTemplate)
        .where(TournamentTemplate.club_id == club_id)
        .order_by(TournamentTemplate.start_time, TournamentTemplate.name)
    )
    return [TemplateRead.model_validate(item) for item in templates]


@router.delete("/clubs/{club_id}/templates/{template_id}", response_model=TemplateDeleteResult)
async def remove_template(
    club_id: UUID,
    template_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TemplateDeleteResult:
    """Убрать турнир из сетки — например, отменённый турнир месяца, которого нет в новом файле."""
    deleted = await delete_template(db, club_id, template_id)
    if deleted is None:
        raise NotFoundError("Турнир в сетке клуба не найден")
    return TemplateDeleteResult(tournaments_deleted=deleted)


@router.post("/clubs/{club_id}/templates/import", response_model=TemplatesImportResult)
async def import_templates(
    club_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
    dry_run: Annotated[bool, Form()] = True,
) -> TemplatesImportResult:
    """Сетка клуба из файла союза. По умолчанию — предпросмотр: изменения посчитаны и откатаны."""
    return await import_club_templates(db, club_id, await file.read(), dry_run=dry_run)


@router.put("/rates/{currency_code}", response_model=ManualRateRead)
async def set_manual_rate(
    currency_code: str,
    body: ManualRateUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> ManualRateRead:
    return await clubs_service.set_manual_rate(db, currency_code, body.rate_rub)
