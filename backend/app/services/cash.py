"""Кэш-столы: вечерний сборщик присылает список столов клуба, игрок видит, где идёт игра.

Решение Ивана 15.09: сборщик смотрит только экран списка столов, в стол заходит лишь за
диплинком PPPoker. Стол — снимок, а не расписание: пропал из лобби — закрыт.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.cash import CashTable
from app.models.clubs import Club
from app.models.collector import CollectorRun, CollectorSnapshot
from app.models.enums import ClubBlock, CollectorRunKind, CollectorRunStatus
from app.schemas.cash import CashSnapshotIn, CashSnapshotResult, CashTableRead
from app.schemas.tournaments import TournamentClub
from app.services.clubs import rub_per_chip

# Проход раз в 15–20 минут: стол, не виденный 45 минут, пропустил два прохода подряд —
# сборщик сломался или вечер кончился. Устаревшее игроку не показываем.
FRESH_FOR = timedelta(minutes=45)

_FIELDS = (
    "name",
    "game_type",
    "small_blind",
    "big_blind",
    "ante",
    "table_size",
    "seated",
    "waiting",
    "min_buyin",
    "max_buyin",
    "app_link",
)


async def ingest_cash_snapshot(
    session: AsyncSession, run_id: uuid.UUID, body: CashSnapshotIn
) -> CashSnapshotResult:
    run = await session.get(CollectorRun, run_id)
    if run is None:
        raise NotFoundError("Проход сборщика не найден")
    if run.status is not CollectorRunStatus.RUNNING:
        raise AppError("run_finished", "Проход уже завершён", 409)
    if run.kind is not CollectorRunKind.CASH:
        raise AppError("run_kind_mismatch", "Столы присылаются в проходе вида cash", 422)
    club = await session.scalar(select(Club).where(Club.slug == body.club_slug))
    if club is None:
        raise NotFoundError("Клуб не найден")
    if club.app is not run.app:
        raise AppError("club_app_mismatch", "Клуб из другого приложения", 422)

    now = datetime.now(UTC)
    session.add(
        CollectorSnapshot(
            run_id=run.id,
            club_id=club.id,
            captured_at=now,
            window_from=now,
            window_to=now,
            payload={"tables": [table.model_dump(mode="json") for table in body.tables]},
            summary={},
        )
    )

    existing = {
        table.table_key: table
        for table in await session.scalars(select(CashTable).where(CashTable.club_id == club.id))
    }
    result = CashSnapshotResult()
    for incoming in body.tables:
        values = incoming.model_dump(include=set(_FIELDS))
        table = existing.pop(incoming.table_key, None)
        if table is None:
            session.add(
                CashTable(
                    club_id=club.id,
                    table_key=incoming.table_key,
                    first_seen_at=now,
                    seen_at=now,
                    **values,
                )
            )
            result.added += 1
            continue
        # За диплинком сборщик заходит в стол не каждый проход — пустая ссылка известную не стирает.
        if values["app_link"] is None:
            values.pop("app_link")
        for field, value in values.items():
            setattr(table, field, value)
        table.seen_at = now
        result.updated += 1

    if existing:
        await session.execute(
            delete(CashTable).where(CashTable.id.in_([table.id for table in existing.values()]))
        )
        result.closed = len(existing)

    run.stats = {**run.stats, "snapshots": int(run.stats.get("snapshots", 0)) + 1}
    await session.flush()
    return result


def _to_rub(chips: Decimal, rate: Decimal | None) -> Decimal | None:
    return None if rate is None else (chips * rate).quantize(Decimal("1"))


async def list_cash_tables(session: AsyncSession, *, now: datetime) -> list[CashTableRead]:
    tables = list(
        await session.scalars(
            select(CashTable)
            .join(Club, Club.id == CashTable.club_id)
            .options(selectinload(CashTable.club).selectinload(Club.chip_currency))
            .where(
                CashTable.seen_at >= now - FRESH_FOR,
                Club.is_visible.is_(True),
                Club.block == ClubBlock.ONLINE,
            )
            .order_by(Club.sort_order, CashTable.big_blind, CashTable.name)
        )
    )
    clubs = list({table.club_id: table.club for table in tables}.values())
    rates = await rub_per_chip(session, clubs)
    return [
        CashTableRead(
            id=table.id,
            club=TournamentClub(
                id=table.club.id,
                name=table.club.name,
                slug=table.club.slug,
                app=table.club.app,
                app_club_id=table.club.app_club_id,
                chip_value=table.club.chip_value,
                chip_currency_code=table.club.chip_currency_code,
                currency_symbol=table.club.chip_currency.symbol
                if table.club.chip_currency
                else None,
            ),
            seen_at=table.seen_at,
            big_blind_rub=_to_rub(table.big_blind, rates.get(table.club_id)),
            **{field: getattr(table, field) for field in _FIELDS},
        )
        for table in tables
    ]
