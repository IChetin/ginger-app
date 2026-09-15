"""Editor's Pick: отбор турниров и кэш-лимитов для фильтра «★ Editor's Pick» на MTT и CASH.

Здесь только сами пики и сопоставление; флаги в выдачу проставляют списки турниров и кэша.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.cash import CashGame
from app.models.clubs import Club
from app.models.picks import EditorPick
from app.models.tournaments import Tournament
from app.schemas.picks import EditorPickAdminRead, EditorPickCreate, EditorPickUpdate, PickKind

# Горизонт счётчика «стартов за неделю» в админке: MTT-отбор обновляется раз в неделю.
MTT_HORIZON = timedelta(days=7)


def _norm(value: str | None) -> str:
    return re.sub(r"[^0-9a-zа-яё]+", "", (value or "").lower())


async def active_picks(session: AsyncSession, kind: PickKind) -> list[EditorPick]:
    return list(
        await session.scalars(
            select(EditorPick)
            .where(EditorPick.kind == kind, EditorPick.is_active.is_(True))
            .order_by(EditorPick.sort_order, EditorPick.created_at)
        )
    )


def match_tournament(picks: list[EditorPick], tournament: Tournament) -> EditorPick | None:
    names = {_norm(tournament.name), _norm(tournament.lobby_name)} - {""}
    for pick in picks:
        needle = _norm(pick.match)
        if pick.club_id == tournament.club_id and needle and any(needle in n for n in names):
            return pick
    return None


def match_cash(picks: list[EditorPick], game: CashGame) -> EditorPick | None:
    for pick in picks:
        if (
            pick.club_id == game.club_id
            and pick.game_type is game.game_type
            and (pick.big_blind is None or pick.big_blind == game.big_blind)
        ):
            return pick
    return None


async def list_admin_picks(session: AsyncSession, *, now: datetime) -> list[EditorPickAdminRead]:
    from app.services.cash import FRESH_FOR

    picks = list(
        await session.scalars(
            select(EditorPick)
            .options(selectinload(EditorPick.club))
            .order_by(EditorPick.kind, EditorPick.sort_order, EditorPick.created_at)
        )
    )
    club_ids = {pick.club_id for pick in picks}
    tournaments = (
        list(
            await session.scalars(
                select(Tournament).where(
                    Tournament.club_id.in_(club_ids),
                    Tournament.starts_at >= now,
                    Tournament.starts_at < now + MTT_HORIZON,
                )
            )
        )
        if club_ids
        else []
    )
    games = (
        list(
            await session.scalars(
                select(CashGame).where(
                    CashGame.club_id.in_(club_ids), CashGame.seen_at >= now - FRESH_FOR
                )
            )
        )
        if club_ids
        else []
    )

    def matched(pick: EditorPick) -> int:
        if pick.kind == "mtt":
            return sum(1 for item in tournaments if match_tournament([pick], item))
        return sum(game.tables for game in games if match_cash([pick], game))

    return [
        EditorPickAdminRead(
            id=pick.id,
            kind=pick.kind,  # type: ignore[arg-type]
            club_id=pick.club_id,
            club_name=pick.club.name,
            match=pick.match,
            game_type=pick.game_type,
            big_blind=pick.big_blind,
            note=pick.note,
            is_active=pick.is_active,
            sort_order=pick.sort_order,
            created_at=pick.created_at,
            matched_now=matched(pick),
        )
        for pick in picks
    ]


async def create_pick(session: AsyncSession, body: EditorPickCreate) -> uuid.UUID:
    if await session.get(Club, body.club_id) is None:
        raise NotFoundError("Клуб не найден")
    pick = EditorPick(
        kind=body.kind,
        club_id=body.club_id,
        match=body.match.strip() if body.match else None,
        game_type=body.game_type,
        big_blind=body.big_blind,
        note=(body.note or "").strip() or None,
        sort_order=body.sort_order,
    )
    session.add(pick)
    await session.flush()
    return pick.id


async def update_pick(session: AsyncSession, pick_id: uuid.UUID, body: EditorPickUpdate) -> None:
    pick = await session.get(EditorPick, pick_id)
    if pick is None:
        raise NotFoundError("Пик не найден")
    changes = body.model_dump(exclude_unset=True)
    if "note" in changes:
        pick.note = (changes["note"] or "").strip() or None
    if changes.get("is_active") is not None:
        pick.is_active = changes["is_active"]
    if changes.get("sort_order") is not None:
        pick.sort_order = changes["sort_order"]
    await session.flush()


async def delete_pick(session: AsyncSession, pick_id: uuid.UUID) -> None:
    pick = await session.get(EditorPick, pick_id)
    if pick is None:
        raise NotFoundError("Пик не найден")
    await session.delete(pick)
    await session.flush()
