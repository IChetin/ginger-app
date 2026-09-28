"""Лента (этап 7, ТЗ E1): крупные турниры, вечер в каждом клубе и выигрыши игроков.

Турниры не хранятся в ленте отдельно — это выборка из расписания в момент запроса, поэтому
лента всегда совпадает с сеткой. Выигрыши и записи менеджера — своими таблицами.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import random
import re
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.auth import User
from app.models.chips import Attachment
from app.models.clubs import Club
from app.models.feed import FeedPost, PlayerWin
from app.models.players import Player
from app.models.references import Currency
from app.models.tournaments import Tournament
from app.schemas.feed import (
    FeedPostAdminRead,
    FeedPostCreate,
    FeedPostRead,
    FeedPostUpdate,
    FeedRead,
    WinClub,
    WinCreate,
    WinRead,
    WinsImportResult,
)
from app.schemas.tournaments import TournamentClub, TournamentRead
from app.services import attachments
from app.services.tournaments.queries import DayPeriod, list_tournaments, period_of
from app.services.tournaments.schedule_sync import MSK

logger = logging.getLogger(__name__)

EVENING_LOOKAHEAD = timedelta(days=2)
WINS_LIMIT = 20
# Баннер на главной крутит всю последнюю неделю (Иван, 28.09); потолок — на случай сбоя импорта.
WEEK_WINS_LIMIT = 200
# Полная история — по тапу на баннер.
HISTORY_WINS_LIMIT = 1000
ANONYMOUS_NICKNAME = "Игрок клуба"
# Автозаписи о турнирах выходят не раньше 10 утра — ночью их никто не читает.
AUTOPOST_MORNING = time(10, 0)
AUTOPOST_LEAD = timedelta(hours=1)


def _guarantee(item: TournamentRead) -> float:
    return float(item.guarantee_rub or 0)


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=MSK)


async def majors(session: AsyncSession, now: datetime) -> list[TournamentRead]:
    """Major на главной (Иван, 27.09): крупнейшая гарантия каждого клуба за сегодня.

    Идущий турнир с открытой поздней регистрацией ещё в списке. Когда сегодняшние все
    закрылись — показываем завтрашние, чтобы вечером главная не пустела.
    """
    today = now.astimezone(MSK).date()
    for offset in (0, 1):
        start = _day_start(today + timedelta(days=offset))
        items = await list_tournaments(
            session, starts_from=max(now, start), starts_to=start + timedelta(days=1)
        )
        found = [item for item in items if item.is_major]
        if found:
            return found
    return []


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
    session: AsyncSession,
    *,
    public: bool,
    limit: int = WINS_LIMIT,
    since: date | None = None,
) -> list[WinRead]:
    query = select(PlayerWin)
    if since is not None:
        query = query.where(PlayerWin.won_on >= since)
    wins = await session.scalars(
        query.options(
            selectinload(PlayerWin.player),
            selectinload(PlayerWin.club),
            selectinload(PlayerWin.currency),
        )
        .order_by(PlayerWin.won_on.desc(), PlayerWin.created_at.desc())
        .limit(limit)
    )
    return [_win_read(win, public=public) for win in wins]


async def latest_week_wins(session: AsyncSession) -> list[WinRead]:
    """Все выигрыши недели (пн–вс), в которую попал самый свежий, — для баннера на главной."""
    latest = await session.scalar(select(func.max(PlayerWin.won_on)))
    if latest is None:
        return []
    monday = latest - timedelta(days=latest.weekday())
    return await list_wins(session, public=True, limit=WEEK_WINS_LIMIT, since=monday)


async def get_feed(session: AsyncSession, now: datetime | None = None) -> FeedRead:
    moment = now or datetime.now(UTC)
    return FeedRead(
        posts=await list_posts(session, now=moment),
        majors=await majors(session, moment),
        evening=await evening_by_club(session, moment),
        wins=await latest_week_wins(session),
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


# CSV недели от «Текучки» (settlements/wins/wins-YYYY-WNN.csv); клуб ищем по имени, app не нужен.
WINS_CSV_COLUMNS = (
    "won_on",
    "club",
    "player_nickname",
    "tournament_name",
    "place",
    "prize_amount",
    "currency",
)
# Латиница, которую на экране не отличить от кириллицы: «молотoк» и «мoлоток» — один ник.
_HOMOGLYPHS = str.maketrans("aeopcxykm", "аеорсхукм")
_NON_WORD = re.compile(r"[\W_]+")


def _nickname_key(value: str) -> str:
    return value.strip().casefold().translate(_HOMOGLYPHS)


def _tournament_key(value: str) -> str:
    """Без эмодзи, пробелов и регистра: «🥊GRAND KNOCKOUT🥊» = «Grand Knockout»."""
    return _NON_WORD.sub("", value.casefold())


def _same_win(
    existing: PlayerWin, nickname: str, tournament: str, place: int | None, prize: Decimal
) -> bool:
    """Тот же выигрыш, занесённый руками: ник и турнир (или сумма, или место) либо место и сумма."""
    same_place = place is not None and existing.place == place
    same_prize = abs(existing.prize_amount - prize) < 1
    if _nickname_key(existing.player_nickname) == _nickname_key(nickname):
        same_tournament = _tournament_key(existing.tournament_name) == _tournament_key(tournament)
        return same_tournament or same_prize or same_place
    return same_place and same_prize


async def import_wins_csv(session: AsyncSession, actor: User, content: bytes) -> WinsImportResult:
    """Неделя из выгрузок (понедельник): дополняет то, что менеджер занёс руками, без дублей.

    Строку, которую не разобрать, пропускаем и называем в ответе — остальные загружаются.
    """
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError("bad_csv", "Файл не в UTF-8", 422) from exc
    reader = csv.DictReader(io.StringIO(text))
    missing = [column for column in WINS_CSV_COLUMNS if column not in (reader.fieldnames or [])]
    if missing:
        raise AppError("bad_csv", f"В файле нет колонок: {', '.join(missing)}", 422)

    clubs = {club.name.casefold(): club for club in await session.scalars(select(Club))}
    currencies = set(await session.scalars(select(Currency.code)))
    rows: list[PlayerWin] = []
    errors: list[str] = []
    for number, row in enumerate(reader, start=2):
        cell = {key: (row.get(key) or "").strip() for key in WINS_CSV_COLUMNS}
        try:
            won_on = date.fromisoformat(cell["won_on"])
            club = clubs.get(cell["club"].casefold())
            if club is None:
                raise ValueError(f"клуб «{cell['club']}» не найден")
            if not cell["player_nickname"] or not cell["tournament_name"]:
                raise ValueError("пустой ник или турнир")
            place = int(cell["place"]) if cell["place"] else None
            prize = Decimal(cell["prize_amount"].replace(",", "."))
            if prize <= 0:
                raise ValueError("приз должен быть больше нуля")
            currency = cell["currency"].upper()
            if currency not in currencies:
                raise ValueError(f"валюта «{currency}» неизвестна")
        except (ValueError, ArithmeticError) as exc:
            errors.append(f"строка {number}: {exc}")
            continue
        rows.append(
            PlayerWin(
                player_nickname=cell["player_nickname"][:64],
                club_id=club.id,
                tournament_name=cell["tournament_name"][:160],
                place=place,
                prize_amount=prize,
                currency_code=currency,
                won_on=won_on,
                created_by_user_id=actor.id,
            )
        )
    if not rows:
        return WinsImportResult(created=0, duplicates=0, errors=errors)

    first = min(row.won_on for row in rows)
    last = max(row.won_on for row in rows)
    known = list(
        await session.scalars(
            select(PlayerWin).where(PlayerWin.won_on >= first, PlayerWin.won_on <= last)
        )
    )
    created = duplicates = 0
    for win in rows:
        if any(
            other.won_on == win.won_on
            and other.club_id == win.club_id
            and _same_win(
                other, win.player_nickname, win.tournament_name, win.place, win.prize_amount
            )
            for other in known
        ):
            duplicates += 1
            continue
        session.add(win)
        known.append(win)
        created += 1
    await session.flush()
    return WinsImportResult(created=created, duplicates=duplicates, errors=errors)


POST_IMAGE_PURPOSE = "feed_post"
POSTS_LIMIT = 5
ADMIN_POSTS_LIMIT = 100


def _post_club(post: FeedPost) -> WinClub | None:
    return WinClub(id=post.club.id, name=post.club.name, app=post.club.app) if post.club else None


def _post_read(post: FeedPost, tournament: TournamentRead | None = None) -> FeedPostRead:
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
        auto_kind=post.auto_kind,
        tournament=tournament,
    )


async def _linked_tournaments(
    session: AsyncSession, posts: list[FeedPost]
) -> dict[UUID, TournamentRead]:
    """Турниры автозаписей в том же виде, что в расписании: тап открывает их карточку."""
    ids = {post.tournament_id for post in posts if post.tournament_id is not None}
    if not ids:
        return {}
    starts = list(await session.scalars(select(Tournament.starts_at).where(Tournament.id.in_(ids))))
    if not starts:
        return {}
    items = await list_tournaments(
        session,
        starts_from=min(starts) - timedelta(minutes=1),
        starts_to=max(starts) + timedelta(minutes=1),
    )
    return {item.id: item for item in items if item.id in ids}


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
    visible = list(posts)
    tournaments = await _linked_tournaments(session, visible)
    return [
        _post_read(post, tournaments.get(post.tournament_id) if post.tournament_id else None)
        for post in visible
    ]


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
    if post.tournament_id is not None:
        # Автозапись не удаляем, а снимаем с показа: иначе следующий проход создал бы её снова.
        post.expires_at = post.published_at
        await session.flush()
        return
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


# ---------------------------------------------------------------- автозаписи о турнирах


def _chips_money(amount: Decimal, club: TournamentClub) -> str:
    """«$16», «₽5 000» — как в расписании; без курса клуба — в фишках."""
    if club.chip_value is None:
        value, prefix, suffix = amount, "", " фиш."
    else:
        value, prefix, suffix = amount * club.chip_value, club.currency_symbol or "", ""
    number = f"{value.normalize():,f}".replace(",", " ")
    if "." in number:
        number = number.rstrip("0").rstrip(".")
    return f"{prefix}{number}{suffix}"


def _autopost_body(item: TournamentRead) -> str:
    start = item.starts_at.astimezone(MSK)
    parts = [
        item.club.name,
        f"старт {start:%H:%M} МСК",
        f"бай-ин {_chips_money(item.buyin, item.club)}",
    ]
    if item.guarantee:
        parts.append(f"гарантия {_chips_money(item.guarantee, item.club)}")
    body = " · ".join(parts)
    if item.editor_pick_note:
        body += f"\n{item.editor_pick_note}"
    return body


def _autopost(item: TournamentRead, kind: str, now: datetime) -> FeedPost:
    name = item.lobby_name or item.name
    morning = datetime.combine(now.astimezone(MSK).date(), AUTOPOST_MORNING, tzinfo=MSK)
    return FeedPost(
        title=f"★ {name}" if kind == "pick" else f"Major дня: {name}",
        body=_autopost_body(item),
        club_id=item.club.id,
        tournament_id=item.id,
        auto_kind=kind,
        is_pinned=False,
        # Утренний выпуск в 10:00, но ранний турнир — за час до старта, а поздно найденный — сразу.
        published_at=max(now, min(morning, item.starts_at - AUTOPOST_LEAD)),
        # Новости не исчезают (Иван, 27.09): старые уходят вниз и вытесняются свежими.
        expires_at=None,
    )


async def sync_auto_posts(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Новости сами (Иван, 27.09): каждый старт Editor's Pick за сегодня — отдельная запись.

    Если сегодня ни одного старта из подборки нет — одна запись о случайном Major дня.
    Выбор случайный, но стабильный в пределах дня: повторный проход не переигрывает его.
    Возвращает, сколько записей создано.
    """
    moment = now or datetime.now(UTC)
    today = moment.astimezone(MSK).date()
    today_start, tomorrow = _day_start(today), _day_start(today + timedelta(days=1))
    upcoming = await list_tournaments(session, starts_from=moment, starts_to=tomorrow)
    existing = set(
        await session.scalars(
            select(FeedPost.tournament_id).where(
                FeedPost.tournament_id.in_([item.id for item in upcoming])
            )
        )
    )
    created = 0
    picks = [item for item in upcoming if item.is_editor_pick]
    for item in picks:
        if item.id not in existing:
            session.add(_autopost(item, "pick", moment))
            created += 1
    if not picks:
        already = await session.scalar(
            select(FeedPost.id)
            .join(Tournament, Tournament.id == FeedPost.tournament_id)
            .where(Tournament.starts_at >= today_start, Tournament.starts_at < tomorrow)
            .limit(1)
        )
        candidates = sorted(
            (item for item in upcoming if item.is_major), key=lambda item: str(item.id)
        )
        if already is None and candidates:
            chosen = random.Random(today.isoformat()).choice(candidates)
            session.add(_autopost(chosen, "major", moment))
            created += 1
    if created:
        await session.flush()
    return created


async def run_autoposts_periodically(interval_seconds: int) -> None:
    from app.core.database import async_session_factory

    while True:
        try:
            async with async_session_factory() as session:
                created = await sync_auto_posts(session)
                await session.commit()
            if created:
                logger.info("feed autoposts: created=%s", created)
        except Exception:  # noqa: BLE001 — упавший проход не должен убивать цикл
            logger.exception("feed autoposts failed")
        await asyncio.sleep(interval_seconds)
