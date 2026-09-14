"""Колокольчик на турнире: напоминание за 5 минут до старта и до конца поздней регистрации.

Ответ Ивана 11.7. Напоминание — обычный пуш из очереди уведомлений с `scheduled_at` в будущем:
воркер отправляет его, когда время подошло. Пуш ссылается на напоминание с каскадным
удалением, поэтому снятый колокольчик или удалённый из сетки турнир не присылает лишнего.

«Не пушить, пока игрок в приложении» здесь не действует: игрок сам попросил напомнить,
и за 5 минут до старта приложение может быть открыто на другом экране.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.clubs import Club
from app.models.enums import NotificationStatus, NotificationType, ReminderKind, TournamentStatus
from app.models.notifications import NotificationQueue
from app.models.tournaments import Tournament, TournamentReminder
from app.schemas.tournaments import TournamentReminderRead

_MSK = ZoneInfo("Europe/Moscow")


def _money(chips: Decimal, club: Club) -> str:
    """«$10», «₽5 000» — как в расписании; без курса — в фишках."""
    if club.chip_value is None or club.chip_currency is None:
        amount, prefix, suffix = chips, "", " фиш."
    else:
        amount, prefix, suffix = chips * club.chip_value, club.chip_currency.symbol, ""
    number = f"{amount.normalize():,f}".replace(",", " ")
    if "." in number:
        number = number.rstrip("0").rstrip(".")
    return f"{prefix}{number}{suffix}"


def _lead() -> timedelta:
    return timedelta(minutes=get_settings().tournament_reminder_lead_minutes)


def _anchor(tournament: Tournament, kind: ReminderKind) -> datetime | None:
    return tournament.starts_at if kind is ReminderKind.START else tournament.late_reg_closes_at


def _payload(tournament: Tournament, kind: ReminderKind) -> dict[str, object]:
    minutes = get_settings().tournament_reminder_lead_minutes
    moment = _anchor(tournament, kind)
    assert moment is not None
    clock = moment.astimezone(_MSK).strftime("%H:%M")
    name = (
        f"Sat → {tournament.satellite_target}" if tournament.satellite_target else tournament.name
    )
    buyin = _money(tournament.buyin, tournament.club)
    if kind is ReminderKind.START:
        title = f"Через {minutes} минут: {name}"
        body = f"{tournament.club.name} · старт в {clock} МСК · бай-ин {buyin}"
    elif tournament.addon_cost is not None or tournament.addon_terms is not None:
        # Аддон берут на перерыве в конце поздней регистрации — об этом и напоминаем.
        title = f"Аддон через {minutes} минут: {name}"
        body = f"{tournament.club.name} · перерыв на аддон и конец регистрации в {clock} МСК"
    else:
        title = f"Регистрация закрывается: {name}"
        body = f"{tournament.club.name} · поздняя регистрация до {clock} МСК"
    return {
        "title": title[:200],
        "body": body[:500],
        "url": "/tournaments",
        "type": NotificationType.REMINDER.value,
        "offset_minutes": minutes,
    }


async def list_my_reminders(
    session: AsyncSession, user: User, *, now: datetime | None = None
) -> list[TournamentReminderRead]:
    """Напоминания на турниры, которые ещё не закончили регистрацию (для колокольчиков)."""
    moment = now or datetime.now(UTC)
    rows = await session.execute(
        select(TournamentReminder.tournament_id, TournamentReminder.kind)
        .join(Tournament, Tournament.id == TournamentReminder.tournament_id)
        .where(
            TournamentReminder.user_id == user.id,
            func.coalesce(Tournament.late_reg_closes_at, Tournament.starts_at) >= moment,
        )
        .order_by(TournamentReminder.tournament_id, TournamentReminder.kind)
    )
    return [
        TournamentReminderRead(tournament_id=tournament_id, kind=kind)
        for tournament_id, kind in rows.tuples()
    ]


async def set_reminders(
    session: AsyncSession,
    user: User,
    tournament_id: uuid.UUID,
    kinds: set[ReminderKind],
    *,
    now: datetime | None = None,
) -> list[TournamentReminderRead]:
    """Привести колокольчики игрока на турнире к `kinds`: лишние снять, новые поставить."""
    moment = now or datetime.now(UTC)
    tournament = await session.scalar(
        select(Tournament)
        .options(selectinload(Tournament.club).selectinload(Club.chip_currency))
        .where(Tournament.id == tournament_id)
    )
    if tournament is None or not tournament.club.is_visible:
        raise NotFoundError("Турнир не найден")
    if tournament.status is TournamentStatus.CANCELLED and kinds:
        raise AppError("tournament_cancelled", "Турнир отменён", 422)

    existing = {
        reminder.kind: reminder
        for reminder in await session.scalars(
            select(TournamentReminder).where(
                TournamentReminder.user_id == user.id,
                TournamentReminder.tournament_id == tournament.id,
            )
        )
    }
    stale = [reminder.id for kind, reminder in existing.items() if kind not in kinds]
    if stale:
        # Пуш в очереди удалится каскадом вместе с напоминанием.
        await session.execute(delete(TournamentReminder).where(TournamentReminder.id.in_(stale)))

    for kind in kinds - existing.keys():
        anchor = _anchor(tournament, kind)
        if anchor is None:
            raise AppError("no_late_reg", "У турнира нет поздней регистрации", 422)
        if anchor <= moment:
            raise AppError(
                "reminder_too_late",
                "Турнир уже начался" if kind is ReminderKind.START else "Регистрация уже закрыта",
                422,
            )
        reminder = TournamentReminder(user_id=user.id, tournament_id=tournament.id, kind=kind)
        session.add(reminder)
        await session.flush()
        session.add(
            NotificationQueue(
                user_id=user.id,
                tournament_reminder_id=reminder.id,
                type=NotificationType.REMINDER,
                payload=_payload(tournament, kind),
                # Поставили меньше чем за 5 минут — присылаем сразу.
                scheduled_at=max(anchor - _lead(), moment),
                status=NotificationStatus.PENDING,
                attempts=0,
            )
        )
    await session.flush()
    return sorted(
        (TournamentReminderRead(tournament_id=tournament.id, kind=kind) for kind in kinds),
        key=lambda item: item.kind.value,
    )


async def reschedule_pending(session: AsyncSession) -> int:
    """Время турнира поправили импортом — пересчитать ещё не отправленные напоминания."""
    result = await session.execute(
        text(
            """
            UPDATE notification_queue AS nq
            SET scheduled_at = (
                CASE tr.kind
                    WHEN 'start' THEN t.starts_at
                    ELSE t.late_reg_closes_at
                END
            ) - make_interval(mins => :lead)
            FROM tournament_reminders AS tr
            JOIN tournaments AS t ON t.id = tr.tournament_id
            WHERE nq.tournament_reminder_id = tr.id
              AND nq.status = 'pending'
              AND (tr.kind = 'start' OR t.late_reg_closes_at IS NOT NULL)
              AND nq.scheduled_at IS DISTINCT FROM (
                CASE tr.kind
                    WHEN 'start' THEN t.starts_at
                    ELSE t.late_reg_closes_at
                END
              ) - make_interval(mins => :lead)
            """
        ),
        {"lead": get_settings().tournament_reminder_lead_minutes},
    )
    return int(getattr(result, "rowcount", 0) or 0)
