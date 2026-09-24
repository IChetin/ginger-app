"""Лента (этап 7, ТЗ E1): крупные турниры, вечер в каждом клубе и выигрыши игроков.

Турниры не хранятся в ленте отдельно — это выборка из расписания в момент запроса, поэтому
лента всегда совпадает с сеткой. Выигрыши и записи менеджера — своими таблицами.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.auth import User
from app.models.chips import Attachment
from app.models.clubs import Club
from app.models.feed import FeedPost, PlayerWin
from app.models.players import Player
from app.models.references import Currency
from app.schemas.feed import (
    FeedPostAdminRead,
    FeedPostCreate,
    FeedPostRead,
    FeedPostUpdate,
    FeedRead,
    WinClub,
    WinCreate,
    WinRead,
)
from app.schemas.tournaments import TournamentRead
from app.services import attachments
from app.services.tournaments.queries import DayPeriod, list_tournaments, period_of
from app.services.tournaments.schedule_sync import MSK

MAIN_EVENT_DAYS = 7
EVENING_LOOKAHEAD = timedelta(days=2)
WINS_LIMIT = 20
ANONYMOUS_NICKNAME = "Игрок клуба"


def _guarantee(item: TournamentRead) -> float:
    return float(item.guarantee_rub or 0)


async def main_events(session: AsyncSession, now: datetime) -> list[TournamentRead]:
    """Главное событие каждого дня — максимальная гарантия в рублях (вопрос 11.17)."""
    tournaments = await list_tournaments(
        session, starts_from=now, starts_to=now + timedelta(days=MAIN_EVENT_DAYS)
    )
    best: dict[date, TournamentRead] = {}
    for item in tournaments:
        if item.satellite_target or not item.guarantee_rub or item.starts_at < now:
            continue
        day = item.starts_at.astimezone(MSK).date()
        current = best.get(day)
        if current is None or (_guarantee(item), -item.starts_at.timestamp()) > (
            _guarantee(current),
            -current.starts_at.timestamp(),
        ):
            best[day] = item
    return [best[day] for day in sorted(best)]


async def evening_by_club(session: AsyncSession, now: datetime) -> list[TournamentRead]:
    """Хотя бы один вечерний турнир (18:00–22:00 МСК) из каждого клуба.

    Берём ближайший вечер, в который у клуба есть турниры, и в нём — крупнейшую гарантию.
    Уже идущий турнир с открытой поздней регистрацией тоже подходит: на него ещё можно сесть.
    """
    tournaments = await list_tournaments(
        session, starts_from=now, starts_to=now + EVENING_LOOKAHEAD
    )
    by_club: dict[UUID, TournamentRead] = {}
    for item in tournaments:
        if item.satellite_target or period_of(item.starts_at) != DayPeriod.EVENING:
            continue
        current = by_club.get(item.club.id)
        if current is None:
            by_club[item.club.id] = item
            continue
        item_day = item.starts_at.astimezone(MSK).date()
        current_day = current.starts_at.astimezone(MSK).date()
        if item_day < current_day or (
            item_day == current_day and _guarantee(item) > _guarantee(current)
        ):
            by_club[item.club.id] = item
    return sorted(by_club.values(), key=lambda item: (item.starts_at, item.club.name))


def _win_read(win: PlayerWin, *, public: bool) -> WinRead:
    nickname = win.player_nickname
    if public and win.player is not None and not win.player.results_consent:
        nickname = ANONYMOUS_NICKNAME
    return WinRead(
        id=win.id,
        player_nickname=nickname,
        club=WinClub(id=win.club.id, name=win.club.name, app=win.club.app) if win.club else None,
        tournament_name=win.tournament_name,
        place=win.place,
        prize_amount=win.prize_amount,
        currency_code=win.currency_code,
        currency_symbol=win.currency.symbol if win.currency else None,
        won_on=win.won_on,
    )


async def list_wins(
    session: AsyncSession, *, public: bool, limit: int = WINS_LIMIT
) -> list[WinRead]:
    wins = await session.scalars(
        select(PlayerWin)
        .options(
            selectinload(PlayerWin.player),
            selectinload(PlayerWin.club),
            selectinload(PlayerWin.currency),
        )
        .order_by(PlayerWin.won_on.desc(), PlayerWin.created_at.desc())
        .limit(limit)
    )
    return [_win_read(win, public=public) for win in wins]


async def get_feed(session: AsyncSession, now: datetime | None = None) -> FeedRead:
    moment = now or datetime.now(UTC)
    return FeedRead(
        posts=await list_posts(session, now=moment),
        main_events=await main_events(session, moment),
        evening=await evening_by_club(session, moment),
        wins=await list_wins(session, public=True),
    )


async def create_win(session: AsyncSession, actor: User, body: WinCreate) -> WinRead:
    if await session.get(Currency, body.currency_code) is None:
        raise AppError("unknown_currency", "Неизвестная валюта", 422)
    if body.club_id is not None and await session.get(Club, body.club_id) is None:
        raise AppError("club_not_found", "Клуб не найден", 404)
    if body.player_id is not None and await session.get(Player, body.player_id) is None:
        raise AppError("player_not_found", "Игрок не найден", 404)
    win = PlayerWin(
        player_id=body.player_id,
        player_nickname=body.player_nickname,
        club_id=body.club_id,
        tournament_name=body.tournament_name,
        place=body.place,
        prize_amount=body.prize_amount,
        currency_code=body.currency_code,
        won_on=body.won_on or datetime.now(MSK).date(),
        created_by_user_id=actor.id,
    )
    session.add(win)
    await session.flush()
    await session.refresh(win, attribute_names=["player", "club", "currency"])
    return _win_read(win, public=False)


async def delete_win(session: AsyncSession, win_id: UUID) -> None:
    win = await session.get(PlayerWin, win_id)
    if win is None:
        raise AppError("win_not_found", "Запись не найдена", 404)
    await session.delete(win)
    await session.flush()


POST_IMAGE_PURPOSE = "feed_post"
POSTS_LIMIT = 5
ADMIN_POSTS_LIMIT = 100


def _post_club(post: FeedPost) -> WinClub | None:
    return WinClub(id=post.club.id, name=post.club.name, app=post.club.app) if post.club else None


def _post_read(post: FeedPost) -> FeedPostRead:
    return FeedPostRead(
        id=post.id,
        title=post.title,
        body=post.body,
        image_url=f"/api/v1/feed/posts/{post.id}/image" if post.image_attachment_id else None,
        link_url=post.link_url,
        link_label=post.link_label,
        club=_post_club(post),
        is_pinned=post.is_pinned,
        published_at=post.published_at,
        expires_at=post.expires_at,
    )


def _post_admin_read(post: FeedPost, author: str | None) -> FeedPostAdminRead:
    return FeedPostAdminRead(
        **_post_read(post).model_dump(),
        author_nickname=author,
        created_at=post.created_at,
    )


async def list_posts(
    session: AsyncSession, *, now: datetime | None = None, limit: int = POSTS_LIMIT
) -> list[FeedPostRead]:
    """Записи в ленте: опубликованные, не просроченные; закреплённые — сверху."""
    moment = now or datetime.now(UTC)
    posts = await session.scalars(
        select(FeedPost)
        .options(selectinload(FeedPost.club))
        .where(
            FeedPost.published_at <= moment,
            or_(FeedPost.expires_at.is_(None), FeedPost.expires_at > moment),
        )
        .order_by(FeedPost.is_pinned.desc(), FeedPost.published_at.desc())
        .limit(limit)
    )
    return [_post_read(post) for post in posts]


async def list_admin_posts(
    session: AsyncSession, limit: int = ADMIN_POSTS_LIMIT
) -> list[FeedPostAdminRead]:
    """Все записи, включая отложенные и просроченные — менеджеру видно расписание ленты."""
    rows = await session.execute(
        select(FeedPost, User.nickname)
        .options(selectinload(FeedPost.club))
        .outerjoin(User, User.id == FeedPost.created_by_user_id)
        .order_by(FeedPost.is_pinned.desc(), FeedPost.published_at.desc())
        .limit(limit)
    )
    return [_post_admin_read(post, author) for post, author in rows.tuples()]


async def _load_post(session: AsyncSession, post_id: UUID) -> FeedPost:
    post = await session.scalar(
        select(FeedPost).options(selectinload(FeedPost.club)).where(FeedPost.id == post_id)
    )
    if post is None:
        raise AppError("post_not_found", "Запись не найдена", 404)
    return post


async def _check_club(session: AsyncSession, club_id: UUID | None) -> None:
    if club_id is not None and await session.get(Club, club_id) is None:
        raise AppError("club_not_found", "Клуб не найден", 404)


async def create_post(
    session: AsyncSession, actor: User, body: FeedPostCreate, *, now: datetime | None = None
) -> FeedPostAdminRead:
    await _check_club(session, body.club_id)
    post = FeedPost(
        title=body.title,
        body=body.body,
        link_url=body.link_url,
        link_label=body.link_label,
        club_id=body.club_id,
        is_pinned=body.is_pinned,
        published_at=body.published_at or now or datetime.now(UTC),
        expires_at=body.expires_at,
        created_by_user_id=actor.id,
    )
    session.add(post)
    await session.flush()
    await session.refresh(post, attribute_names=["club", "created_at"])
    return _post_admin_read(post, actor.nickname)


async def update_post(
    session: AsyncSession, post_id: UUID, body: FeedPostUpdate
) -> FeedPostAdminRead:
    post = await _load_post(session, post_id)
    await _check_club(session, body.club_id)
    post.title = body.title
    post.body = body.body
    post.link_url = body.link_url
    post.link_label = body.link_label
    post.club_id = body.club_id
    post.is_pinned = body.is_pinned
    if body.published_at is not None:
        post.published_at = body.published_at
    post.expires_at = body.expires_at
    await session.flush()
    await session.refresh(post, attribute_names=["club"])
    return _post_admin_read(post, None)


async def delete_post(session: AsyncSession, post_id: UUID) -> None:
    post = await _load_post(session, post_id)
    image = await _post_image(session, post)
    await session.delete(post)
    await session.flush()
    if image is not None:
        await attachments.remove(session, image)


async def _post_image(session: AsyncSession, post: FeedPost) -> Attachment | None:
    if post.image_attachment_id is None:
        return None
    return await session.get(Attachment, post.image_attachment_id)


async def set_post_image(
    session: AsyncSession,
    actor: User,
    post_id: UUID,
    *,
    data: bytes,
    content_type: str | None,
) -> FeedPostAdminRead:
    """Картинка записи — афиша: старая удаляется, чтобы диск не зарастал."""
    post = await _load_post(session, post_id)
    previous = await _post_image(session, post)
    attachment = await attachments.save_image(
        session,
        owner_user_id=actor.id,
        purpose=POST_IMAGE_PURPOSE,
        data=data,
        content_type=content_type,
    )
    post.image_attachment_id = attachment.id
    await session.flush()
    if previous is not None:
        await attachments.remove(session, previous)
    await session.refresh(post, attribute_names=["club"])
    return _post_admin_read(post, None)


async def clear_post_image(session: AsyncSession, post_id: UUID) -> FeedPostAdminRead:
    post = await _load_post(session, post_id)
    previous = await _post_image(session, post)
    post.image_attachment_id = None
    await session.flush()
    if previous is not None:
        await attachments.remove(session, previous)
    return _post_admin_read(post, None)


async def post_image(session: AsyncSession, post_id: UUID) -> tuple[bytes, str]:
    """Картинка записи открыта всем: лента — витрина клуба, её видит и гость."""
    post = await _load_post(session, post_id)
    image = await _post_image(session, post)
    if image is None:
        raise AppError("image_not_found", "У записи нет картинки", 404)
    return attachments.read_bytes(image), image.content_type
