"""Сборка сырых строк листа в черновик: серия → турниры → флайты.

Здесь только то, что видно из самого файла: типы значений, группировка по ключам,
дубли и расхождения между строками. Проверки против базы — в `validate.py`.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal
from typing import Any

from app.models.enums import EventStatus, GameType
from app.schemas.bulk_import import (
    BulkEventDraft,
    BulkFlightDraft,
    BulkImportDraft,
    BulkIssue,
    BulkSeriesDraft,
    IssueSeverity,
)
from app.services.imports.bulk.normalize import (
    CellError,
    clean_text,
    normalize_key,
    parse_bool,
    parse_country_code,
    parse_currency_code,
    parse_date,
    parse_event_status,
    parse_game_type,
    parse_int,
    parse_money,
    parse_reentry,
    parse_tags,
    parse_time,
)
from app.services.imports.bulk.reader import RawRow, SheetRead
from app.services.imports.bulk.template import (
    COLUMN_BY_FIELD,
    DEMO_ROW_FINGERPRINTS,
    DEMO_SERIES_KEYS,
    REQUIRED_FIELDS,
    row_fingerprint,
)

MAX_LENGTHS: dict[str, int] = {
    "series_key": 64,
    "series_name": 160,
    "organizer": 128,
    "venue": 128,
    "city": 64,
    "timezone": 64,
    "event_key": 64,
    "event_name": 160,
    "flight": 16,
    "start_blinds": 32,
    "levels": 16,
    "itm_note": 40,
}


class IssueSink:
    def __init__(self) -> None:
        self.issues: list[BulkIssue] = []

    def add(
        self,
        severity: IssueSeverity,
        *,
        code: str,
        message: str,
        row: RawRow | None = None,
        field_name: str | None = None,
        series_key: str | None = None,
    ) -> None:
        self.issues.append(
            BulkIssue(
                severity=severity,
                code=code,
                message=message,
                row=row.row_no if row is not None else None,
                column=row.column(field_name) if row is not None and field_name else None,
                field=field_name,
                series_key=series_key,
            )
        )

    def error(
        self,
        *,
        code: str,
        message: str,
        row: RawRow | None = None,
        field_name: str | None = None,
        series_key: str | None = None,
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
        row: RawRow | None = None,
        field_name: str | None = None,
        series_key: str | None = None,
    ) -> None:
        self.add(
            "warning",
            code=code,
            message=message,
            row=row,
            field_name=field_name,
            series_key=series_key,
        )

    @property
    def has_errors(self) -> bool:
        return any(item.severity == "error" for item in self.issues)


@dataclass
class ParsedRow:
    row: RawRow
    series_key: str
    series_name: str | None
    organizer: str | None
    venue: str | None
    city: str | None
    country: str | None
    timezone: str | None
    series_start: date | None
    series_end: date | None
    currency: str | None
    series_guarantee: Decimal | None
    poster_url: str | None
    source_url: str | None
    event_key: str
    event_number: int | None
    event_name: str | None
    flight: str | None
    play_date: date | None
    play_time: time | None
    buyin: Decimal | None
    buyin_bounty: Decimal | None
    guarantee: Decimal | None
    game_type: GameType | None
    tags: list[str]
    start_stack: int | None
    start_blinds: str | None
    levels: str | None
    reentry_count: int | None
    reentry_unlimited: bool
    late_reg_level: int | None
    itm_note: str | None
    is_final: bool
    status: EventStatus | None
    notes: str | None

    @property
    def row_no(self) -> int:
        return self.row.row_no


class _RowReader:
    """Читает ячейки строки, превращая `CellError` в замечание с адресом."""

    def __init__(self, row: RawRow, sink: IssueSink, series_key: str | None) -> None:
        self.row = row
        self.sink = sink
        self.series_key = series_key

    def take[T](self, field_name: str, parser: Callable[[Any], T], default: T) -> T:
        try:
            return parser(self.row.get(field_name))
        except CellError as exc:
            self.sink.error(
                code=exc.code,
                message=f"{COLUMN_BY_FIELD[field_name].label}: {exc.message}",
                row=self.row,
                field_name=field_name,
                series_key=self.series_key,
            )
            return default

    def take_money(self, field_name: str) -> Decimal | None:
        try:
            parsed = parse_money(self.row.get(field_name))
        except CellError as exc:
            self.sink.error(
                code=exc.code,
                message=f"{COLUMN_BY_FIELD[field_name].label}: {exc.message}",
                row=self.row,
                field_name=field_name,
                series_key=self.series_key,
            )
            return None
        if parsed.warning == "money_cleaned":
            self.sink.warn(
                code="money_cleaned",
                message=(
                    f"{COLUMN_BY_FIELD[field_name].label}: «{self.row.get(field_name)}» "
                    f"прочитано как {parsed.value}. Пишите в ячейку только число."
                ),
                row=self.row,
                field_name=field_name,
                series_key=self.series_key,
            )
        return parsed.value

    def take_int(self, field_name: str) -> int | None:
        try:
            return parse_int(self.row.get(field_name)).value
        except CellError as exc:
            self.sink.error(
                code=exc.code,
                message=f"{COLUMN_BY_FIELD[field_name].label}: {exc.message}",
                row=self.row,
                field_name=field_name,
                series_key=self.series_key,
            )
            return None

    def take_text(self, field_name: str) -> str | None:
        text = clean_text(self.row.get(field_name))
        if text is None:
            return None
        limit = MAX_LENGTHS.get(field_name)
        if limit is not None and len(text) > limit:
            self.sink.error(
                code="too_long",
                message=(
                    f"{COLUMN_BY_FIELD[field_name].label}: не больше {limit} символов "
                    f"(сейчас {len(text)})"
                ),
                row=self.row,
                field_name=field_name,
                series_key=self.series_key,
            )
            return None
        return text


def _parse_row(row: RawRow, sink: IssueSink) -> ParsedRow | None:
    series_key_raw = clean_text(row.get("series_key"))
    reader = _RowReader(row, sink, series_key_raw)

    missing = [name for name in REQUIRED_FIELDS if row.get(name) in (None, "")]
    for name in missing:
        sink.error(
            code="required_missing",
            message=f"{COLUMN_BY_FIELD[name].label}: обязательное поле не заполнено",
            row=row,
            field_name=name,
            series_key=series_key_raw,
        )

    series_key = reader.take_text("series_key")
    event_key = reader.take_text("event_key")
    if series_key is None or event_key is None:
        return None

    reentry_count, reentry_unlimited = reader.take(
        "reentry", parse_reentry, (None, False)
    )
    return ParsedRow(
        row=row,
        series_key=series_key,
        series_name=reader.take_text("series_name"),
        organizer=reader.take_text("organizer"),
        venue=reader.take_text("venue"),
        city=reader.take_text("city"),
        country=reader.take("country", parse_country_code, None),
        timezone=reader.take_text("timezone"),
        series_start=reader.take("series_start", parse_date, None),
        series_end=reader.take("series_end", parse_date, None),
        currency=reader.take("currency", parse_currency_code, None),
        series_guarantee=reader.take_money("series_guarantee"),
        poster_url=clean_text(row.get("poster_url")),
        source_url=clean_text(row.get("source_url")),
        event_key=event_key,
        event_number=reader.take_int("event_number"),
        event_name=reader.take_text("event_name"),
        flight=reader.take_text("flight"),
        play_date=reader.take("date", parse_date, None),
        play_time=reader.take("time", parse_time, None),
        buyin=reader.take_money("buyin"),
        buyin_bounty=reader.take_money("buyin_bounty"),
        guarantee=reader.take_money("guarantee"),
        game_type=reader.take("game_type", parse_game_type, None),
        tags=reader.take("tags", parse_tags, []),
        start_stack=reader.take_int("start_stack"),
        start_blinds=reader.take_text("start_blinds"),
        levels=reader.take_text("levels"),
        reentry_count=reentry_count,
        reentry_unlimited=reentry_unlimited,
        late_reg_level=reader.take_int("late_reg_level"),
        itm_note=reader.take_text("itm_note"),
        is_final=reader.take("is_final", parse_bool, False),
        status=reader.take("status", parse_event_status, None),
        notes=clean_text(row.get("notes")),
    )


@dataclass
class _Merger:
    """Первое непустое значение выигрывает; другое непустое — расхождение."""

    sink: IssueSink
    series_key: str
    values: dict[str, Any] = field(default_factory=dict)
    origin: dict[str, RawRow] = field(default_factory=dict)

    def offer(self, field_name: str, value: Any, row: RawRow) -> None:
        if value is None or value == [] or value == "":
            return
        if field_name not in self.values:
            self.values[field_name] = value
            self.origin[field_name] = row
            return
        if self.values[field_name] == value:
            return
        first_row = self.origin[field_name].row_no
        self.sink.warn(
            code="row_mismatch",
            message=(
                f"{COLUMN_BY_FIELD[field_name].label}: значение отличается от строки "
                f"{first_row} ({self.values[field_name]} ≠ {value}). "
                f"Взято значение из строки {first_row}."
            ),
            row=row,
            field_name=field_name,
            series_key=self.series_key,
        )

    def get[T](self, field_name: str, default: T) -> T | Any:
        return self.values.get(field_name, default)


def assemble_draft(read: SheetRead) -> BulkImportDraft:
    sink = IssueSink()
    demo_rows: list[int] = []
    parsed_rows: list[ParsedRow] = []

    for row in read.rows:
        fingerprint = row_fingerprint(row.values)
        if fingerprint in DEMO_ROW_FINGERPRINTS:
            demo_rows.append(row.row_no)
            continue
        parsed = _parse_row(row, sink)
        if parsed is None:
            continue
        if row.demo_fill:
            sink.warn(
                code="demo_row_edited",
                message=(
                    "Строка помечена как пример, но данные изменены — она будет загружена. "
                    "Если это остаток шаблона, удалите строку."
                ),
                row=row,
                field_name="series_key",
                series_key=parsed.series_key,
            )
        if normalize_key(parsed.series_key) in DEMO_SERIES_KEYS:
            sink.warn(
                code="demo_key_reused",
                message=(
                    f"Ключ «{parsed.series_key}» взят из примера в шаблоне. "
                    "Задайте собственный ключ, иначе демо-данные и реальные смешаются."
                ),
                row=row,
                field_name="series_key",
                series_key=parsed.series_key,
            )
        parsed_rows.append(parsed)

    for title in read.unknown_headers:
        sink.warn(
            code="unknown_column",
            message=f"Колонка «{title}» не из шаблона — она проигнорирована.",
        )

    series_drafts = _group_rows(parsed_rows, sink)
    return BulkImportDraft(
        series=series_drafts,
        issues=sink.issues,
        demo_rows_skipped=demo_rows,
        empty_rows_skipped=read.empty_rows + len(read.note_rows),
        rows_total=len(read.rows),
        column_letters=dict(read.rows[0].columns) if read.rows else {},
    )


@dataclass
class _EventBucket:
    key: str
    display_key: str
    merger: _Merger
    first_row: RawRow
    flights: list[BulkFlightDraft] = field(default_factory=list)
    flight_rows: dict[str, RawRow] = field(default_factory=dict)


@dataclass
class _SeriesBucket:
    key: str
    display_key: str
    merger: _Merger
    first_row: RawRow
    events: dict[str, _EventBucket] = field(default_factory=dict)


def _group_rows(rows: list[ParsedRow], sink: IssueSink) -> list[BulkSeriesDraft]:
    buckets: dict[str, _SeriesBucket] = {}

    for parsed in rows:
        series_key = normalize_key(parsed.series_key)
        bucket = buckets.get(series_key)
        if bucket is None:
            bucket = _SeriesBucket(
                key=series_key,
                display_key=parsed.series_key,
                merger=_Merger(sink=sink, series_key=parsed.series_key),
                first_row=parsed.row,
            )
            buckets[series_key] = bucket

        for name, value in (
            ("series_name", parsed.series_name),
            ("organizer", parsed.organizer),
            ("venue", parsed.venue),
            ("city", parsed.city),
            ("country", parsed.country),
            ("timezone", parsed.timezone),
            ("series_start", parsed.series_start),
            ("series_end", parsed.series_end),
            ("currency", parsed.currency),
            ("series_guarantee", parsed.series_guarantee),
            ("poster_url", parsed.poster_url),
            ("source_url", parsed.source_url),
        ):
            bucket.merger.offer(name, value, parsed.row)

        event_key = normalize_key(parsed.event_key)
        event = bucket.events.get(event_key)
        if event is None:
            event = _EventBucket(
                key=event_key,
                display_key=parsed.event_key,
                merger=_Merger(sink=sink, series_key=parsed.series_key),
                first_row=parsed.row,
            )
            bucket.events[event_key] = event

        for name, value in (
            ("event_number", parsed.event_number),
            ("event_name", parsed.event_name),
            ("buyin", parsed.buyin),
            ("buyin_bounty", parsed.buyin_bounty),
            ("guarantee", parsed.guarantee),
            ("game_type", parsed.game_type),
            ("tags", parsed.tags),
            ("start_stack", parsed.start_stack),
            ("start_blinds", parsed.start_blinds),
            ("reentry", parsed.reentry_count),
            ("late_reg_level", parsed.late_reg_level),
            ("itm_note", parsed.itm_note),
            ("status", parsed.status),
            ("notes", parsed.notes),
        ):
            event.merger.offer(name, value, parsed.row)
        if parsed.reentry_unlimited:
            event.merger.values["reentry_unlimited"] = True

        if parsed.buyin is None and not parsed.is_final:
            sink.error(
                code="buyin_required",
                message=(
                    "бай-ин: пустой бай-ин допустим только у финального дня "
                    "(колонка is_final = да)"
                ),
                row=parsed.row,
                field_name="buyin",
                series_key=parsed.series_key,
            )

        flight_key = normalize_key(parsed.flight or "")
        if flight_key in event.flight_rows:
            first = event.flight_rows[flight_key].row_no
            label = parsed.flight or "без флайта"
            sink.error(
                code="duplicate_flight",
                message=(
                    f"Старт «{label}» турнира «{parsed.event_key}» уже задан в строке {first}. "
                    "Ключи (series_key, event_key, flight) должны быть уникальны в файле."
                ),
                row=parsed.row,
                field_name="flight",
                series_key=parsed.series_key,
            )
            continue
        event.flight_rows[flight_key] = parsed.row

        if parsed.play_date is None or parsed.play_time is None:
            continue
        event.flights.append(
            BulkFlightDraft(
                label=parsed.flight,
                play_date=parsed.play_date,
                play_time=parsed.play_time,
                level_minutes=parsed.levels,
                is_final=parsed.is_final,
                source_row=parsed.row_no,
            )
        )

    drafts = [_build_series(bucket, sink) for bucket in buckets.values()]
    return [item for item in drafts if item is not None]


# Без этих полей серию нельзя ни создать, ни показать в предпросмотре.
_SERIES_CRITICAL_FIELDS: tuple[str, ...] = (
    "series_name",
    "organizer",
    "venue",
    "city",
    "country",
    "timezone",
    "series_start",
    "series_end",
    "currency",
)


def _build_series(bucket: _SeriesBucket, sink: IssueSink) -> BulkSeriesDraft | None:
    merger = bucket.merger
    missing = [name for name in _SERIES_CRITICAL_FIELDS if merger.get(name, None) is None]
    if missing:
        titles = ", ".join(COLUMN_BY_FIELD[name].title for name in missing)
        sink.error(
            code="series_incomplete",
            message=(
                f"Серия «{bucket.display_key}» пропущена: не удалось прочитать {titles}. "
                "Исправьте отмеченные строки и загрузите файл заново."
            ),
            row=bucket.first_row,
            field_name="series_key",
            series_key=bucket.display_key,
        )
        return None

    events = [_build_event(bucket, event, sink) for event in bucket.events.values()]
    events = [item for item in events if item is not None]
    if not events:
        sink.error(
            code="series_no_events",
            message=(
                f"Серия «{bucket.display_key}»: не осталось ни одного турнира с датой и временем."
            ),
            row=bucket.first_row,
            field_name="series_key",
            series_key=bucket.display_key,
        )
        return None

    return BulkSeriesDraft(
        import_key=normalize_key(bucket.display_key),
        name=merger.get("series_name", ""),
        organizer_name=merger.get("organizer", ""),
        venue_name=merger.get("venue", ""),
        city=merger.get("city", ""),
        country_code=merger.get("country", ""),
        timezone=merger.get("timezone", ""),
        starts_on=merger.get("series_start", None),
        ends_on=merger.get("series_end", None),
        currency_code=merger.get("currency", ""),
        guarantee=merger.get("series_guarantee", None),
        poster_url=merger.get("poster_url", None),
        source_url=merger.get("source_url", None),
        events=events,
        source_row=bucket.first_row.row_no,
    )


def _build_event(
    series: _SeriesBucket,
    bucket: _EventBucket,
    sink: IssueSink,
) -> BulkEventDraft | None:
    merger = bucket.merger
    name = merger.get("event_name", None)
    if not bucket.flights or name is None:
        return None

    buyin = merger.get("buyin", None)
    if buyin is None:
        sink.error(
            code="event_buyin_missing",
            message=(
                f"Турнир «{bucket.display_key}»: ни в одной строке не указан бай-ин. "
                "Финальный день наследует бай-ин от строки со стартовым днём."
            ),
            row=bucket.first_row,
            field_name="buyin",
            series_key=series.display_key,
        )
        buyin = Decimal("0")

    bounty = merger.get("buyin_bounty", None)
    if bounty is not None and bounty > 0 and bounty >= buyin:
        sink.error(
            code="bounty_ge_buyin",
            message=(
                f"Турнир «{bucket.display_key}»: баунти-часть ({bounty}) должна быть меньше "
                f"полного бай-ина ({buyin}). В колонку buyin пишется сумма целиком."
            ),
            row=bucket.first_row,
            field_name="buyin_bounty",
            series_key=series.display_key,
        )
        bounty = None

    unlimited = bool(merger.get("reentry_unlimited", False))
    return BulkEventDraft(
        import_key=normalize_key(bucket.display_key),
        number=merger.get("event_number", None),
        name=name,
        buyin=buyin,
        buyin_bounty=bounty,
        currency_code=series.merger.get("currency", ""),
        guarantee=merger.get("guarantee", None),
        game_type=merger.get("game_type", None),
        tags=merger.get("tags", []),
        start_stack=merger.get("start_stack", None),
        start_blinds=merger.get("start_blinds", None),
        reentry_count=None if unlimited else merger.get("reentry", None),
        reentry_unlimited=unlimited,
        late_reg_level=merger.get("late_reg_level", None),
        day_end_note=merger.get("itm_note", None),
        status=merger.get("status", None),
        notes=merger.get("notes", None),
        flights=sorted(bucket.flights, key=lambda item: (item.play_date, item.play_time)),
        source_row=bucket.first_row.row_no,
    )
