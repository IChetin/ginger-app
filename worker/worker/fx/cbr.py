from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree

logger = logging.getLogger("ginger.worker.fx.cbr")

SUPPORTED_CURRENCIES = frozenset({"BYN", "USD", "EUR"})
RUB = "RUB"
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_SECONDS = 1.0


@dataclass(frozen=True)
class CbrRate:
    currency_code: str
    rate_date: date
    rate_rub: Decimal
    requested_date: date


class CbrFetchError(Exception):
    pass


def parse_cbr_decimal(raw: str) -> Decimal:
    normalized = raw.strip().replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation as exc:
        raise CbrFetchError(f"invalid decimal: {raw!r}") from exc


def parse_cbr_date(raw: str) -> date:
    day, month, year = raw.strip().split(".")
    return date(int(year), int(month), int(day))


def format_cbr_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def parse_daily_xml(xml_text: str, *, requested_date: date) -> dict[str, CbrRate]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise CbrFetchError("invalid CBR XML") from exc

    actual_raw = root.attrib.get("Date")
    if not actual_raw:
        raise CbrFetchError("CBR XML missing Date attribute")
    actual_date = parse_cbr_date(actual_raw)

    rates: dict[str, CbrRate] = {}
    for node in root.findall("Valute"):
        char_code = (node.findtext("CharCode") or "").strip().upper()
        if char_code not in SUPPORTED_CURRENCIES:
            continue
        nominal_raw = node.findtext("Nominal")
        value_raw = node.findtext("Value")
        if not nominal_raw or not value_raw:
            raise CbrFetchError(f"incomplete Valute node for {char_code}")
        nominal = parse_cbr_decimal(nominal_raw)
        if nominal <= 0:
            raise CbrFetchError(f"invalid Nominal for {char_code}")
        value = parse_cbr_decimal(value_raw)
        rate_rub = (value / nominal).quantize(Decimal("0.000001"))
        rates[char_code] = CbrRate(
            currency_code=char_code,
            rate_date=actual_date,
            rate_rub=rate_rub,
            requested_date=requested_date,
        )
    return rates


def fetch_daily_xml(
    requested_date: date,
    *,
    base_url: str = "https://www.cbr.ru/scripts/XML_daily.asp",
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    retries: int = DEFAULT_RETRIES,
    backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
    opener: object | None = None,
) -> str:
    url = f"{base_url}?date_req={format_cbr_date(requested_date)}"
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "GingerWorker/1.0 (+https://lisa52.com)"},
            )
            if opener is None:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    payload = response.read()
                    if not isinstance(payload, bytes | bytearray):
                        raise CbrFetchError("CBR response body is not bytes")
                    return bytes(payload).decode("windows-1251")
            # Test double: callable opener(request) -> bytes/str
            raw = opener(request)  # type: ignore[operator]
            if isinstance(raw, bytes):
                return raw.decode("windows-1251")
            return str(raw)
        except (urllib.error.URLError, TimeoutError, OSError, UnicodeError) as exc:
            last_error = exc
            logger.warning(
                "CBR fetch failed attempt=%s date=%s error=%s",
                attempt,
                requested_date.isoformat(),
                type(exc).__name__,
            )
            if attempt < retries:
                time.sleep(backoff_seconds * attempt)
    raise CbrFetchError(f"CBR fetch failed for {requested_date.isoformat()}") from last_error


def fetch_rates_for_date(
    requested_date: date,
    *,
    currencies: set[str] | frozenset[str] = SUPPORTED_CURRENCIES,
    **fetch_kwargs: object,
) -> dict[str, CbrRate]:
    wanted = {code.upper() for code in currencies if code.upper() != RUB}
    if not wanted:
        return {}
    xml_text = fetch_daily_xml(requested_date, **fetch_kwargs)  # type: ignore[arg-type]
    parsed = parse_daily_xml(xml_text, requested_date=requested_date)
    missing = wanted - set(parsed)
    if missing:
        raise CbrFetchError(f"CBR response missing currencies: {', '.join(sorted(missing))}")
    return {code: parsed[code] for code in wanted}
