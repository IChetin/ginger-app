"""Заявки, игроки, аккаунты, шаблоны реквизитов и инвайты в админке (менеджер и админ)."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.auth import User
from app.schemas.chips import (
    ChipRequestAdminRead,
    InviteCreate,
    InviteCreated,
    InviteRead,
    PendingAccountRead,
    PlayerAdminRead,
    PlayerAdminUpdate,
    ReferralRead,
    RejectBody,
    RequisitesBody,
    RequisiteTemplateCreate,
    RequisiteTemplateRead,
    RequisiteTemplateUpdate,
)
from app.services import chips as chips_service
from app.services import crm as crm_service
from app.services import invites as invites_service

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Manager = Annotated[User, Depends(get_current_user)]
Admin = Annotated[User, Depends(require_admin)]


@router.get("/chip-requests", response_model=list[ChipRequestAdminRead])
async def list_requests(
    db: Db,
    scope: Annotated[Literal["open", "all"], Query()] = "open",
) -> list[ChipRequestAdminRead]:
    return await chips_service.list_admin_requests(db, scope=scope)


@router.get("/chip-requests/{request_id}", response_model=ChipRequestAdminRead)
async def get_request(request_id: UUID, db: Db) -> ChipRequestAdminRead:
    return await chips_service.get_admin_request(db, request_id)


@router.get("/chip-requests/{request_id}/screenshot")
async def get_screenshot(request_id: UUID, db: Db) -> Response:
    data, content_type = await chips_service.admin_screenshot(db, request_id)
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "no-store"})


@router.post("/chip-requests/{request_id}/accept", response_model=ChipRequestAdminRead)
async def accept_request(request_id: UUID, actor: Manager, db: Db) -> ChipRequestAdminRead:
    return await chips_service.accept_request(db, actor, request_id)


@router.post("/chip-requests/{request_id}/requisites", response_model=ChipRequestAdminRead)
async def send_requisites(
    request_id: UUID, body: RequisitesBody, actor: Manager, db: Db
) -> ChipRequestAdminRead:
    return await chips_service.send_requisites(db, actor, request_id, body)


@router.post("/chip-requests/{request_id}/complete", response_model=ChipRequestAdminRead)
async def complete_request(request_id: UUID, actor: Manager, db: Db) -> ChipRequestAdminRead:
    return await chips_service.complete_request(db, actor, request_id)


@router.post("/chip-requests/{request_id}/reject", response_model=ChipRequestAdminRead)
async def reject_request(
    request_id: UUID, body: RejectBody, actor: Manager, db: Db
) -> ChipRequestAdminRead:
    return await chips_service.reject_request(db, actor, request_id, body)


@router.get("/requisite-templates", response_model=list[RequisiteTemplateRead])
async def list_templates(db: Db) -> list[RequisiteTemplateRead]:
    return await chips_service.list_templates(db)


@router.post(
    "/requisite-templates",
    response_model=RequisiteTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(body: RequisiteTemplateCreate, db: Db) -> RequisiteTemplateRead:
    return await chips_service.create_template(db, body)


@router.patch("/requisite-templates/{template_id}", response_model=RequisiteTemplateRead)
async def update_template(
    template_id: UUID, body: RequisiteTemplateUpdate, db: Db
) -> RequisiteTemplateRead:
    return await chips_service.update_template(db, template_id, body)


@router.get("/players", response_model=list[PlayerAdminRead])
async def list_players(db: Db) -> list[PlayerAdminRead]:
    """База игроков с активностью, «спящими» и днями рождения (ТЗ §9а.3)."""
    return await crm_service.list_players(db)


@router.patch("/players/{player_id}", response_model=PlayerAdminRead)
async def update_player(
    player_id: UUID, body: PlayerAdminUpdate, _: Admin, db: Db
) -> PlayerAdminRead:
    """Тип, блокировка, офлайн-доступ и карточка CRM — только админ (ТЗ §9а.1)."""
    return await crm_service.update_player(db, player_id, body)


@router.post("/players/{player_id}/referral/rotate", response_model=ReferralRead)
async def rotate_player_referral(player_id: UUID, _: Admin, db: Db) -> ReferralRead:
    """Перевыпуск личной ссылки игрока — когда она приостановлена или утекла."""
    return await chips_service.rotate_player_referral(db, player_id)


@router.get("/player-accounts/pending", response_model=list[PendingAccountRead])
async def list_pending_accounts(db: Db) -> list[PendingAccountRead]:
    return await chips_service.list_pending_accounts(db)


@router.post("/player-accounts/{account_id}/confirm", response_model=PendingAccountRead)
async def confirm_account(account_id: UUID, actor: Manager, db: Db) -> PendingAccountRead:
    return await chips_service.review_account(db, actor, account_id, approve=True)


@router.post("/player-accounts/{account_id}/reject", response_model=PendingAccountRead)
async def reject_account(account_id: UUID, actor: Manager, db: Db) -> PendingAccountRead:
    return await chips_service.review_account(db, actor, account_id, approve=False)


@router.get("/invites", response_model=list[InviteRead])
async def list_invites(db: Db) -> list[InviteRead]:
    return await invites_service.list_invites(db)


@router.post("/invites", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
async def create_invite(body: InviteCreate, actor: Manager, db: Db) -> InviteCreated:
    return await invites_service.create_invite(db, actor=actor, body=body)


@router.post("/invites/{invite_id}/revoke", response_model=InviteRead)
async def revoke_invite(invite_id: UUID, db: Db) -> InviteRead:
    return await invites_service.revoke_invite(db, invite_id)
