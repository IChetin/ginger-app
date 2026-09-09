from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal
from io import BytesIO

import pdfplumber

from app.models.enums import ParsePath
from app.schemas.imports import DraftCellIssue, DraftEvent, DraftFlight, ParseResult
from app.services.imports.base import ParserContext, organizer_slug_allowed
from app.services.imports.parsers.common import (
    base_event_name,
    detect_game_type,
    detect_tags,
    extract_flight_label,
    parse_decimal,
    parse_int,
    parse_ru_day_month,
    parse_time_value,
)


@dataclass
class _RawRow:
    source_row: int
    number: int
    play_date: date
    play_time: time
    name: str
    game_text: str
    buyin: Decimal | None
    start_stack: int | None
    late_reg_level: int | None
    notes: list[str] = field(default_factory=list)
    guarantee: Decimal | None = None


class RussianPokerFestivalPdfParser:
    name = "rpf_pdf_v1"
    organizer_slugs = frozenset({"rpf"})
    supported_types = frozenset({"pdf"})
    description = "Russian Poker Festival: PDF с текстовым слоем, группировка по № турнира"

    def supports(self, ctx: ParserContext, data: bytes) -> bool:
        if ctx.import_kind != "schedule":
            return False
        if ctx.detected_type != "pdf":
            return False
        if not organizer_slug_allowed(self.organizer_slugs, ctx):
            return False
        try:
            with pdfplumber.open(BytesIO(data)) as pdf:
                if not pdf.pages:
                    return False
                text = pdf.pages[0].extract_text() or ""
        except Exception:  # noqa: BLE001
            return False
        lower = text.lower()
        markers = ("вх. плата", "всего в фишках", "добавка", "freeroll", "russian poker open")
        return sum(1 for marker in markers if marker in lower) >= 3

    def parse(self, ctx: ParserContext, data: bytes) -> ParseResult:
        year = (ctx.series_starts_on or date.today()).year
        currency = (ctx.default_currency_code or "RUB").upper()
        with pdfplumber.open(BytesIO(data)) as pdf:
            page = pdf.pages[0]
            tables = page.extract_tables() or []
        if not tables:
            return ParseResult(
                events=[],
                unparsed_rows=["No table found"],
                confidence=Decimal("0.2"),
                parser_used=self.name,
                parse_path=ParsePath.CODE,
                issues=[
                    DraftCellIssue(
                        field="events",
                        severity="error",
                        message="RPF table not found",
                        code="table_missing",
                    )
                ],
            )
        rows = self._read_rows(tables[0], year=year)
        events, issues = self._group_events(rows, currency=currency)
        confidence = Decimal("0.92") if events else Decimal("0.3")
        if issues:
            confidence = min(confidence, Decimal("0.86"))
        return ParseResult(
            events=events,
            unparsed_rows=[],
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
        )

    def _read_rows(self, table: list[list[str | None]], *, year: int) -> list[_RawRow]:
        rows: list[_RawRow] = []
        current_date: date | None = None
        for idx, raw in enumerate(table[1:], start=2):
            if not raw or len(raw) < 6:
                continue
            cells = [(cell or "").strip() for cell in raw]
            # Skip footer bullets.
            joined = " ".join(cells)
            if joined.startswith("•") or "условная единица" in joined.lower():
                break
            date_cell = cells[0]
            if date_cell:
                parsed = parse_ru_day_month(date_cell.replace("\n", " "), year=year)
                if parsed is not None:
                    current_date = parsed
            if current_date is None:
                continue
            number = parse_int(cells[1])
            play_time = parse_time_value(cells[2])
            name = cells[4]
            if number is None or play_time is None or not name:
                continue
            buyin, notes = self._parse_buyin(cells[5])
            stack = self._parse_stack(cells[7])
            late_reg = parse_int(cells[9]) if len(cells) > 9 else None
            guarantee = self._extract_guarantee(name)
            if buyin is None and cells[5].strip() in {"-", "—", "–"}:
                notes.append("Continuation day (buy-in inherited)")
            rows.append(
                _RawRow(
                    source_row=idx,
                    number=number,
                    play_date=current_date,
                    play_time=play_time,
                    name=name,
                    game_text=cells[3],
                    buyin=buyin,
                    start_stack=stack,
                    late_reg_level=late_reg,
                    notes=notes,
                    guarantee=guarantee,
                )
            )
        return rows

    def _parse_buyin(self, value: str) -> tuple[Decimal | None, list[str]]:
        notes: list[str] = []
        text = value.replace("\xa0", " ").strip()
        if not text or text in {"-", "—", "–"}:
            return None, notes
        match = re.match(r"^\s*0\s*/\s*([\d\s]+)\s*$", text)
        if match:
            reentry = parse_decimal(match.group(1))
            if reentry is not None:
                notes.append(f"Re-entry {reentry} RUB")
            return Decimal("0"), notes
        amount = parse_decimal(text)
        return amount, notes

    def _parse_stack(self, value: str) -> int | None:
        text = value.replace("\xa0", " ").strip()
        if not text or text in {"-", "—", "–"}:
            return None
        # "15 / 25 K" or "15 K"
        match = re.search(r"(\d[\d\s]*(?:[.,]\d+)?)\s*[kк]?\s*$", text.split("/")[-1], re.I)
        if not match:
            return None
        amount = parse_decimal(match.group(1))
        if amount is None:
            return None
        if re.search(r"[kк]\s*$", text.split("/")[-1], re.I):
            amount *= Decimal("1000")
        return int(amount)

    def _extract_guarantee(self, name: str) -> Decimal | None:
        match = re.search(r"(?i)гарантия\s+([\d\s]+)\s*руб", name)
        if not match:
            return None
        return parse_decimal(match.group(1))

    def _group_events(
        self,
        rows: list[_RawRow],
        *,
        currency: str,
    ) -> tuple[list[DraftEvent], list[DraftCellIssue]]:
        groups: dict[int, list[_RawRow]] = defaultdict(list)
        for row in rows:
            groups[row.number].append(row)

        events: list[DraftEvent] = []
        issues: list[DraftCellIssue] = []
        for number, group_rows in sorted(groups.items(), key=lambda item: item[1][0].source_row):
            first = group_rows[0]
            buyin = next((row.buyin for row in group_rows if row.buyin is not None), Decimal("0"))
            start_stack = next((row.start_stack for row in group_rows if row.start_stack), None)
            late_reg = next((row.late_reg_level for row in group_rows if row.late_reg_level), None)
            guarantee = next(
                (row.guarantee for row in group_rows if row.guarantee is not None), None
            )
            name = base_event_name(first.name)
            # Prefer a cleaner name without stage and trailing metadata noise.
            name = re.split(r",|\(|\[", name, maxsplit=1)[0].strip() or name
            notes: list[str] = []
            for row in group_rows:
                notes.extend(row.notes)
            if buyin == 0:
                notes.append("Freeroll entry")
            notes.append("Unlimited re-entries unless freezeout")

            flights: list[DraftFlight] = []
            for row in group_rows:
                label = extract_flight_label(row.name)
                if label is None and len(group_rows) > 1:
                    label = f"R{row.source_row}"[:16]
                flights.append(
                    DraftFlight(
                        label=label,
                        play_date=row.play_date,
                        play_time=row.play_time,
                        source_row=row.source_row,
                        source_page=1,
                    )
                )

            event_issues: list[DraftCellIssue] = []
            if buyin == 0:
                event_issues.append(
                    DraftCellIssue(
                        field="buyin",
                        severity="warning",
                        message="Freeroll buy-in is 0",
                        code="buyin_freeroll",
                    )
                )

            events.append(
                DraftEvent(
                    number=number,
                    name=name[:160],
                    buyin=buyin,
                    currency_code=currency,
                    guarantee=guarantee,
                    game_type=detect_game_type(f"{first.game_text} {first.name}"),
                    tags=detect_tags(first.name),
                    start_stack=start_stack,
                    reentry_unlimited=True,
                    late_reg_level=late_reg,
                    notes="; ".join(dict.fromkeys(notes)) or None,
                    flights=flights,
                    issues=event_issues,
                    parse_path=ParsePath.CODE,
                    source_row=first.source_row,
                    source_page=1,
                    source_fragment=(
                        f"с. 1 · стр. {first.source_row} · "
                        f"{first.play_date.isoformat()} {first.play_time.strftime('%H:%M')} · "
                        f"{first.name} · {first.game_text}"
                    )[:2000],
                )
            )
        return events, issues
