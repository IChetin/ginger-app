from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.clubs import Club
from app.models.enums import ClubBlock
from app.models.references import Currency, FxRate, Organizer
from app.models.tournaments import TournamentTemplate
from app.schemas.clubs import ClubAdminRead, ClubAdminUpdate, ClubBrief, ManualRateRead

RUB = "RUB"


async def list_public_clubs(session: AsyncSession) -> list[ClubBrief]:
    # Офлайн-клубы — только по флагу доступа (ТЗ §7). Флага у игроков пока нет — скрыты от всех.
    clubs = await session.scalars(
        select(Club)
        .where(Club.is_visible.is_(True), Club.block == ClubBlock.ONLINE)
        .order_by(Club.is_promoted.desc(), Club.sort_order, Club.name)
    )
    return [ClubBrief.model_validate(club) for club in clubs]


async def list_admin_clubs(session: AsyncSession) -> list[ClubAdminRead]:
    counts = dict(
        (
            await session.execute(
                select(TournamentTemplate.club_id, func.count()).group_by(
                    TournamentTemplate.club_id
                )
            )
        ).tuples()
    )
    clubs = await session.scalars(
        select(Club).options(selectinload(Club.organizer)).order_by(Club.sort_order, Club.name)
    )
    return [_admin_read(club, counts.get(club.id, 0)) for club in clubs]


async def get_club(session: AsyncSession, club_id: UUID) -> Club:
    club = await session.scalar(
        select(Club).options(selectinload(Club.organizer)).where(Club.id == club_id)
    )
    if club is None:
        raise NotFoundError("Клуб не найден")
    return club


async def update_club(session: AsyncSession, club_id: UUID, body: ClubAdminUpdate) -> ClubAdminRead:
    club = await get_club(session, club_id)
    changes = body.model_dump(exclude_unset=True)
    # Всё проверяем до изменения объекта: иначе при ошибке клуб остаётся «грязным» в сессии.
    organizer_id = changes.get("organizer_id")
    if organizer_id is not None and await session.get(Organizer, organizer_id) is None:
        raise AppError("organizer_not_found", "Союз не найден", 422)
    if changes.get("chip_currency_code") is not None:
        changes["chip_currency_code"] = changes["chip_currency_code"].upper()
        if await session.get(Currency, changes["chip_currency_code"]) is None:
            raise AppError("currency_not_found", "Валюта не найдена", 422)
    # Курс — пара «сколько» и «чего»: половинка без второй бессмысленна (и запрещена в базе).
    chip_value = changes.get("chip_value", club.chip_value)
    chip_currency_code = changes.get("chip_currency_code", club.chip_currency_code)
    if (chip_value is None) != (chip_currency_code is None):
        raise AppError(
            "chip_rate_incomplete",
            "Курс фишки задаётся парой: значение и валюта",
            422,
        )
    for name, value in changes.items():
        setattr(club, name, value)
    await session.flush()
    await session.refresh(club, ["organizer", "updated_at"])
    templates = await session.scalar(
        select(func.count())
        .select_from(TournamentTemplate)
        .where(TournamentTemplate.club_id == club.id)
    )
    return _admin_read(club, templates or 0)


def _admin_read(club: Club, templates_count: int) -> ClubAdminRead:
    read = ClubAdminRead.model_validate(club)
    read.organizer_name = club.organizer.name if club.organizer else None
    read.templates_count = templates_count
    return read


async def latest_rates_rub(session: AsyncSession, codes: set[str]) -> dict[str, Decimal]:
    """Последний известный курс к рублю по каждой валюте, без ограничения давности.

    Для фильтра по бай-ину точность «примерно» достаточна, а ручной курс USDT правят
    по мере изменения, а не каждый день.
    """
    rates: dict[str, Decimal] = {RUB: Decimal("1")} if RUB in codes else {}
    others = codes - {RUB}
    if not others:
        return rates
    rows = await session.execute(
        select(FxRate.currency_code, FxRate.rate_rub)
        .where(FxRate.currency_code.in_(others))
        .distinct(FxRate.currency_code)
        .order_by(FxRate.currency_code, FxRate.rate_date.desc())
    )
    rates.update({code: rate for code, rate in rows.tuples()})
    return rates


async def rub_per_chip(session: AsyncSession, clubs: list[Club]) -> dict[UUID, Decimal]:
    codes = {club.chip_currency_code for club in clubs if club.chip_currency_code}
    rates = await latest_rates_rub(session, codes)
    result: dict[UUID, Decimal] = {}
    for club in clubs:
        if club.chip_value is None or club.chip_currency_code is None:
            continue
        rate = rates.get(club.chip_currency_code)
        if rate is not None:
            result[club.id] = club.chip_value * rate
    return result


async def set_manual_rate(
    session: AsyncSession, currency_code: str, rate_rub: Decimal
) -> ManualRateRead:
    code = currency_code.upper()
    if code == RUB:
        raise AppError("rate_for_rub", "Курс рубля к рублю не задаётся", 422)
    if await session.get(Currency, code) is None:
        raise NotFoundError("Валюта не найдена")
    today = datetime.now(UTC).date()
    statement = insert(FxRate).values(currency_code=code, rate_date=today, rate_rub=rate_rub)
    await session.execute(
        statement.on_conflict_do_update(
            index_elements=[FxRate.currency_code, FxRate.rate_date],
            set_={"rate_rub": statement.excluded.rate_rub},
        )
    )
    await session.flush()
    return ManualRateRead(currency_code=code, rate_rub=rate_rub, rate_date=today)
