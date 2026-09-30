from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.promos import PromotionRead
from app.services import promos as promo_service

router = APIRouter(tags=["promos"])


@router.get("/promos", response_model=list[PromotionRead])
async def list_promos(db: Annotated[AsyncSession, Depends(get_db)]) -> list[PromotionRead]:
    """Акции клубов плашками (Иван, 30.09): идущие и ближайшие. Открыто всем — витрина."""
    return await promo_service.list_public(db)


@router.get("/promos/{promo_id}/image")
async def promo_image(promo_id: UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> Response:
    data, content_type = await promo_service.promo_image(db, promo_id)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
