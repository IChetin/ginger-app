from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from worker.config import Settings
from worker.fx.cbr import (
    CbrFetchError,
    CbrRate,
    parse_cbr_decimal,
    parse_daily_xml,
)
from worker.jobs.fx_rates import select_backfill_dates, sync_fx_rates_for_dates, upsert_rates

SAMPLE_XML = """<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="07.06.2024" name="Foreign Currency Market">
    <Valute ID="R01090B">
        <NumCode>933</NumCode>
        <CharCode>BYN</CharCode>
        <Nominal>1</Nominal>
        <Name>Белорусский рубль</Name>
        <Value>28,1234</Value>
    </Valute>
    <Valute ID="R01235">
        <NumCode>840</NumCode>
        <CharCode>USD</CharCode>
        <Nominal>1</Nominal>
        <Name>Доллар США</Name>
        <Value>90,5000</Value>
    </Valute>
    <Valute ID="R01239">
        <NumCode>978</NumCode>
        <CharCode>EUR</CharCode>
        <Nominal>1</Nominal>
        <Name>Евро</Name>
        <Value>98,0000</Value>
    </Valute>
    <Valute ID="R01375">
        <NumCode>156</NumCode>
        <CharCode>CNY</CharCode>
        <Nominal>10</Nominal>
        <Name>Юань</Name>
        <Value>125,0000</Value>
    </Valute>
</ValCurs>
"""

WEEKEND_XML = """<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="07.06.2024" name="Foreign Currency Market">
    <Valute ID="R01235">
        <NumCode>840</NumCode>
        <CharCode>USD</CharCode>
        <Nominal>1</Nominal>
        <Name>Доллар США</Name>
        <Value>90,5000</Value>
    </Valute>
    <Valute ID="R01239">
        <NumCode>978</NumCode>
        <CharCode>EUR</CharCode>
        <Nominal>1</Nominal>
        <Name>Евро</Name>
        <Value>98,0000</Value>
    </Valute>
    <Valute ID="R01090B">
        <NumCode>933</NumCode>
        <CharCode>BYN</CharCode>
        <Nominal>1</Nominal>
        <Name>Белорусский рубль</Name>
        <Value>28,1234</Value>
    </Valute>
</ValCurs>
"""

NOMINAL_XML = """<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="10.06.2024" name="Foreign Currency Market">
    <Valute ID="R01090B">
        <NumCode>933</NumCode>
        <CharCode>BYN</CharCode>
        <Nominal>100</Nominal>
        <Name>Белорусский рубль</Name>
        <Value>2850,0000</Value>
    </Valute>
    <Valute ID="R01235">
        <NumCode>840</NumCode>
        <CharCode>USD</CharCode>
        <Nominal>1</Nominal>
        <Name>Доллар США</Name>
        <Value>91,0000</Value>
    </Valute>
    <Valute ID="R01239">
        <NumCode>978</NumCode>
        <CharCode>EUR</CharCode>
        <Nominal>1</Nominal>
        <Name>Евро</Name>
        <Value>101,0000</Value>
    </Valute>
</ValCurs>
"""


def test_parse_nominal_and_value() -> None:
    assert parse_cbr_decimal("28,1234") == Decimal("28.1234")
    rates = parse_daily_xml(NOMINAL_XML, requested_date=date(2024, 6, 10))
    assert rates["BYN"].rate_rub == Decimal("28.500000")
    assert rates["USD"].rate_rub == Decimal("91.000000")


def test_weekend_uses_actual_cbr_date() -> None:
    rates = parse_daily_xml(WEEKEND_XML, requested_date=date(2024, 6, 8))
    assert rates["USD"].requested_date == date(2024, 6, 8)
    assert rates["USD"].rate_date == date(2024, 6, 7)


def test_upsert_idempotent() -> None:
    session = MagicMock()
    rates = [
        CbrRate("USD", date(2024, 6, 7), Decimal("90.5"), date(2024, 6, 7)),
        CbrRate("EUR", date(2024, 6, 7), Decimal("98"), date(2024, 6, 7)),
    ]
    assert upsert_rates(session, rates) == 2
    assert session.execute.call_count == 1
    assert upsert_rates(session, rates) == 2
    assert session.execute.call_count == 2


def test_partial_provider_failure_continues() -> None:
    session = MagicMock()
    session.scalars.side_effect = [
        iter(["USD", "EUR"]),  # result currencies
        iter(["RUB"]),  # user base
    ]
    settings = Settings(cbr_retries=1)

    def fetch(requested: date, **_kwargs: object) -> dict[str, CbrRate]:
        if requested == date(2024, 6, 8):
            raise CbrFetchError("boom")
        return {
            "USD": CbrRate("USD", requested, Decimal("90"), requested),
            "EUR": CbrRate("EUR", requested, Decimal("100"), requested),
            "BYN": CbrRate("BYN", requested, Decimal("28"), requested),
        }

    # Need currencies selection to work with MagicMock scalars differently.
    session.scalars.side_effect = None
    session.scalars.return_value = iter([])

    summary = sync_fx_rates_for_dates(
        session,
        [date(2024, 6, 8), date(2024, 6, 10)],
        settings=settings,
        fetch_fn=fetch,
    )
    assert summary["dates_failed"] == 1
    assert summary["dates_ok"] == 1


def test_backfill_selection_is_today_only() -> None:
    # Догрузка курсов на даты сыгранных турниров ушла вместе с трекером:
    # теперь нужен только курс на сегодня, в базу за датами не ходим.
    dates = select_backfill_dates(None, today=date(2024, 6, 15))  # type: ignore[arg-type]
    assert dates == [date(2024, 6, 15)]


def test_sample_xml_ignores_unsupported() -> None:
    rates = parse_daily_xml(SAMPLE_XML, requested_date=date(2024, 6, 7))
    assert set(rates) == {"BYN", "USD", "EUR"}
    with pytest.raises(CbrFetchError):
        parse_daily_xml("<not-xml", requested_date=date(2024, 6, 7))
