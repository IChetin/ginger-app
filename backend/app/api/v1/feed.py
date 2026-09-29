from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import ScheduleViewer
from app.schemas.feed import FeedPostRead, FeedRead, WinRead
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
            "majors": tournaments_for_guest(feed.majors),
            "evening": tournaments_for_guest(feed.evening),
            # У автозаписи тот же турнир — гостю без деталей, как в расписании.
            "posts": [
                post.model_copy(update={"tournament": tournaments_for_guest([post.tournament])[0]})
                if post.tournament
                else post
                for post in feed.posts
            ],
        }
    )


@router.get("/promotions", response_model=list[FeedPostRead])
async def get_promotions(
    db: Annotated[AsyncSession, Depends(get_db)], viewer: ScheduleViewer
) -> list[FeedPostRead]:
    """Акции клубов — третий раздел рядом с MTT и CASH (решение Ивана 29.09).

    Те же записи ленты, отмеченные акцией: гостю показываем целиком, деталей турниров
    в них нет, а скрывать условия клубов от него незачем — это витрина.
    """
    del viewer
    return await feed_service.list_posts(db, only_promo=True)


@router.get("/feed/wins", response_model=list[WinRead])
async def get_wins(db: Annotated[AsyncSession, Depends(get_db)]) -> list[WinRead]:
    """История по тапу на баннер: текущая и прошлая неделя, старше — неинтересно (Иван, 28.09).

    Открыта всем; ники без согласия на публикацию скрыты.
    """
    return await feed_service.recent_wins(db)


@router.get("/feed/posts/{post_id}/image")
async def get_post_image(post_id: UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> Response:
    """Афиша записи — часть витрины: открыта всем, кешируется на сутки."""
    data, content_type = await feed_service.post_image(db, post_id)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
