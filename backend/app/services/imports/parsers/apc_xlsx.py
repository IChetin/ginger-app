from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import range_boundaries

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
    safe_xlsx_bytes,
    token_similarity,
)


@dataclass
class _RawRow:
    source_row: int
    number: int
    play_date: date
    play_time: time
    name: str
    buyin: Decimal | None
    buyin_raw: str
    start_stack: int | None
    late_reg_level: int | None
    guarantee: Decimal | None
    guarantee_note: str | None
    notes: list[str] = field(default_factory=list)


class AmberPokerChampionshipXlsxParser:
    name = "apc_xlsx_v1"
    organizer_slugs = frozenset({"apc"})
    supported_types = frozenset({"xlsx"})
    description = "Amber Poker Championship: XLSX лист «Анонс», группировка флайтов по №"

    def supports(self, ctx: ParserContext, data: bytes) -> bool:
        if ctx.import_kind != "schedule":
            return False
        if ctx.detected_type != "xlsx":
            return False
        if not organizer_slug_allowed(self.organizer_slugs, ctx):
            return False
        try:
            sheet = self._load_announcement_sheet(data)
        except Exception:  # noqa: BLE001
            return False
        title = str(sheet.cell(2, 2).value or "")
        headers = [str(sheet.cell(3, col).value or "").lower() for col in range(1, 13)]
        joined = " ".join(headers)
        return (
            "amber poker championship" in title.lower()
            and "дата" in joined
            and "время" in joined
            and "событие" in joined
            and "бай" in joined
        )

    def parse(self, ctx: ParserContext, data: bytes) -> ParseResult:
        year = (ctx.series_starts_on or date.today()).year
        currency = (ctx.default_currency_code or "RUB").upper()
        sheet = self._load_announcement_sheet(data)
        merged = self._merged_value_map(sheet)
        rows = self._read_rows(sheet, merged, year=year)
        events, issues = self._group_events(rows, currency=currency, sheet_name=sheet.title)
        confidence = Decimal("0.93")
        if issues:
            confidence = Decimal("0.85")
        if any(item.code == "duplicate_source_number" for item in issues):
            confidence = Decimal("0.82")
        return ParseResult(
            events=events,
            unparsed_rows=[],
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
        )

    def _load_announcement_sheet(self, data: bytes) -> Any:
        bio = safe_xlsx_bytes(data)
        workbook = load_workbook(bio, data_only=True, read_only=False)
        for worksheet in workbook.worksheets:
            if worksheet.sheet_state == "visible":
                title = str(worksheet.cell(2, 2).value or worksheet.title)
                if (
                    "amber poker championship" in title.lower()
                    or worksheet.title.strip().lower()
                    in {
                        "анонс",
                        "announcement",
                    }
                ):
                    return worksheet
        raise ValueError("APC announcement sheet not found")

    def _merged_value_map(self, sheet: Any) -> dict[tuple[int, int], Any]:
        values: dict[tuple[int, int], Any] = {}
        for merged in sheet.merged_cells.ranges:
            min_col, min_row, max_col, max_row = range_boundaries(str(merged))
            if min_col is None or min_row is None or max_col is None or max_row is None:
                continue
            start_col, start_row, end_col, end_row = min_col, min_row, max_col, max_row
            value = sheet.cell(start_row, start_col).value
            for row in range(start_row, end_row + 1):
                for col in range(start_col, end_col + 1):
                    values[(row, col)] = value
        return values

    def _cell(self, sheet: Any, merged: dict[tuple[int, int], Any], row: int, col: int) -> Any:
        value = sheet.cell(row, col).value
        if value is None:
            return merged.get((row, col))
        return value

    def _read_rows(
        self,
        sheet: Any,
        merged: dict[tuple[int, int], Any],
        *,
        year: int,
    ) -> list[_RawRow]:
        rows: list[_RawRow] = []
        for row_idx in range(4, sheet.max_row + 1):
            number_raw = self._cell(sheet, merged, row_idx, 3)
            name_raw = self._cell(sheet, merged, row_idx, 5)
            if number_raw is None or name_raw is None:
                # Notes / footer start.
                text = str(self._cell(sheet, merged, row_idx, 1) or "")
                if text.startswith("•") or text.lower().startswith("все турнир"):
                    break
                continue
            try:
                number = int(number_raw)
            except (TypeError, ValueError):
                continue
            play_date = parse_ru_day_month(self._cell(sheet, merged, row_idx, 1), year=year)
            play_time = parse_time_value(self._cell(sheet, merged, row_idx, 4))
            if play_date is None or play_time is None:
                continue
            buyin_raw = self._cell(sheet, merged, row_idx, 6)
            buyin, notes = self._parse_buyin(buyin_raw)
            stack = self._parse_stack(self._cell(sheet, merged, row_idx, 7))
            late_reg = self._parse_late_reg(self._cell(sheet, merged, row_idx, 10))
            guarantee, guarantee_note = self._parse_guarantee(
                self._cell(sheet, merged, row_idx, 12)
            )
            rows.append(
                _RawRow(
                    source_row=row_idx,
                    number=number,
                    play_date=play_date,
                    play_time=play_time,
                    name=str(name_raw).strip(),
                    buyin=buyin,
                    buyin_raw=str(buyin_raw),
                    start_stack=stack,
                    late_reg_level=late_reg,
                    guarantee=guarantee,
                    guarantee_note=guarantee_note,
                    notes=notes,
                )
            )
        return rows

    def _parse_buyin(self, value: Any) -> tuple[Decimal | None, list[str]]:
        notes: list[str] = []
        if value is None:
            return None, notes
        if isinstance(value, int | float | Decimal):
            return (Decimal(str(value)) * Decimal("100")), notes
        text = str(value).strip()
        if text in {"-", "—", "–"}:
            return None, notes
        match = re.match(r"^\s*0\s*/\s*(\d+(?:[.,]\d+)?)\s*$", text)
        if match:
            reentry = parse_decimal(match.group(1))
            if reentry is not None:
                notes.append(f"Re-entry {reentry * Decimal('100')} RUB")
            return Decimal("0"), notes
        amount = parse_decimal(text)
        if amount is None:
            return None, notes
        return amount * Decimal("100"), notes

    def _parse_stack(self, value: Any) -> int | None:
        if value is None:
            return None
        text = str(value)
        # Prefer the larger stack when "2500 / 10000".
        parts = [parse_int(part) for part in re.split(r"[/\\]", text)]
        nums = [part for part in parts if part is not None]
        if not nums:
            return None
        return max(nums)

    def _parse_late_reg(self, value: Any) -> int | None:
        if value is None:
            return None
        match = re.search(r"(\d+)", str(value))
        return int(match.group(1)) if match else None

    def _parse_guarantee(self, value: Any) -> tuple[Decimal | None, str | None]:
        if value is None:
            return None, None
        if isinstance(value, int | float | Decimal):
            return Decimal(str(value)), None
        text = str(value).strip()
        if "билет" in text.lower():
            return None, text
        amount = parse_decimal(text)
        return amount, None

    def _group_events(
        self,
        rows: list[_RawRow],
        *,
        currency: str,
        sheet_name: str,
    ) -> tuple[list[DraftEvent], list[DraftCellIssue]]:
        by_number: dict[int, list[_RawRow]] = defaultdict(list)
        for row in rows:
            by_number[row.number].append(row)

        events: list[DraftEvent] = []
        issues: list[DraftCellIssue] = []
        for number, number_rows in sorted(
            by_number.items(), key=lambda item: item[1][0].source_row
        ):
            subgroups = self._split_number_group(number_rows)
            collision = len(subgroups) > 1
            for group_rows in subgroups:
                first = group_rows[0]
                buyin = next(
                    (row.buyin for row in group_rows if row.buyin is not None), Decimal("0")
                )
                start_stack = next((row.start_stack for row in group_rows if row.start_stack), None)
                late_reg = next(
                    (row.late_reg_level for row in group_rows if row.late_reg_level), None
                )
                guarantee = next(
                    (row.guarantee for row in group_rows if row.guarantee is not None), None
                )
                name = base_event_name(first.name)
                notes_parts: list[str] = []
                for row in group_rows:
                    notes_parts.extend(row.notes)
                    if row.guarantee_note:
                        notes_parts.append(row.guarantee_note)
                if buyin == 0:
                    notes_parts.append("Freeroll entry")

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
                            source_sheet=sheet_name,
                        )
                    )

                event_issues: list[DraftCellIssue] = []
                if collision:
                    event_issues.append(
                        DraftCellIssue(
                            field="number",
                            severity="error",
                            message=f"Duplicate source number {number} for different events",
                            code="duplicate_source_number",
                        )
                    )
                    issues.append(
                        DraftCellIssue(
                            field="number",
                            severity="error",
                            message=f"Duplicate source number {number}",
                            code="duplicate_source_number",
                        )
                    )
                if buyin == 0:
                    event_issues.append(
                        DraftCellIssue(
                            field="buyin",
                            severity="warning",
                            message="Freeroll buy-in is 0",
                            code="buyin_freeroll",
                        )
                    )

                tags = detect_tags(first.name)
                events.append(
                    DraftEvent(
                        number=number,
                        name=name[:160],
                        buyin=buyin,
                        currency_code=currency,
                        guarantee=guarantee,
                        game_type=detect_game_type(first.name),
                        tags=tags,
                        start_stack=start_stack,
                        reentry_unlimited="freeroll" in tags or "satellite" in tags,
                        late_reg_level=late_reg,
                        notes="; ".join(dict.fromkeys(notes_parts)) or None,
                        flights=flights,
                        issues=event_issues,
                        parse_path=ParsePath.CODE,
                        source_row=first.source_row,
                        source_sheet=sheet_name,
                        source_fragment=(
                            f"{sheet_name} · стр. {first.source_row} · "
                            f"{first.play_date.isoformat()} {first.play_time.strftime('%H:%M')} · "
                            f"{first.name} · {first.buyin_raw}"
                        )[:2000],
                    )
                )
        return events, issues

    def _split_number_group(self, rows: list[_RawRow]) -> list[list[_RawRow]]:
        """Merge same-number stages unless names clearly belong to different events."""
        groups: list[list[_RawRow]] = []
        for row in rows:
            placed = False
            for group in groups:
                score = token_similarity(base_event_name(group[0].name), base_event_name(row.name))
                if score >= Decimal("0.35"):
                    group.append(row)
                    placed = True
                    break
            if not placed:
                groups.append([row])
        return groups
