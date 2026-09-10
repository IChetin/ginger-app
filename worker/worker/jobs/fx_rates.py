from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import distinct, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from worker.config import Settings, get_settings
from worker.db.models import FxRate, User
from worker.db.session import session_scope
from worker.fx.cbr import (
    RUB,
    SUPPORTED_CURRENCIES,
    CbrFetchError,
    CbrRate,
    fetch_rates_for_date,
)

FetchRatesFn = Callable[..., dict[str, CbrRate]]

logger = logging.getLogger("day2.worker.fx")


def _needed_currencies(session: Session) -> set[str]:
    user_codes = set(session.scalars(select(distinct(User.base_currency))))
    codes = (user_codes | set(SUPPORTED_CURRENCIES)) - {RUB}
    return {code.upper() for code in codes if code.upper() in SUPPORTED_CURRENCIES}


def select_backfill_dates(
    session: Session,
    *,
    today: date | None = None,
) -> list[date]:
    """Даты, за которые нужен курс ЦБ.

    В базе Day2 здесь догружались курсы на даты сыгранных турниров трекера, чтобы
    пересчитать результаты в базовую валюту. Трекер удалён — нужен только сегодняшний курс.
    """
    del session  # Сигнатура сохранена: вызывающий код передаёт сессию.
    return [today or datetime.now(UTC).date()]


def upsert_rates(session: Session, rates: list[CbrRate]) -> int:
    if not rates:
        return 0
    # Deduplicate by PK in case multiple requested dates map to one CBR date.
    by_key: dict[tuple[str, date], CbrRate] = {
        (rate.currency_code, rate.rate_date): rate for rate in rates
    }
    rows = [
        {
            "currency_code": rate.currency_code,
            "rate_date": rate.rate_date,
            "rate_rub": rate.rate_rub,
        }
        for rate in by_key.values()
    ]
    insert_stmt = insert(FxRate).values(rows)
    upsert_stmt = insert_stmt.on_conflict_do_update(
        index_elements=[FxRate.currency_code, FxRate.rate_date],
        set_={"rate_rub": insert_stmt.excluded.rate_rub},
    )
    session.execute(upsert_stmt)
    return len(rows)


def sync_fx_rates_for_dates(
    session: Session,
    dates: list[date],
    *,
    settings: Settings,
    fetch_fn: FetchRatesFn = fetch_rates_for_date,
) -> dict[str, int]:
    currencies = _needed_currencies(session) or set(SUPPORTED_CURRENCIES)
    fetched = 0
    failed = 0
    upserted = 0
    fetch_kwargs: dict[str, Any] = {
        "currencies": currencies,
        "base_url": settings.cbr_base_url,
        "timeout_seconds": settings.cbr_timeout_seconds,
        "retries": settings.cbr_retries,
    }
    for requested in dates:
        try:
            rates = fetch_fn(requested, **fetch_kwargs)
            # Persist on the actual CBR Date attribute (weekend/holiday fallback).
            upserted += upsert_rates(session, list(rates.values()))
            fetched += 1
        except CbrFetchError:
            failed += 1
            logger.exception("FX sync failed for date=%s", requested.isoformat())
            continue
    return {"dates_ok": fetched, "dates_failed": failed, "rows_upserted": upserted}


def process_fx_rates(settings: Settings | None = None) -> dict[str, int]:
    cfg = settings or get_settings()
    with session_scope() as session:
        dates = select_backfill_dates(session)
        logger.info("FX job starting dates=%s", len(dates))
        summary = sync_fx_rates_for_dates(session, dates, settings=cfg)
        logger.info(
            "FX job done ok=%s failed=%s upserted=%s",
            summary["dates_ok"],
            summary["dates_failed"],
            summary["rows_upserted"],
        )
        return summary
