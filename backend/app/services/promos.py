"""Акции клубов единой плашкой (Иван, 30.09).

Менеджер вставляет текст поста или картинку афиши — получается черновик, разобранный
`promo_parse`; сомнительные поля подсвечены. Опубликованная акция видна до `ends_at` и
пропадает сама. У ежемесячной после окончания появляется черновик на следующий месяц
с теми же условиями: союз мог их поменять, поэтому публикует его человек.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.auth import User
from app.models.chips import Attachment
from app.models.clubs import Club
from app.models.promos import Promotion
from app.schemas.feed import WinClub
from app.schemas.promos import (
    PromoPrize,
    PromotionAdminRead,
    PromotionRead,
    PromotionWrite,
    PromoWindow,
)
from app.services import attachments, ocr
from app.services.promo_parse import ClubRef, ParsedPromo, add_month, parse_promo

logger = logging.getLogger(__name__)

PROMO_IMAGE_PURPOSE = "promo"
# Будущие акции показываем заранее, но не за квартал: анонс за две недели.
UPCOMING_WINDOW = timedelta(days=14)


def _options() -> list[Any]:
    return [
        selectinload(Promotion.club),
        selectinload(Promotion.currency),
        selectinload(Promotion.image),
    ]


def _money(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _read_fields(promo: Promotion) -> dict[str, Any]:
    club = promo.club
    return {
        "id": promo.id,
        "club": WinClub(id=club.id, name=club.name, app=club.app) if club else None,
        "kind": promo.kind,
        "title": promo.title,
        "prize_fund": promo.prize_fund,
        "prize_extra": promo.prize_extra,
        "currency_code": promo.currency_code,
        "currency_symbol": promo.currency.symbol if promo.currency else None,
        "starts_at": promo.starts_at,
        "ends_at": promo.ends_at,
        "recurrence": promo.recurrence,
        "game": promo.game,
        "buyin_min": promo.buyin_min,
        "buyin_max": promo.buyin_max,
        "prizes": [PromoPrize.model_validate(item) for item in promo.prizes or []],
        "boost_windows": [PromoWindow.model_validate(item) for item in promo.boost_windows or []],
        "image_url": f"/api/v1/promos/{promo.id}/image" if promo.image_attachment_id else None,
    }


def _read(promo: Promotion) -> PromotionRead:
    return PromotionRead(**_read_fields(promo))


def _admin_read(promo: Promotion) -> PromotionAdminRead:
    return PromotionAdminRead(
        **_read_fields(promo),
        is_published=promo.is_published,
        source_text=promo.source_text,
        uncertain=list(promo.uncertain or []),
        renewed_from_id=promo.renewed_from_id,
        created_at=promo.created_at,
    )


async def _load(session: AsyncSession, promo_id: UUID) -> Promotion:
    promo = await session.scalar(
        select(Promotion).where(Promotion.id == promo_id).options(*_options())
    )
    if promo is None:
        raise AppError("promo_not_found", "Акция не найдена", 404)
    return promo


async def _reload(session: AsyncSession, promo: Promotion) -> Promotion:
    await session.flush()
    session.expunge(promo)
    return await _load(session, promo.id)


# ---------------------------------------------------------------- витрина


async def list_public(session: AsyncSession, now: datetime | None = None) -> list[PromotionRead]:
    """Идущие и ближайшие акции: сначала идущие с крупным фондом, потом анонсы по дате."""
    now = now or datetime.now(UTC)
    rows = (
        await session.scalars(
            select(Promotion)
            .where(
                Promotion.is_published.is_(True),
                Promotion.ends_at > now,
                Promotion.starts_at <= now + UPCOMING_WINDOW,
            )
            .options(*_options())
        )
    ).all()

    def order(promo: Promotion) -> tuple[int, float, float]:
        started = promo.starts_at is not None and promo.starts_at <= now
        fund = float(promo.prize_fund or 0)
        start = promo.starts_at.timestamp() if promo.starts_at else 0.0
        return (0, -fund, 0.0) if started else (1, 0.0, start)

    return [_read(promo) for promo in sorted(rows, key=order)]


async def promo_image(session: AsyncSession, promo_id: UUID) -> tuple[bytes, str]:
    promo = await _load(session, promo_id)
    if promo.image is None:
        raise AppError("image_not_found", "У акции нет афиши", 404)
    return attachments.read_bytes(promo.image), promo.image.content_type


# ---------------------------------------------------------------- админка


async def list_admin(session: AsyncSession) -> list[PromotionAdminRead]:
    rows = (
        await session.scalars(
            select(Promotion).options(*_options()).order_by(Promotion.created_at.desc())
        )
    ).all()
    return [_admin_read(promo) for promo in rows]


def _apply(promo: Promotion, body: PromotionWrite) -> None:
    promo.club_id = body.club_id
    promo.kind = body.kind
    promo.title = body.title
    promo.prize_fund = body.prize_fund
    promo.prize_extra = body.prize_extra
    promo.currency_code = body.currency_code
    promo.starts_at = body.starts_at
    promo.ends_at = body.ends_at
    promo.recurrence = body.recurrence
    promo.game = body.game
    promo.buyin_min = body.buyin_min
    promo.buyin_max = body.buyin_max
    promo.prizes = [prize.model_dump(mode="json") for prize in body.prizes]
    promo.boost_windows = [window.model_dump(mode="json") for window in body.boost_windows]
    promo.uncertain = list(dict.fromkeys(body.uncertain))
    promo.is_published = body.is_published


async def _check_club(session: AsyncSession, club_id: UUID | None) -> None:
    if club_id is not None and await session.get(Club, club_id) is None:
        raise AppError("club_not_found", "Клуб не найден", 404)


async def create(session: AsyncSession, actor: User, body: PromotionWrite) -> PromotionAdminRead:
    await _check_club(session, body.club_id)
    promo = Promotion(created_by_user_id=actor.id, title=body.title)
    _apply(promo, body)
    session.add(promo)
    return _admin_read(await _reload(session, promo))


async def update(session: AsyncSession, promo_id: UUID, body: PromotionWrite) -> PromotionAdminRead:
    await _check_club(session, body.club_id)
    promo = await _load(session, promo_id)
    _apply(promo, body)
    return _admin_read(await _reload(session, promo))


async def delete(session: AsyncSession, promo_id: UUID) -> None:
    promo = await _load(session, promo_id)
    image = promo.image
    await session.delete(promo)
    await session.flush()
    if image is not None:
        await attachments.remove(session, image)


async def _club_refs(session: AsyncSession) -> list[ClubRef]:
    clubs = (await session.scalars(select(Club).options(selectinload(Club.organizer)))).all()
    return [
        ClubRef(
            id=club.id,
            name=club.name,
            organizer_name=club.organizer.name if club.organizer else None,
            currency_code=club.chip_currency_code,
        )
        for club in clubs
    ]


def _from_parsed(parsed: ParsedPromo, actor: User, source_text: str) -> Promotion:
    return Promotion(
        created_by_user_id=actor.id,
        club_id=parsed.club_id,
        kind=parsed.kind,
        title=parsed.title[:120],
        prize_fund=parsed.prize_fund,
        prize_extra=(parsed.prize_extra or None) and parsed.prize_extra[:80],
        currency_code=parsed.currency_code,
        starts_at=parsed.starts_at,
        ends_at=parsed.ends_at,
        recurrence=parsed.recurrence,
        game=parsed.game,
        buyin_min=parsed.buyin_min,
        buyin_max=parsed.buyin_max,
        prizes=[
            {
                "place": prize.place,
                "amount": None if prize.amount is None else str(prize.amount),
                "label": prize.label,
            }
            for prize in parsed.prizes
        ],
        boost_windows=parsed.boost_windows,
        uncertain=parsed.uncertain,
        source_text=source_text[:8000],
        is_published=False,
    )


async def _known_currency(session: AsyncSession, promo: Promotion) -> None:
    """Валюта, которой нет в справочнике, — не повод падать: оставляем пустой и подсвечиваем."""
    from app.models.references import Currency

    if promo.currency_code and await session.get(Currency, promo.currency_code) is None:
        promo.currency_code = None
        promo.uncertain = [*promo.uncertain, "currency_code"]


async def create_from_text(session: AsyncSession, actor: User, text: str) -> PromotionAdminRead:
    parsed = parse_promo(text, await _club_refs(session))
    promo = _from_parsed(parsed, actor, text)
    await _known_currency(session, promo)
    session.add(promo)
    return _admin_read(await _reload(session, promo))


async def create_from_image(
    session: AsyncSession, actor: User, *, data: bytes, content_type: str | None
) -> PromotionAdminRead:
    """Афиша или скрин лобби: картинка остаётся исходником, текст — через Tesseract."""
    attachment = await attachments.save_image(
        session,
        owner_user_id=actor.id,
        purpose=PROMO_IMAGE_PURPOSE,
        data=data,
        content_type=content_type,
    )
    text = await ocr.image_to_text(data)
    parsed = parse_promo(text, await _club_refs(session))
    promo = _from_parsed(parsed, actor, text)
    promo.image_attachment_id = attachment.id
    await _known_currency(session, promo)
    session.add(promo)
    return _admin_read(await _reload(session, promo))


async def set_image(
    session: AsyncSession, actor: User, promo_id: UUID, *, data: bytes, content_type: str | None
) -> PromotionAdminRead:
    promo = await _load(session, promo_id)
    previous: Attachment | None = promo.image
    attachment = await attachments.save_image(
        session,
        owner_user_id=actor.id,
        purpose=PROMO_IMAGE_PURPOSE,
        data=data,
        content_type=content_type,
    )
    promo.image_attachment_id = attachment.id
    await session.flush()
    if previous is not None:
        await attachments.remove(session, previous)
    return _admin_read(await _reload(session, promo))


async def clear_image(session: AsyncSession, promo_id: UUID) -> PromotionAdminRead:
    promo = await _load(session, promo_id)
    previous = promo.image
    promo.image_attachment_id = None
    await session.flush()
    if previous is not None:
        await attachments.remove(session, previous)
    return _admin_read(await _reload(session, promo))


# ---------------------------------------------------------------- ежемесячные


async def renew_monthly(session: AsyncSession, now: datetime | None = None) -> int:
    """Закончившаяся ежемесячная акция оставляет черновик на следующий месяц.

    Условия копируются как были, но публикует человек: союз мог поменять призы. Один
    черновик на акцию — повторный проход ничего не дублирует.
    """
    now = now or datetime.now(UTC)
    renewed = select(Promotion.renewed_from_id).where(Promotion.renewed_from_id.is_not(None))
    ended = (
        await session.scalars(
            select(Promotion).where(
                Promotion.is_published.is_(True),
                Promotion.recurrence == "monthly",
                Promotion.ends_at <= now,
                Promotion.starts_at.is_not(None),
                Promotion.id.not_in(renewed),
            )
        )
    ).all()
    for promo in ended:
        assert promo.starts_at is not None and promo.ends_at is not None
        session.add(
            Promotion(
                club_id=promo.club_id,
                kind=promo.kind,
                title=promo.title,
                prize_fund=promo.prize_fund,
                prize_extra=promo.prize_extra,
                currency_code=promo.currency_code,
                starts_at=promo.ends_at,
                ends_at=add_month(promo.ends_at),
                recurrence=promo.recurrence,
                game=promo.game,
                buyin_min=promo.buyin_min,
                buyin_max=promo.buyin_max,
                prizes=promo.prizes,
                boost_windows=promo.boost_windows,
                image_attachment_id=None,
                source_text=promo.source_text,
                uncertain=["prizes"],
                is_published=False,
                renewed_from_id=promo.id,
                created_by_user_id=promo.created_by_user_id,
            )
        )
    await session.flush()
    return len(ended)


async def run_renewals_periodically(interval_seconds: int) -> None:
    from app.core.database import async_session_factory

    while True:
        try:
            async with async_session_factory() as session:
                created = await renew_monthly(session)
                await session.commit()
            if created:
                logger.info("promos: monthly drafts created=%s", created)
        except Exception:  # noqa: BLE001 — упавший проход не должен убивать цикл
            logger.exception("promo renewals failed")
        await asyncio.sleep(interval_seconds)
