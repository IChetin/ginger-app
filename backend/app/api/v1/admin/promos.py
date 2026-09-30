"""Акции клубов: черновик из текста поста или картинки, правка и публикация."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.promos import PromotionAdminRead, PromotionFromText, PromotionWrite
from app.services import promos as promo_service

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Manager = Annotated[User, Depends(get_current_user)]


@router.get("/promos", response_model=list[PromotionAdminRead])
async def list_promos(db: Db) -> list[PromotionAdminRead]:
    return await promo_service.list_admin(db)


@router.post("/promos", response_model=PromotionAdminRead, status_code=201)
async def create_promo(body: PromotionWrite, actor: Manager, db: Db) -> PromotionAdminRead:
    return await promo_service.create(db, actor, body)


@router.post("/promos/from-text", response_model=PromotionAdminRead, status_code=201)
async def promo_from_text(body: PromotionFromText, actor: Manager, db: Db) -> PromotionAdminRead:
    return await promo_service.create_from_text(db, actor, body.text)


@router.post("/promos/from-image", response_model=PromotionAdminRead, status_code=201)
async def promo_from_image(
    actor: Manager, db: Db, file: Annotated[UploadFile, File()]
) -> PromotionAdminRead:
    return await promo_service.create_from_image(
        db, actor, data=await file.read(), content_type=file.content_type
    )


@router.put("/promos/{promo_id}", response_model=PromotionAdminRead)
async def update_promo(promo_id: UUID, body: PromotionWrite, db: Db) -> PromotionAdminRead:
    return await promo_service.update(db, promo_id, body)


@router.delete("/promos/{promo_id}", status_code=204)
async def delete_promo(promo_id: UUID, db: Db) -> Response:
    await promo_service.delete(db, promo_id)
    return Response(status_code=204)


@router.post("/promos/{promo_id}/image", response_model=PromotionAdminRead)
async def upload_image(
    promo_id: UUID, actor: Manager, db: Db, file: Annotated[UploadFile, File()]
) -> PromotionAdminRead:
    return await promo_service.set_image(
        db, actor, promo_id, data=await file.read(), content_type=file.content_type
    )


@router.delete("/promos/{promo_id}/image", response_model=PromotionAdminRead)
async def delete_image(promo_id: UUID, db: Db) -> PromotionAdminRead:
    return await promo_service.clear_image(db, promo_id)
