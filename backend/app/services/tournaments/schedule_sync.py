"""Шаблоны сетки → конкретные старты.

Два шага, всегда в этом порядке:

1. `sync_club_templates` — привести шаблоны клуба из источника к свежему разбору.
2. `expand_templates` — развернуть активные шаблоны в `tournaments` на горизонт вперёд.

Устаревшие шаблоны удаляются только после разворачивания: к этому моменту их будущие старты
уже переехали в новые шаблоны или удалены, а прошедшие остаются как история.

Идентичность старта — (клуб, время, название). Поэтому, когда у субботы меняется гарантия и
она уходит в другой шаблон, это тот же старт с обновлёнными полями, а не удаление и создание.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TournamentStatus
from app.models.tournaments import Tournament, TournamentTemplate
from app.schemas.tournaments import TemplateDraft

# Время в расписании везде московское (ТЗ §8а.3): так его публикуют союзы и так его ждут игроки.
MSK = ZoneInfo("Europe/Moscow")
DEFAULT_HORIZON_DAYS = 14

# Поля, которые старт копирует из шаблона. Пароль и «продвигается» — тоже: их задают на шаблоне,
# а точечно правят на старте с пометкой is_detached.
COPIED_FIELDS: tuple[str, ...] = (
    "name",
    "game_type",
    "bounty_kind",
    "buyin",
    "guarantee",
    "rebuy_cost",
    "rebuy_terms",
    "addon_cost",
    "addon_terms",
    "start_stack",
    "table_size",
    "late_reg_levels",
    "level_minutes",
    "structure",
    "ticket_value",
    "satellite_target",
    "early_bird_players",
    "password",
    "is_promoted",
    "notes",
)

# Поля, по которым черновик сопоставляется с шаблоном при повторном импорте: всё, кроме дней.
_SIGNATURE_FIELDS: tuple[str, ...] = (
    *(name for name in COPIED_FIELDS if name not in {"password", "is_promoted"}),
    "start_time",
    "late_reg_close_offset_min",
    "valid_from",
    "valid_until",
    "month_week",
)


@dataclass
class TemplateSyncSummary:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    stale_template_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass
class ExpansionSummary:
    created: int = 0
    updated: int = 0
    deleted: int = 0
    detached_kept: int = 0


def template_kind(item: TemplateDraft | TournamentTemplate) -> str:
    """Часть сетки: еженедельная, турниры месяца или разовые даты.

    Файл заменяет только те части, строки которых в нём есть. Недельная сетка Poker21 без
    турниров месяца не удаляет турниры месяца, а файл с одними турнирами месяца не трогает
    недельную сетку.
    """
    if item.month_week is not None:
        return "monthly"
    if item.valid_from is not None and item.valid_from == item.valid_until:
        return "dated"
    return "weekly"


def _signature(item: TemplateDraft | TournamentTemplate) -> tuple[object, ...]:
    return tuple(getattr(item, name) for name in _SIGNATURE_FIELDS)


async def sync_club_templates(
    session: AsyncSession,
    club_id: uuid.UUID,
    drafts: list[TemplateDraft],
    *,
    source: str,
) -> TemplateSyncSummary:
    """Шаблоны клуба с этим `source` приводятся к `drafts`.

    Шаблоны, заведённые руками (source IS NULL) или другим источником, не трогаются. Из шаблонов
    источника устаревшими считаются только части сетки, которые есть в файле (template_kind).
    Устаревшие не удаляются здесь, а возвращаются в `stale_template_ids` — удалить их нужно
    после `expand_templates` (см. `apply_templates_import`).
    """
    existing = list(
        await session.scalars(
            select(TournamentTemplate).where(
                TournamentTemplate.club_id == club_id,
                TournamentTemplate.source == source,
            )
        )
    )
    by_signature: dict[tuple[object, ...], TournamentTemplate] = {}
    stale: list[TournamentTemplate] = []
    for template in existing:
        key = _signature(template)
        if key in by_signature:
            stale.append(template)
        else:
            by_signature[key] = template

    draft_fields = [name for name in COPIED_FIELDS if name in TemplateDraft.model_fields]
    summary = TemplateSyncSummary()
    for draft in drafts:
        weekdays = sorted(set(draft.weekdays))
        signature = _signature(draft)
        matched = by_signature.pop(signature) if signature in by_signature else None
        if matched is None:
            session.add(
                TournamentTemplate(
                    club_id=club_id,
                    source=source,
                    weekdays=weekdays,
                    start_time=draft.start_time,
                    late_reg_close_offset_min=draft.late_reg_close_offset_min,
                    valid_from=draft.valid_from,
                    valid_until=draft.valid_until,
                    month_week=draft.month_week,
                    **{name: getattr(draft, name) for name in draft_fields},
                )
            )
            summary.created += 1
            continue
        if sorted(matched.weekdays) != weekdays or not matched.is_active:
            matched.weekdays = weekdays
            matched.is_active = True
            summary.updated += 1
        else:
            summary.unchanged += 1

    kinds_in_file = {template_kind(draft) for draft in drafts}
    stale.extend(
        template for template in by_signature.values() if template_kind(template) in kinds_in_file
    )
    summary.stale_template_ids = [template.id for template in stale]
    await session.flush()
    return summary


def matches_month_week(day: date, month_week: int) -> bool:
    """Второе воскресенье месяца — month_week=2, последнее — -1."""
    if month_week == -1:
        return (day + timedelta(days=7)).month != day.month
    return (day.day - 1) // 7 + 1 == month_week


def _occurs_on(template: TournamentTemplate, day: date) -> bool:
    if day.isoweekday() not in template.weekdays:
        return False
    if template.month_week is not None and not matches_month_week(day, template.month_week):
        return False
    if template.valid_from is not None and day < template.valid_from:
        return False
    return template.valid_until is None or day <= template.valid_until


async def expand_templates(
    session: AsyncSession,
    club_ids: list[uuid.UUID],
    *,
    now: datetime | None = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    exclude_template_ids: frozenset[uuid.UUID] = frozenset(),
) -> ExpansionSummary:
    """Развернуть активные шаблоны клубов в старты от `now` на `horizon_days` вперёд.

    Прошедшие старты не трогаются. Старты с `is_detached` (правлены руками) и заведённые без
    шаблона — тоже. Сгенерированные старты, которым больше не соответствует ни один шаблон,
    удаляются.
    """
    moment = (now or datetime.now(UTC)).astimezone(UTC)
    first_day = moment.astimezone(MSK).date()
    last_day = first_day + timedelta(days=horizon_days)
    window_end = datetime.combine(last_day + timedelta(days=1), datetime.min.time(), MSK)

    templates = [
        template
        for template in await session.scalars(
            select(TournamentTemplate).where(
                TournamentTemplate.club_id.in_(club_ids),
                TournamentTemplate.is_active.is_(True),
            )
        )
        if template.id not in exclude_template_ids
    ]

    desired: dict[tuple[uuid.UUID, datetime, str], tuple[TournamentTemplate, datetime]] = {}
    day = first_day
    while day <= last_day:
        for template in templates:
            if not _occurs_on(template, day):
                continue
            starts_at = datetime.combine(day, template.start_time, MSK).astimezone(UTC)
            if starts_at < moment:
                continue
            desired[(template.club_id, starts_at, template.name)] = (template, starts_at)
        day += timedelta(days=1)

    existing = list(
        await session.scalars(
            select(Tournament).where(
                Tournament.club_id.in_(club_ids),
                Tournament.starts_at >= moment,
                Tournament.starts_at < window_end,
            )
        )
    )

    summary = ExpansionSummary()
    for tournament in existing:
        key = (tournament.club_id, tournament.starts_at.astimezone(UTC), tournament.name)
        match = desired.pop(key, None)
        if tournament.is_detached:
            summary.detached_kept += 1
            continue
        if match is None:
            if tournament.template_id is not None:
                await session.delete(tournament)
                summary.deleted += 1
            continue
        template, starts_at = match
        if _apply_template(tournament, template, starts_at):
            summary.updated += 1

    for template, starts_at in desired.values():
        tournament = Tournament(club_id=template.club_id, status=TournamentStatus.SCHEDULED)
        _apply_template(tournament, template, starts_at)
        session.add(tournament)
        summary.created += 1

    await session.flush()
    return summary


def _apply_template(
    tournament: Tournament,
    template: TournamentTemplate,
    starts_at: datetime,
) -> bool:
    """Скопировать поля шаблона в старт. Возвращает True, если что-то поменялось."""
    closes_at = (
        starts_at + timedelta(minutes=template.late_reg_close_offset_min)
        if template.late_reg_close_offset_min is not None
        else None
    )
    values: dict[str, object] = {name: getattr(template, name) for name in COPIED_FIELDS}
    values.update(template_id=template.id, starts_at=starts_at, late_reg_closes_at=closes_at)
    changed = False
    for name, value in values.items():
        if getattr(tournament, name, None) != value:
            setattr(tournament, name, value)
            changed = True
    return changed


async def apply_templates_import(
    session: AsyncSession,
    club_id: uuid.UUID,
    drafts: list[TemplateDraft],
    *,
    source: str,
    now: datetime | None = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> tuple[TemplateSyncSummary, ExpansionSummary]:
    """Импорт сетки клуба целиком: шаблоны → старты → удаление устаревших шаблонов."""
    templates_summary = await sync_club_templates(session, club_id, drafts, source=source)
    stale = frozenset(templates_summary.stale_template_ids)
    expansion_summary = await expand_templates(
        session,
        [club_id],
        now=now,
        horizon_days=horizon_days,
        exclude_template_ids=stale,
    )
    if stale:
        await session.execute(delete(TournamentTemplate).where(TournamentTemplate.id.in_(stale)))
        await session.flush()
    return templates_summary, expansion_summary
