from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import ScheduleViewer
from app.schemas.feed import FeedRead
from app.services import feed as feed_service
from app.services.tournaments.guest import tournaments_for_guest

router = APIRouter(tags=["feed"])


@router.get("/feed", response_model=FeedRead)
async def get_feed(
    db: Annotated[AsyncSession, Depends(get_db)], viewer: ScheduleViewer
) -> FeedRead:
    """Лента открыта без входа — витрина клуба; гостю турниры без деталей (решение 15.09)."""
    feed = await feed_service.get_feed(db)
    if viewer is not None:
        return feed
    return feed.model_copy(
        update={
            "main_events": tournaments_for_guest(feed.main_events),
            "evening": tournaments_for_guest(feed.evening),
        }
    )
