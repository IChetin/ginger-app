"""Editor's Pick: подборка турниров и столов от Ивана — плашка сверху MTT и CASH."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.clubs import Club
from app.models.picks import EditorPick
from app.schemas.cash import CashTableRead
from app.schemas.picks import (
    EditorPickAdminRead,
    EditorPickCreate,
    EditorPickRead,
    EditorPickUpdate,
    PickKind,
)
from app.schemas.tournaments import TournamentRead
from app.services.cash import list_cash_tables
from app.services.tournaments.queries import list_tournaments

# Турнир-пик показываем, если он стартует в ближайшую неделю: дальше — игроку не к спеху.
MTT_HORIZON = timedelta(days=7)


def _norm(value: str | None) -> str:
    return re.sub(r"[^0-9a-zа-яё]+", "", (value or "").lower())


def _tournament_matches(pick: EditorPick, item: TournamentRead) -> bool:
    needle = _norm(pick.match)
    return item.club.id == pick.club_id and any(
        needle in _norm(name) for name in (item.lobby_name, item.name)
    )


def _table_matches(pick: EditorPick, table: CashTableRead) -> bool:
    return table.club.id == pick.club_id and _norm(pick.match) in _norm(table.name)


async def _picks(session: AsyncSession, *, active_only: bool) -> list[EditorPick]:
    query = (
        select(EditorPick)
        .options(selectinload(EditorPick.club))
        .order_by(EditorPick.kind, EditorPick.sort_order, EditorPick.created_at)
    )
    if active_only:
        query = query.where(EditorPick.is_active.is_(True))
    return list(await session.scalars(query))


async def _candidates(
    session: AsyncSession, now: datetime, kinds: set[str]
) -> tuple[list[TournamentRead], list[CashTableRead]]:
    tournaments = (
        await list_tournaments(session, starts_from=now, starts_to=now + MTT_HORIZON)
        if "mtt" in kinds
        else []
    )
    tables = await list_cash_tables(session, now=now) if "cash" in kinds else []
    return tournaments, tables


async def list_public_picks(
    session: AsyncSession, *, kind: PickKind, now: datetime
) -> list[EditorPickRead]:
    picks = [pick for pick in await _picks(session, active_only=True) if pick.kind == kind]
    if not picks:
        return []
    tournaments, tables = await _candidates(session, now, {kind})
    result: list[EditorPickRead] = []
    for pick in picks:
        if kind == "mtt":
            # Выдача уже по времени старта — первый подходящий и есть ближайший.
            upcoming = next((t for t in tournaments if _tournament_matches(pick, t)), None)
            if upcoming is not None:
                result.append(
                    EditorPickRead(id=pick.id, kind="mtt", note=pick.note, tournament=upcoming)
                )
        else:
            matched = [table for table in tables if _table_matches(pick, table)]
            if matched:
                result.append(
                    EditorPickRead(id=pick.id, kind="cash", note=pick.note, tables=matched)
                )
    return result


async def list_admin_picks(session: AsyncSession, *, now: datetime) -> list[EditorPickAdminRead]:
    picks = await _picks(session, active_only=False)
    tournaments, tables = await _candidates(session, now, {pick.kind for pick in picks})
    return [
        EditorPickAdminRead(
            id=pick.id,
            kind=pick.kind,  # type: ignore[arg-type]
            club_id=pick.club_id,
            club_name=pick.club.name,
            match=pick.match,
            note=pick.note,
            is_active=pick.is_active,
            sort_order=pick.sort_order,
            created_at=pick.created_at,
            matched_now=sum(1 for t in tournaments if _tournament_matches(pick, t))
            if pick.kind == "mtt"
            else sum(1 for table in tables if _table_matches(pick, table)),
        )
        for pick in picks
    ]


async def create_pick(session: AsyncSession, body: EditorPickCreate) -> uuid.UUID:
    if await session.get(Club, body.club_id) is None:
        raise NotFoundError("Клуб не найден")
    pick = EditorPick(
        kind=body.kind,
        club_id=body.club_id,
        match=body.match.strip(),
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
    if "match" in changes and changes["match"] is not None:
        pick.match = changes["match"].strip()
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
