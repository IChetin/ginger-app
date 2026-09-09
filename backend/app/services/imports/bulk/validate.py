"""Проверки черновика, которым нужна база: валюты, страны, часовые пояса, даты."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.references import Currency
from app.schemas.bulk_import import (
    BulkImportDraft,
    BulkIssue,
    BulkSeriesDraft,
    IssueSeverity,
)
from app.services.imports.bulk.references import AUTO_COUNTRY_NAMES, ReferenceResolution
from app.services.imports.bulk.template import COLUMN_BY_FIELD
from app.utils.timezone import validate_iana_timezone


class _Reporter:
    def __init__(self, draft: BulkImportDraft) -> None:
        self._letters = draft.column_letters
        self.issues: list[BulkIssue] = []

    def add(
        self,
        severity: IssueSeverity,
        *,
        code: str,
        message: str,
        row: int,
        field_name: str,
        series_key: str,
    ) -> None:
        self.issues.append(
            BulkIssue(
                severity=severity,
                code=code,
                message=message,
                row=row,
                column=self._letters.get(field_name),
                field=field_name,
                series_key=series_key,
            )
        )

    def error(
        self,
        *,
        code: str,
        message: str,
        row: int,
        field_name: str,
        series_key: str,
    ) -> None:
        self.add(
            "error",
            code=code,
            message=message,
            row=row,
            field_name=field_name,
            series_key=series_key,
        )

    def warn(
        self,
        *,
        code: str,
        message: str,
        row: int,
        field_name: str,
        series_key: str,
    ) -> None:
        self.add(
            "warning",
            code=code,
            message=message,
            row=row,
            field_name=field_name,
            series_key=series_key,
        )


def _validate_series_shape(series: BulkSeriesDraft, reporter: _Reporter) -> None:
    if series.starts_on > series.ends_on:
        reporter.error(
            code="series_dates_swapped",
            message=(
                f"{COLUMN_BY_FIELD['series_start'].label}: начало серии "
                f"({series.starts_on:%d.%m.%Y}) позже её конца ({series.ends_on:%d.%m.%Y})"
            ),
            row=series.source_row,
            field_name="series_start",
            series_key=series.import_key,
        )
        return

    for event in series.events:
        for flight in event.flights:
            if series.starts_on <= flight.play_date <= series.ends_on:
                continue
            reporter.error(
                code="date_outside_series",
                message=(
                    f"{COLUMN_BY_FIELD['date'].label}: {flight.play_date:%d.%m.%Y} вне дат серии "
                    f"({series.starts_on:%d.%m.%Y} — {series.ends_on:%d.%m.%Y})"
                ),
                row=flight.source_row,
                field_name="date",
                series_key=series.import_key,
            )


def _validate_timezone(series: BulkSeriesDraft, reporter: _Reporter) -> None:
    try:
        validate_iana_timezone(series.timezone)
    except ValueError:
        reporter.error(
            code="unknown_timezone",
            message=(
                f"{COLUMN_BY_FIELD['timezone'].label}: «{series.timezone}» — не IANA-зона. "
                "Нужны имена вида Europe/Kaliningrad, Europe/Minsk, Asia/Nicosia."
            ),
            row=series.source_row,
            field_name="timezone",
            series_key=series.import_key,
        )


async def validate_draft(
    session: AsyncSession,
    draft: BulkImportDraft,
    resolution: ReferenceResolution,
) -> BulkImportDraft:
    """Возвращает черновик с дополненным списком замечаний."""
    reporter = _Reporter(draft)

    currency_codes = {item.currency_code for item in draft.series}
    known_currencies = set(
        await session.scalars(select(Currency.code).where(Currency.code.in_(currency_codes)))
    )

    for series in draft.series:
        _validate_series_shape(series, reporter)
        _validate_timezone(series, reporter)

        if series.currency_code not in known_currencies:
            reporter.error(
                code="unknown_currency",
                message=(
                    f"{COLUMN_BY_FIELD['currency'].label}: валюта «{series.currency_code}» "
                    "не заведена в системе. Валюты создаются вручную вместе с курсом ЦБ."
                ),
                row=series.source_row,
                field_name="currency",
                series_key=series.import_key,
            )

        if (
            series.country_code not in resolution.countries
            and series.country_code not in AUTO_COUNTRY_NAMES
        ):
            reporter.error(
                code="unknown_country",
                message=(
                    f"{COLUMN_BY_FIELD['country'].label}: страна «{series.country_code}» "
                    "не заведена в системе и не входит в список автосоздания."
                ),
                row=series.source_row,
                field_name="country",
                series_key=series.import_key,
            )

        venue = resolution.venue_for(series.venue_name)
        if venue is not None and venue.timezone != series.timezone:
            reporter.warn(
                code="venue_timezone_mismatch",
                message=(
                    f"У площадки «{venue.name}» в системе пояс {venue.timezone}, "
                    f"в файле {series.timezone}. Импорт возьмёт пояс из файла, "
                    "карточку площадки не тронет."
                ),
                row=series.source_row,
                field_name="timezone",
                series_key=series.import_key,
            )

    return draft.model_copy(update={"issues": [*draft.issues, *reporter.issues]})
