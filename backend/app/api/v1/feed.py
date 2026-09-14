from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.feed import FeedRead
from app.services import feed as feed_service

router = APIRouter(tags=["feed"])


@router.get("/feed", response_model=FeedRead)
async def get_feed(db: Annotated[AsyncSession, Depends(get_db)]) -> FeedRead:
    """Лента открыта без входа, как и расписание: это витрина клуба."""
    return await feed_service.get_feed(db)
