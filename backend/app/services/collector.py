"""Сборщик лобби: телефон со скриптом обходит клубы и присылает, что видит (решение 15.09).

Турнир из лобби сопоставляется со стартом из сетки по времени (±5 минут) и имени или
бай-ину. Параметры турнира (стек, уровни, ребай, Early Bird…) и диплинк применяются сразу:
это уточнение, а не изменение расписания. Новый или пропавший турнир, другой бай-ин,
гарантия, формат, игра или имя — в очередь на решение человека в админке.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.clubs import Club
from app.models.collector import CollectorRun, CollectorSnapshot, TournamentChange
from app.models.enums import (
    BountyKind,
    CollectorRunStatus,
    GameType,
    TournamentChangeKind,
    TournamentChangeStatus,
    TournamentStatus,
)
from app.models.tournaments import Tournament, TournamentTemplate
from app.schemas.collector import (
    CollectedTournament,
    CollectorStatus,
    RunFinish,
    RunRead,
    RunStart,
    SnapshotIn,
    SnapshotResult,
    TournamentChangeRead,
)
from app.services.tournaments.late_reg import late_reg_close_offset

MATCH_TOLERANCE = timedelta(minutes=5)
# Уточняют турнир — применяются без человека.
DETAIL_FIELDS = (
    "start_stack",
    "level_minutes",
    "late_reg_levels",
    "table_size",
    "structure",
    "rebuy_cost",
    "rebuy_terms",
    "addon_cost",
    "addon_terms",
    "bounty_share",
    "early_bird_bonus",
    "early_bird_levels",
)
# Меняют то, что игрок видит в расписании, — только после решения человека.
CORE_FIELDS = ("buyin", "guarantee", "bounty_kind", "game_type")


def _norm(value: str | None) -> str:
    return re.sub(r"[^0-9a-zа-яё]+", "", (value or "").lower())


def _json(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    return value


def _same(ours: Any, lobby: Any) -> bool:
    if isinstance(ours, Decimal) or isinstance(lobby, Decimal):
        return ours is not None and lobby is not None and Decimal(ours) == Decimal(lobby)
    return bool(ours == lobby)


def _parse(field: str, value: Any) -> Any:
    if value is None:
        return None
    if field in ("buyin", "guarantee"):
        return Decimal(str(value))
    if field == "bounty_kind":
        return BountyKind(value)
    if field == "game_type":
        return GameType(value)
    return value


def _score(ours: Tournament, lobby: CollectedTournament) -> int:
    score = 0
    if _norm(lobby.name) in {_norm(ours.name), _norm(ours.lobby_name)} - {""}:
        score += 2
    if lobby.buyin is not None and _same(ours.buyin, lobby.buyin):
        score += 1
    return score


def _refresh_late_reg(tournament: Tournament, template: TournamentTemplate | None) -> None:
    if not tournament.late_reg_levels:
        return
    offset = late_reg_close_offset(
        tournament.starts_at.minute, tournament.late_reg_levels, tournament.level_minutes
    )
    if offset is None:
        return
    tournament.late_reg_closes_at = tournament.starts_at + timedelta(minutes=offset)
    if template is not None:
        template.late_reg_close_offset_min = offset


async def start_run(session: AsyncSession, body: RunStart) -> RunRead:
    run = CollectorRun(
        kind=body.kind,
        app=body.app,
        status=CollectorRunStatus.RUNNING,
        started_at=datetime.now(UTC),
        stats={},
    )
    session.add(run)
    await session.flush()
    return RunRead.model_validate(run)


async def _running(session: AsyncSession, run_id: uuid.UUID) -> CollectorRun:
    run = await session.get(CollectorRun, run_id)
    if run is None:
        raise NotFoundError("Проход сборщика не найден")
    if run.status is not CollectorRunStatus.RUNNING:
        raise AppError("run_finished", "Проход уже завершён", 409)
    return run


async def finish_run(session: AsyncSession, run_id: uuid.UUID, body: RunFinish) -> RunRead:
    run = await _running(session, run_id)
    run.status = CollectorRunStatus(body.status)
    run.error = body.error
    run.stats = {**run.stats, **body.stats}
    run.finished_at = datetime.now(UTC)
    await session.flush()
    return RunRead.model_validate(run)


async def _queue(
    session: AsyncSession,
    *,
    club_id: uuid.UUID,
    kind: TournamentChangeKind,
    starts_at: datetime,
    title: str,
    tournament_id: uuid.UUID | None,
    payload: dict[str, Any],
) -> bool:
    """Поставить расхождение в очередь. Уже ждущее — обновить; отклонённое то же самое
    не возвращать каждое утро. Возвращает True, если в очереди что-то появилось или
    обновилось."""
    query = select(TournamentChange).where(
        TournamentChange.club_id == club_id, TournamentChange.kind == kind
    )
    if tournament_id is not None:
        query = query.where(TournamentChange.tournament_id == tournament_id)
    else:
        query = query.where(
            TournamentChange.starts_at == starts_at, TournamentChange.title == title[:160]
        )
    existing = list(await session.scalars(query.order_by(TournamentChange.created_at.desc())))
    for change in existing:
        if change.status is TournamentChangeStatus.PENDING:
            change.payload = payload
            return True
        if kind is not TournamentChangeKind.CHANGED or change.payload == payload:
            return False
    session.add(
        TournamentChange(
            club_id=club_id,
            kind=kind,
            status=TournamentChangeStatus.PENDING,
            starts_at=starts_at,
            title=title[:160],
            tournament_id=tournament_id,
            payload=payload,
            created_at=datetime.now(UTC),
        )
    )
    return True


async def ingest_snapshot(
    session: AsyncSession, run_id: uuid.UUID, body: SnapshotIn
) -> SnapshotResult:
    run = await _running(session, run_id)
    club = await session.scalar(select(Club).where(Club.slug == body.club_slug))
    if club is None:
        raise NotFoundError("Клуб не найден")
    if club.app is not run.app:
        raise AppError("club_app_mismatch", "Клуб из другого приложения", 422)

    snapshot = CollectorSnapshot(
        run_id=run.id,
        club_id=club.id,
        captured_at=datetime.now(UTC),
        window_from=body.window_from,
        window_to=body.window_to,
        payload={"tournaments": [item.model_dump(mode="json") for item in body.tournaments]},
        summary={},
    )
    session.add(snapshot)

    ours = list(
        await session.scalars(
            select(Tournament)
            .options(selectinload(Tournament.template))
            .where(
                Tournament.club_id == club.id,
                Tournament.status == TournamentStatus.SCHEDULED,
                Tournament.starts_at >= body.window_from - MATCH_TOLERANCE,
                Tournament.starts_at <= body.window_to + MATCH_TOLERANCE,
            )
            .order_by(Tournament.starts_at)
        )
    )
    unmatched = {item.id: item for item in ours}
    result = SnapshotResult()

    for lobby in sorted(body.tournaments, key=lambda item: item.starts_at):
        candidates = [
            item
            for item in unmatched.values()
            if abs(item.starts_at - lobby.starts_at) <= MATCH_TOLERANCE
        ]
        best = max(
            candidates,
            key=lambda item: (
                _score(item, lobby),
                -abs((item.starts_at - lobby.starts_at).total_seconds()),
            ),
            default=None,
        )
        if best is None or _score(best, lobby) == 0:
            if await _queue(
                session,
                club_id=club.id,
                kind=TournamentChangeKind.NEW,
                starts_at=lobby.starts_at,
                title=lobby.name,
                tournament_id=None,
                payload=lobby.model_dump(mode="json"),
            ):
                result.new += 1
            continue

        del unmatched[best.id]
        result.matched += 1
        template = None if best.is_detached else best.template

        if lobby.app_link and lobby.app_link != best.app_link:
            best.app_link = lobby.app_link
            result.links_updated += 1

        touched = False
        for field in DETAIL_FIELDS:
            value = getattr(lobby, field)
            if value is None or _same(getattr(best, field), value):
                continue
            setattr(best, field, value)
            if template is not None:
                setattr(template, field, value)
            touched = True
        if touched:
            _refresh_late_reg(best, template)
            result.details_updated += 1

        diff: dict[str, Any] = {}
        for field in CORE_FIELDS:
            value = getattr(lobby, field)
            if value is not None and not _same(getattr(best, field), value):
                diff[field] = {"ours": _json(getattr(best, field)), "lobby": _json(value)}
        if _norm(lobby.name) not in {_norm(best.name), _norm(best.lobby_name)}:
            diff["lobby_name"] = {"ours": best.lobby_name or best.name, "lobby": lobby.name}
        if diff and await _queue(
            session,
            club_id=club.id,
            kind=TournamentChangeKind.CHANGED,
            starts_at=best.starts_at,
            title=best.lobby_name or best.name,
            tournament_id=best.id,
            payload=diff,
        ):
            result.changed += 1

    for item in unmatched.values():
        if not body.window_from <= item.starts_at <= body.window_to:
            continue
        if await _queue(
            session,
            club_id=club.id,
            kind=TournamentChangeKind.MISSING,
            starts_at=item.starts_at,
            title=item.lobby_name or item.name,
            tournament_id=item.id,
            payload={},
        ):
            result.missing += 1

    snapshot.summary = result.model_dump()
    run.stats = {**run.stats, "snapshots": int(run.stats.get("snapshots", 0)) + 1}
    await session.flush()
    return result


async def _change_read(session: AsyncSession, change: TournamentChange) -> TournamentChangeRead:
    club = await session.get(Club, change.club_id)
    assert club is not None
    return TournamentChangeRead(
        id=change.id,
        club_id=change.club_id,
        club_name=club.name,
        app=club.app,
        tournament_id=change.tournament_id,
        kind=change.kind,
        status=change.status,
        starts_at=change.starts_at,
        title=change.title,
        payload=change.payload,
        created_at=change.created_at,
    )


async def list_changes(
    session: AsyncSession, *, status: TournamentChangeStatus = TournamentChangeStatus.PENDING
) -> list[TournamentChangeRead]:
    changes = await session.scalars(
        select(TournamentChange)
        .where(TournamentChange.status == status)
        .order_by(TournamentChange.starts_at)
        .limit(300)
    )
    return [await _change_read(session, change) for change in changes]


async def _pending(session: AsyncSession, change_id: uuid.UUID) -> TournamentChange:
    change = await session.get(TournamentChange, change_id)
    if change is None:
        raise NotFoundError("Расхождение не найдено")
    if change.status is not TournamentChangeStatus.PENDING:
        raise AppError("change_resolved", "По этому расхождению уже решили", 409)
    return change


async def apply_change(
    session: AsyncSession, change_id: uuid.UUID, user: User
) -> TournamentChangeRead:
    change = await _pending(session, change_id)
    now = datetime.now(UTC)

    if change.kind is TournamentChangeKind.NEW:
        data = CollectedTournament.model_validate(change.payload)
        tournament = Tournament(
            club_id=change.club_id,
            template_id=None,
            is_detached=True,
            status=TournamentStatus.SCHEDULED,
            starts_at=data.starts_at,
            name=data.name,
            buyin=data.buyin or Decimal("0"),
            guarantee=data.guarantee,
            bounty_kind=data.bounty_kind or BountyKind.NONE,
            game_type=data.game_type or GameType.NLH,
            app_link=data.app_link,
            **{field: getattr(data, field) for field in DETAIL_FIELDS},
        )
        _refresh_late_reg(tournament, None)
        session.add(tournament)
        await session.flush()
        change.tournament_id = tournament.id

    elif change.kind is TournamentChangeKind.MISSING:
        missing = (
            await session.get(Tournament, change.tournament_id) if change.tournament_id else None
        )
        if missing is not None:
            missing.status = TournamentStatus.CANCELLED

    else:
        target = (
            await session.get(
                Tournament, change.tournament_id, options=[selectinload(Tournament.template)]
            )
            if change.tournament_id
            else None
        )
        if target is None:
            raise AppError("tournament_gone", "Турнира уже нет в расписании", 409)
        values = {field: _parse(field, diff["lobby"]) for field, diff in change.payload.items()}
        affected: list[Tournament | TournamentTemplate] = [target]
        if target.template is not None and not target.is_detached:
            affected.append(target.template)
            affected.extend(
                await session.scalars(
                    select(Tournament).where(
                        Tournament.template_id == target.template_id,
                        Tournament.is_detached.is_(False),
                        Tournament.starts_at > now,
                        Tournament.id != target.id,
                    )
                )
            )
        for item in affected:
            for field, value in values.items():
                setattr(item, field, value)

    change.status = TournamentChangeStatus.APPLIED
    change.resolved_at = now
    change.resolved_by_user_id = user.id
    await session.flush()
    return await _change_read(session, change)


async def dismiss_change(
    session: AsyncSession, change_id: uuid.UUID, user: User
) -> TournamentChangeRead:
    change = await _pending(session, change_id)
    change.status = TournamentChangeStatus.DISMISSED
    change.resolved_at = datetime.now(UTC)
    change.resolved_by_user_id = user.id
    await session.flush()
    return await _change_read(session, change)


async def collector_status(session: AsyncSession) -> CollectorStatus:
    recent = await session.scalars(
        select(CollectorRun).order_by(CollectorRun.started_at.desc()).limit(100)
    )
    latest: dict[tuple[str, str], CollectorRun] = {}
    for run in recent:
        latest.setdefault((run.app.value, run.kind.value), run)
    pending = await session.scalar(
        select(func.count())
        .select_from(TournamentChange)
        .where(TournamentChange.status == TournamentChangeStatus.PENDING)
    )
    return CollectorStatus(
        runs=[RunRead.model_validate(run) for run in latest.values()],
        pending_changes=int(pending or 0),
    )
