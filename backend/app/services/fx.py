from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models.references import FxRate

FX_LOOKBACK_DAYS = 7
RUB = "RUB"


class FxRateMissingError(ConflictError):
    def __init__(self, currency_code: str, played_on: date) -> None:
        super().__init__(
            message=(
                f"FX rate missing for {currency_code} on {played_on.isoformat()} "
                f"(lookback {FX_LOOKBACK_DAYS} days)"
            )
        )
        self.code = "fx_rate_missing"
        self.currency_code = currency_code
        self.played_on = played_on


async def load_rate_map(
    session: AsyncSession,
    *,
    currency_codes: set[str],
    date_from: date,
    date_to: date,
) -> dict[tuple[str, date], Decimal]:
    codes = {code.upper() for code in currency_codes if code.upper() != RUB}
    if not codes:
        return {}
    lookback_from = date_from - timedelta(days=FX_LOOKBACK_DAYS)
    rows = await session.scalars(
        select(FxRate).where(
            FxRate.currency_code.in_(codes),
            FxRate.rate_date >= lookback_from,
            FxRate.rate_date <= date_to,
        )
    )
    return {(row.currency_code, row.rate_date): row.rate_rub for row in rows}


def resolve_rate_rub(
    rate_map: dict[tuple[str, date], Decimal],
    currency_code: str,
    on_date: date,
) -> Decimal:
    code = currency_code.upper()
    if code == RUB:
        return Decimal("1")
    best: Decimal | None = None
    earliest = on_date - timedelta(days=FX_LOOKBACK_DAYS)
    cursor = on_date
    while cursor >= earliest:
        value = rate_map.get((code, cursor))
        if value is not None:
            best = value
            break
        cursor -= timedelta(days=1)
    if best is None:
        raise FxRateMissingError(code, on_date)
    return best


def convert_amount(
    amount: Decimal,
    *,
    source_currency: str,
    base_currency: str,
    played_on: date,
    rate_map: dict[tuple[str, date], Decimal],
) -> Decimal:
    source = source_currency.upper()
    base = base_currency.upper()
    if source == base:
        return amount
    source_rate = resolve_rate_rub(rate_map, source, played_on)
    base_rate = resolve_rate_rub(rate_map, base, played_on)
    # amount × source_rate_rub / base_rate_rub
    return (amount * source_rate / base_rate).quantize(Decimal("0.01"))
