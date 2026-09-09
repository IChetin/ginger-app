from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def ensure_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("naive datetime is forbidden")
    return value.astimezone(ZoneInfo("UTC"))


def validate_iana_timezone(timezone_name: str) -> str:
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"unknown IANA timezone: {timezone_name}") from exc
    return timezone_name


def to_venue_local(utc_dt: datetime, venue_timezone: str) -> datetime:
    return ensure_aware_utc(utc_dt).astimezone(ZoneInfo(venue_timezone))


def venue_local_to_utc(local_dt: datetime, venue_timezone: str) -> datetime:
    """Convert venue-local datetime to UTC. Naive values are treated as venue-local."""
    validate_iana_timezone(venue_timezone)
    zone = ZoneInfo(venue_timezone)
    if local_dt.tzinfo is None:
        aware_local = local_dt.replace(tzinfo=zone)
    else:
        aware_local = local_dt.astimezone(zone)
    return aware_local.astimezone(ZoneInfo("UTC"))


def venue_local_date(utc_dt: datetime, venue_timezone: str) -> date:
    return to_venue_local(utc_dt, venue_timezone).date()
