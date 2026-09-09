"""Russian Poker Tour schedule parser (JPG / image-PDF via OCR)."""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta, time
from decimal import Decimal
from io import BytesIO

import pdfplumber
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from app.models.enums import ParsePath
from app.schemas.imports import DraftCellIssue, DraftEvent, DraftFlight, ParseResult
from app.services.imports.base import ParserContext, organizer_slug_allowed
from app.services.imports.parsers.common import (
    detect_game_type,
    detect_tags,
    parse_decimal,
    parse_int,
    parse_ru_day_month,
    parse_time_value,
)

logger = logging.getLogger(__name__)

_DAY_HEADER_RE = re.compile(
    r"(?i)^\s*(\d{1,2})\s*"
    r"(январ\w*|феврал\w*|март\w*|апрел\w*|ма[йя]|июн\w*|июл\w*|"
    r"август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)"
)
# Colon form, or OCR-glued "1300" only when a title token follows.
_ROW_TIME_RE = re.compile(
    r"^\s*(\d{1,2}:\d{2}(?!\d)|\d{3,4}(?=\s+[|·\-'\"]*\s*[A-Za-zА-Яа-я(]))"
)
_BUYIN_SPLIT_RE = re.compile(r"(?<!\d)(\d{3,7})\s*\+\s*(\d{3,6})(?!\d)")
_BUYIN_SINGLE_RE = re.compile(r"(?<!\d)(\d{3,6})(?!\d)")
_GUARANTEE_RE = re.compile(
    r"[-–]?\s*(\d{1,3}(?:[.\s:]\d{3})+|\d{4,9})\s*(?:GTD|CTD|СТО|ОТО|GTP|GTONEE)\b",
    re.IGNORECASE,
)
_FLIGHT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\(\s*(?:turbo\s+)?day\s*1\s*([a-dа-д])\s*\)", re.I),
        "1letter",
    ),
    (re.compile(r"\(\s*day\s*([2-4])\s*\)", re.I), "day"),
    (re.compile(r"\(\s*day\s*1\s*\)", re.I), "1"),
    (re.compile(r"\(\s*final\s*day\s*\)", re.I), "final"),
    (re.compile(r"\(\s*final\s*table\s*\)", re.I), "final_table"),
    (re.compile(r"\(\s*stage\s*1\s*([a-dа-д])\s*\)", re.I), "stage"),
]
_DAY_END_RE = re.compile(
    r"(?i)(?<!\w)("
    r"till\s*\d+%|"
    r"itm\s*\d+%|"
    r"final\s*table|"
    r"\d+\s*tables?"
    r")(?!\w)"
)
_LEVEL_MIN_RE = re.compile(r"(?i)\b\d{1,2}\s*/\s*\d{1,2}\s*min\b|\b\d{1,2}\s*min\b")
_CYR_LETTER = {"А": "A", "В": "B", "С": "C", "Е": "E", "Д": "D"}


@dataclass
class _RawRow:
    source_row: int
    play_date: date
    play_time: time
    raw_name: str
    base_name: str
    flight_label: str | None
    buyin: Decimal | None
    buyin_bounty: Decimal | None
    guarantee: Decimal | None
    start_stack: int | None
    late_reg_level: int | None
    day_end_note: str | None
    is_closed: bool
    is_stage: bool
    tags: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


class RptScheduleOcrParser:
    name = "rpt_schedule_ocr_v1"
    organizer_slugs = frozenset({"rpt"})
    supported_types = frozenset({"pdf", "image"})
    description = (
        "Russian Poker Tour: JPG/PNG и image-PDF расписания (OCR), "
        "группировка флайтов по названию"
    )

    def supports(self, ctx: ParserContext, data: bytes) -> bool:
        if ctx.import_kind != "schedule":
            return False
        if ctx.detected_type not in {"pdf", "image"}:
            return False
        if not organizer_slug_allowed(self.organizer_slugs, ctx):
            return False
        filename = (ctx.filename or "").lower()
        if "rpt" in filename or "алтай" in filename or "altai" in filename:
            return True
        if ctx.organizer_slug == "rpt":
            return True
        if ctx.detected_type == "image":
            return ctx.skip_organizer_slug_check
        try:
            with pdfplumber.open(BytesIO(data)) as pdf:
                if not pdf.pages:
                    return False
                page = pdf.pages[0]
                text = (page.extract_text() or "").lower()
                markers = (
                    "russian poker tour",
                    "байин",
                    "поздняя",
                    "rpt main",
                )
                if sum(1 for marker in markers if marker in text) >= 2:
                    return True
                if page.images and not page.chars:
                    return ctx.organizer_slug == "rpt" or ctx.skip_organizer_slug_check
        except Exception:  # noqa: BLE001
            return False
        return False

    def parse(self, ctx: ParserContext, data: bytes) -> ParseResult:
        year = (ctx.series_starts_on or date.today()).year
        currency = (ctx.default_currency_code or "RUB").upper()
        image = self._load_image(data, detected_type=ctx.detected_type)
        ocr_text = self._ocr_text(image)
        return self._parse_lines(
            [line.rstrip() for line in ocr_text.splitlines() if line.strip()],
            year=year,
            currency=currency,
            starts_on=ctx.series_starts_on,
        )

    def parse_ocr_text(
        self,
        text: str,
        *,
        year: int,
        currency: str = "RUB",
        starts_on: date | None = None,
    ) -> ParseResult:
        """Deterministic path for unit tests (skip OCR)."""
        lines = [line.rstrip() for line in text.splitlines() if line.strip()]
        return self._parse_lines(
            lines,
            year=year,
            currency=currency.upper(),
            starts_on=starts_on,
        )

    def _parse_lines(
        self,
        lines: list[str],
        *,
        year: int,
        currency: str,
        starts_on: date | None = None,
    ) -> ParseResult:
        rows, unparsed, issues = self._read_lines(
            lines,
            year=year,
            starts_on=starts_on,
        )
        rows = self._resolve_closed_orphans(rows)
        events, group_issues = self._group_events(rows, currency=currency)
        issues.extend(group_issues)

        confidence = Decimal("0.88") if events else Decimal("0.25")
        if unparsed:
            confidence = min(confidence, Decimal("0.72"))
        if any(issue.severity == "error" for issue in issues):
            confidence = min(confidence, Decimal("0.7"))
        if any(issue.code == "closed_orphan" for issue in issues):
            confidence = min(confidence, Decimal("0.78"))

        return ParseResult(
            events=events,
            unparsed_rows=unparsed,
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
        )

    def _load_image(self, data: bytes, *, detected_type: str) -> Image.Image:
        if detected_type == "image":
            return Image.open(BytesIO(data)).convert("RGB")
        with pdfplumber.open(BytesIO(data)) as pdf:
            if not pdf.pages:
                raise ValueError("Empty PDF")
            page = pdf.pages[0]
            # Prefer native embedded bitmap (image-PDF); render only as fallback.
            if page.images:
                stream = page.images[0]["stream"]
                embedded = Image.open(BytesIO(stream.get_data())).convert("RGB")
                # Tiny embeds are often thumbnails — render the page instead.
                if embedded.width >= 800:
                    return embedded
            rendered = page.to_image(resolution=250).original
            return rendered.convert("RGB")

    def _ocr_text(self, image: Image.Image) -> str:
        prepared = self._preprocess(image)
        return pytesseract.image_to_string(prepared, lang="eng+rus", config="--psm 6")

    def _preprocess(self, image: Image.Image) -> Image.Image:
        # Dense colorful posters (≈900px wide) need a stronger upscale than
        # plain 2× — 3× LANCZOS + autocontrast beats Real-ESRGAN for tesseract
        # on these schedules without an extra model dependency.
        if image.width < 1400:
            scale = 3.0
        elif image.width < 2000:
            scale = 2.0
        else:
            scale = 1.5
        up = image.resize(
            (int(image.width * scale), int(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
        gray = ImageOps.grayscale(up)
        gray = ImageOps.autocontrast(ImageEnhance.Contrast(gray).enhance(2.0))
        return gray.filter(ImageFilter.SHARPEN)

    def _read_lines(
        self,
        lines: list[str],
        *,
        year: int,
        starts_on: date | None = None,
    ) -> tuple[list[_RawRow], list[str], list[DraftCellIssue]]:
        rows: list[_RawRow] = []
        unparsed: list[str] = []
        issues: list[DraftCellIssue] = []
        # Image-PDF OCR often drops day headers — seed from series start and
        # advance when wall-clock time wraps to a smaller value.
        current_date: date | None = starts_on
        prev_time: time | None = None
        used_time_rollover = False
        recent_named: list[_RawRow] = []

        for idx, raw_line in enumerate(lines, start=1):
            line = self._normalize_ocr(raw_line)
            if not line:
                continue
            lower = line.lower()
            if lower.startswith("время") or "байин" in lower and "стек" in lower:
                continue
            if "russian poker tour" in lower and not _ROW_TIME_RE.match(line):
                continue

            day_match = _DAY_HEADER_RE.match(line)
            if day_match:
                parsed = parse_ru_day_month(
                    f"{day_match.group(1)} {day_match.group(2)}",
                    year=year,
                )
                if parsed is not None:
                    current_date = parsed
                    prev_time = None
                else:
                    unparsed.append(raw_line)
                    issues.append(
                        DraftCellIssue(
                            field="play_date",
                            severity="warning",
                            message=f"Invalid day header: {line}",
                            code="bad_day_header",
                        )
                    )
                continue

            if current_date is None:
                continue
            time_match = _ROW_TIME_RE.match(line)
            if not time_match:
                if re.search(r"closed|gtd|championship|event|satellite", line, re.I):
                    unparsed.append(raw_line)
                continue

            play_time = self._parse_clock(time_match.group(1))
            if play_time is None:
                unparsed.append(raw_line)
                continue

            if (
                prev_time is not None
                and play_time < prev_time
                and prev_time.hour >= 16
                and play_time.hour <= 14
            ):
                # Overnight wrap only — avoids mid-day OCR time glitches (21→7).
                current_date = current_date + timedelta(days=1)
                used_time_rollover = True

            parsed_row = self._parse_row(line, play_date=current_date, source_row=idx)
            if parsed_row is None:
                recovered = self._recover_nameless_row(
                    line,
                    play_date=current_date,
                    source_row=idx,
                    recent=recent_named,
                )
                if recovered is not None:
                    rows.append(recovered)
                    recent_named.append(recovered)
                    prev_time = play_time
                    continue
                unparsed.append(raw_line)
                issues.append(
                    DraftCellIssue(
                        field="events",
                        severity="warning",
                        message=f"Unparsed schedule row: {line[:120]}",
                        code="unparsed_row",
                    )
                )
                continue
            rows.append(parsed_row)
            if not parsed_row.is_closed:
                recent_named.append(parsed_row)
            prev_time = play_time

        if used_time_rollover and starts_on is not None:
            issues.append(
                DraftCellIssue(
                    field="play_date",
                    severity="warning",
                    message=(
                        "Day headers missing/partial in OCR; dates inferred from "
                        f"series start {starts_on.isoformat()} and time wrap"
                    ),
                    code="date_inferred",
                )
            )
        return rows, unparsed, issues

    def _parse_clock(self, raw: str) -> time | None:
        token = raw.strip()
        if re.fullmatch(r"\d{3,4}", token):
            if len(token) == 3:
                token = f"0{token[0]}:{token[1:]}"
            else:
                token = f"{token[:2]}:{token[2:]}"
        match = re.fullmatch(r"(\d{1,2}):(\d{2})", token)
        if not match:
            return parse_time_value(token)
        hour, minute = int(match.group(1)), int(match.group(2))
        # Common OCR: leading 1 → 7 (71:00 → 11:00).
        if hour >= 24 and 70 <= hour <= 79:
            hour -= 60
        if minute > 59:
            return None
        if hour > 23:
            return None
        return time(hour, minute)

    def _recover_nameless_row(
        self,
        line: str,
        *,
        play_date: date,
        source_row: int,
        recent: list[_RawRow],
    ) -> _RawRow | None:
        """Reattach OCR rows that lost the title but kept buy-in/stack columns."""
        if not recent:
            return None
        # Must look numeric-heavy (no tournament words).
        if re.search(
            r"(?i)championship|event|satellite|battle|cup|main|ladies|monster|closed",
            line,
        ):
            return None
        time_match = _ROW_TIME_RE.match(line)
        if not time_match:
            return None
        play_time = self._parse_clock(time_match.group(1))
        if play_time is None:
            return None
        rest = line[time_match.end() :].strip()
        if re.search(r"[A-Za-zА-Яа-яЁё]{4,}", rest):
            return None

        buyin: Decimal | None = None
        buyin_bounty: Decimal | None = None
        split = _BUYIN_SPLIT_RE.search(rest)
        after = rest
        if split:
            left = self._repair_buyin_amount(parse_int(split.group(1)))
            right = self._repair_buyin_amount(parse_int(split.group(2)))
            if left is None or right is None:
                return None
            buyin = Decimal(left + right)
            buyin_bounty = Decimal(right)
            after = rest[split.end() :].strip()
        else:
            for match in _BUYIN_SINGLE_RE.finditer(rest):
                candidate = self._repair_buyin_amount(parse_int(match.group(1)))
                if candidate is not None and candidate >= 1000:
                    buyin = Decimal(candidate)
                    after = rest[match.end() :].strip()
                    break
        if buyin is None or buyin < Decimal("1000") or buyin > Decimal("100000"):
            return None

        day_end = None
        day_end_match = _DAY_END_RE.search(after)
        if day_end_match:
            day_end = re.sub(r"\s+", " ", day_end_match.group(1)).strip()

        after_norm = _LEVEL_MIN_RE.sub(" ", after)
        nums = [parse_int(token) for token in re.findall(r"\b(\d{1,6})\b", after_norm)]
        nums = [n for n in nums if n is not None]
        stack = None
        late_level = None
        for value in nums:
            if value >= 1000 and stack is None:
                stack = value
                continue
            if stack is not None and 1 <= value <= 40 and late_level is None:
                late_level = value
                break

        parent: _RawRow | None = None
        for row in reversed(recent):
            if row.is_closed or row.buyin is None:
                continue
            if row.buyin == buyin:
                parent = row
                break
            if stack and row.start_stack == stack and abs(int(row.buyin - buyin)) <= 500:
                parent = row
                break

        # Signature fallbacks when title OCR dropped before any parent row.
        synthetic_name: str | None = None
        synthetic_stage = False
        if parent is None and buyin == Decimal("39000") and stack == 50000:
            for row in reversed(recent):
                if "MAIN EVENT" in row.base_name.upper() and not row.is_stage:
                    parent = row
                    break
            if parent is None:
                synthetic_name = "RPT MAIN EVENT"
        if parent is None and buyin == Decimal("9500") and stack == 10000:
            for row in reversed(recent):
                if row.is_stage and "MAIN EVENT" in row.base_name.upper():
                    parent = row
                    break
            if parent is None:
                synthetic_name = "RPT MAIN EVENT STAGE"
                synthetic_stage = True
        if parent is None and buyin == Decimal("15000") and buyin_bounty == Decimal("5000"):
            synthetic_name = "MONSTER EVENT"

        if parent is None and synthetic_name is None:
            return None

        base_name = parent.base_name if parent is not None else synthetic_name
        assert base_name is not None
        is_stage = parent.is_stage if parent is not None else synthetic_stage
        tags = list(parent.tags) if parent is not None else (
            ["satellite"] if is_stage else []
        )

        return _RawRow(
            source_row=source_row,
            play_date=play_date,
            play_time=play_time,
            raw_name=parent.raw_name if parent is not None else base_name,
            base_name=base_name,
            flight_label=None,
            buyin=buyin,
            buyin_bounty=(
                buyin_bounty
                if buyin_bounty is not None
                else (parent.buyin_bounty if parent is not None else None)
            ),
            guarantee=parent.guarantee if parent is not None else None,
            start_stack=stack or (parent.start_stack if parent is not None else None),
            late_reg_level=late_level
            or (parent.late_reg_level if parent is not None else None),
            day_end_note=day_end or (parent.day_end_note if parent is not None else None),
            is_closed=False,
            is_stage=is_stage,
            tags=tags,
            notes=["Title recovered from previous OCR row"],
        )

    def _normalize_ocr(self, text: str) -> str:
        value = text.replace("\xa0", " ").replace("—", "-").replace("–", "-")
        value = value.replace("[", "(").replace("]", ")")
        value = value.replace("{", "(").replace("}", ")")
        value = value.replace("РКО", "PKO").replace("РкО", "PKO").replace("рко", "PKO")
        value = re.sub(r"\bСТО\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bСТБ\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bСТР\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bОТО\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bCTD\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bGTP\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bGID\b", "GTD", value, flags=re.I)
        value = re.sub(r"\bGTONEE\b", "GTD", value, flags=re.I)
        # ALTAI / ALTAI-lookalikes from OCR.
        value = re.sub(r"(?i)\bА[ЕЭ]?ТА[!IЛ\]]?\b", "ALTAI", value)
        value = re.sub(r"(?i)\bАСТА[!I]?\b", "ALTAI", value)
        value = re.sub(r"(?i)\bALT(?:A[Il!\]1]|AL|A)\b", "ALTAI", value)
        value = re.sub(r"(?i)\bАТА!?\b", "ALTAI", value)
        value = re.sub(r"(?i)\bОРЕМ\b", "OPEN", value)
        value = re.sub(r"(?i)\bКНОСКО[ОAА]?Т\b", "KNOCKOUT", value)
        value = re.sub(r"(?i)\bКНОСКОСТ\b", "KNOCKOUT", value)
        value = re.sub(r"(?i)\bОМАНА\b", "OMAHA", value)
        value = re.sub(r"(?i)\bi?high\s*rol+e*rs?\b", "HIGHROLLERS", value)
        # Completely mangled Highrollers-by-Pokerdom title.
        if re.search(r"(?i)pokerdom", value) and not re.search(r"(?i)highroller", value):
            kept = re.findall(
                r"\(\s*(?:day|stage|final|ОАУ)[^)]*\)",
                value,
                flags=re.I,
            )
            value = re.sub(
                r"(?i)^(\d{1,2}:\d{2}\s+|\d{3,4}\s+).*?\bby\s+pokerdom\b",
                r"\1HIGHROLLERS CUP BY POKERDOM",
                value,
            )
            if kept:
                # Normalize kept OCR day markers.
                kept_norm = [
                    re.sub(r"(?i)\(\s*ОАУ\s*1\s*\)", "(DAY 1)", item) for item in kept
                ]
                kept_norm = [
                    re.sub(r"(?i)\(\s*DAY1\s*\)", "(DAY 1)", item) for item in kept_norm
                ]
                value = value.replace(
                    "HIGHROLLERS CUP BY POKERDOM",
                    "HIGHROLLERS CUP BY POKERDOM " + " ".join(kept_norm),
                    1,
                )
        value = re.sub(r"(?i)\(\s*ОАУ\s*1\s*\)", "(DAY 1)", value)
        value = re.sub(r"(?i)\(\s*DAY1\s*\)", "(DAY 1)", value)
        # Flight letter OCR: 1→7, A→4, B→8, D→0/O, IC→1C, bare С→1C.
        value = re.sub(r"(?i)day\s*7([a-dа-д])\b", r"DAY 1\1", value)
        value = re.sub(r"(?i)day\s*14\b", "DAY 1A", value)
        value = re.sub(r"(?i)day\s*18\b", "DAY 1B", value)
        value = re.sub(r"(?i)day\s*10\b", "DAY 1D", value)
        value = re.sub(r"(?i)day\s*1[о0]\b", "DAY 1D", value)
        value = re.sub(r"(?i)day\s*1[Ссc]\b", "DAY 1C", value)
        value = re.sub(r"(?i)day\s*IC\b", "DAY 1C", value)
        value = re.sub(r"(?i)\(\s*day\s*([Сс])\s*\)", "(DAY 1C)", value)
        value = re.sub(r"(?i)stage\s*14\b", "STAGE 1A", value)
        value = re.sub(r"(?i)stage\s*18\b", "STAGE 1B", value)
        value = re.sub(r"(?i)stage\s*IC\b", "STAGE 1C", value)
        value = re.sub(r"(?i)\(\s*day\s*([2-4])\s*\)", r"(DAY \1)", value)
        value = re.sub(r"(?i)\(\s*day([2-4])\s*\)", r"(DAY \1)", value)
        value = re.sub(r"(?i)\bISMIN\b", "15 MIN", value)
        value = re.sub(r"(?i)\b(\d{1,2})\s*мм\b", r"\1 MIN", value)
        value = re.sub(r"(?i)\b(\d{1,2})m(?:in|im)?\b", r"\1 MIN", value)
        value = re.sub(r"(?i)tilll+", "Till", value)
        value = re.sub(r"(?i)tIll+", "Till", value)
        value = re.sub(r"(?i)\btil!+\b", "Till", value)
        # Guarantee with colon thousands: 2:000:000 / 5:000:000 (optional junk quote).
        value = re.sub(
            r"(?i)(\d{1,3})[:.](\d{3})[:.](\d{3})['\"]?\s*(GTD)",
            r"\1.\2.\3 \4",
            value,
        )
        value = re.sub(r"\s+", " ", value).strip()
        return value

    def _parse_row(self, line: str, *, play_date: date, source_row: int) -> _RawRow | None:
        time_match = _ROW_TIME_RE.match(line)
        if not time_match:
            return None
        play_time = self._parse_clock(time_match.group(1))
        if play_time is None:
            return None

        rest = line[time_match.end() :].strip(" |·-_")
        # Skip numeric-only / promo-header garbage.
        if not re.search(r"[A-Za-zА-Яа-яЁё]{3,}", rest):
            return None
        lower_rest = rest.lower()
        if re.search(
            r"перезагрузк|казино|онлайн\s*сателл|лучший\s*отдых|rptbet",
            lower_rest,
        ) and not re.search(r"championship|event|satellite|main|cup|battle", lower_rest):
            return None
        is_closed = bool(re.search(r"\bclosed\b", rest, re.I))
        is_stage = bool(re.search(r"\bstage\b", rest, re.I)) or bool(
            re.search(r"your\s*stack", rest, re.I)
        )

        flight_label, rest_wo_flight = self._extract_flight(rest, prefer_stage=is_stage)
        guarantee = self._extract_guarantee(rest_wo_flight)
        rest_wo_gtd = _GUARANTEE_RE.sub(" ", rest_wo_flight)
        # Drop seat / stack fluff so it does not leak into the title or buy-in scan.
        rest_wo_gtd = re.sub(r"(?i)\byour\s*stack\s*\+?", " ", rest_wo_gtd)
        rest_wo_gtd = re.sub(r"(?i)\b\d+\s*seats?\b", " ", rest_wo_gtd)
        rest_wo_gtd = re.sub(r"(?i)\b(?:gtd|ctd|gtonee)\b", " ", rest_wo_gtd)
        rest_wo_gtd = re.sub(r"(?i)\b8\s*-?\s*max\b", " ", rest_wo_gtd)
        rest_wo_gtd = re.sub(r"\s+[-|_]+\s+", " ", rest_wo_gtd)
        rest_wo_gtd = re.sub(r"\s+", " ", rest_wo_gtd).strip()

        day_end = None
        day_end_match = _DAY_END_RE.search(rest_wo_gtd)
        if day_end_match:
            day_end = re.sub(r"\s+", " ", day_end_match.group(1)).strip()
            rest_wo_gtd = rest_wo_gtd[: day_end_match.start()].rstrip()

        buyin: Decimal | None = None
        buyin_bounty: Decimal | None = None
        after = ""
        name_part = rest_wo_gtd

        if is_closed:
            name_part = re.split(r"\bclosed\b", rest_wo_gtd, maxsplit=1, flags=re.I)[0]
            name_part = self._strip_closed_name_tail(name_part)
        else:
            split = _BUYIN_SPLIT_RE.search(rest_wo_gtd)
            if split:
                left = self._repair_buyin_amount(parse_int(split.group(1)))
                right = self._repair_buyin_amount(parse_int(split.group(2)))
                if left is not None and right is not None:
                    buyin = Decimal(left + right)
                    buyin_bounty = Decimal(right)
                name_part = rest_wo_gtd[: split.start()].strip(" -|_")
                after = rest_wo_gtd[split.end() :].strip()
            else:
                buyin_match = None
                for match in _BUYIN_SINGLE_RE.finditer(rest_wo_gtd):
                    candidate = self._repair_buyin_amount(parse_int(match.group(1)))
                    if candidate is not None and candidate >= 1000:
                        buyin_match = match
                        buyin = Decimal(candidate)
                        break
                if buyin_match is not None:
                    name_part = rest_wo_gtd[: buyin_match.start()].strip(" -|_")
                    after = rest_wo_gtd[buyin_match.end() :].strip()

        # Absurd / tiny totals are almost always OCR glue on this RPT format.
        if buyin is not None and (buyin < Decimal("1000") or buyin > Decimal("100000")):
            return None

        base_name = self._clean_base_name(name_part, is_stage=is_stage)
        if not base_name:
            return None

        stack = None
        late_level = None
        after_norm = _LEVEL_MIN_RE.sub(" ", after)
        after_norm = re.sub(r"\bclosed\b", " ", after_norm, flags=re.I)
        after_norm = re.sub(r"\s+", " ", after_norm).strip()
        nums = [parse_int(token) for token in re.findall(r"\b(\d{1,6})\b", after_norm)]
        nums = [n for n in nums if n is not None]
        if nums:
            # First 4–6 digit token → stack; next small int → late reg.
            for value in nums:
                if value >= 1000 and stack is None:
                    stack = value
                    continue
                if stack is not None and 1 <= value <= 40 and late_level is None:
                    late_level = value
                    break
            if stack is None and late_level is None and nums:
                # Satellite rows sometimes put late reg as the only small number
                # after a missing/confused stack parse — already handled above.
                pass

        tags = list(dict.fromkeys([*detect_tags(rest), *detect_tags(base_name)]))
        if is_stage and "satellite" not in tags:
            tags.append("satellite")
        if buyin_bounty is not None and "bounty" not in tags:
            tags.append("bounty")
        if re.search(r"\bpko\b", rest, re.I) and "pko" not in tags:
            tags.append("pko")
            if "bounty" not in tags:
                tags.append("bounty")

        notes: list[str] = []
        if is_closed:
            notes.append("Continuation day (buy-in closed)")

        return _RawRow(
            source_row=source_row,
            play_date=play_date,
            play_time=play_time,
            raw_name=name_part,
            base_name=base_name,
            flight_label=flight_label,
            buyin=buyin,
            buyin_bounty=buyin_bounty,
            guarantee=guarantee,
            start_stack=stack if not is_closed else None,
            late_reg_level=late_level if not is_closed else None,
            day_end_note=(day_end[:40] if day_end else None),
            is_closed=is_closed,
            is_stage=is_stage,
            tags=tags,
            notes=notes,
        )

    def _extract_guarantee(self, text: str) -> Decimal | None:
        match = _GUARANTEE_RE.search(text)
        if not match:
            return None
        raw = match.group(1).replace(" ", "").replace(".", "")
        return parse_decimal(raw)

    def _repair_buyin_amount(self, value: int | None) -> int | None:
        """Fix OCR-glued buy-ins like 714000/114000 → 14000."""
        if value is None or value <= 0:
            return None
        if value <= 100000:
            return value
        # Prefer dropping a leading OCR digit when remainder looks like a buy-in.
        as_text = str(value)
        if len(as_text) >= 6:
            trimmed = int(as_text[1:])
            if 1000 <= trimmed <= 100000:
                return trimmed
        trimmed_mod = value % 100000
        if 1000 <= trimmed_mod <= 100000:
            return trimmed_mod
        return None

    def _extract_flight(
        self,
        text: str,
        *,
        prefer_stage: bool = False,
    ) -> tuple[str | None, str]:
        label: str | None = None
        stage_label: str | None = None
        day_label: str | None = None
        cleaned = text
        for pattern, kind in _FLIGHT_PATTERNS:
            match = pattern.search(cleaned)
            if not match:
                continue
            if kind == "1letter":
                letter = match.group(1).upper()
                letter = _CYR_LETTER.get(letter, letter)
                day_label = f"1{letter}"
            elif kind == "day":
                day_label = f"Day {match.group(1)}"
            elif kind == "1":
                day_label = "1"
            elif kind == "stage":
                letter = match.group(1).upper()
                letter = _CYR_LETTER.get(letter, letter)
                stage_label = f"1{letter}"
            elif kind == "final":
                day_label = "Final"
            elif kind == "final_table" and day_label is None:
                day_label = "Final"
            cleaned = pattern.sub(" ", cleaned, count=1)

        # Re-scan originals for preference (STAGE rows also contain "(DAY 1A)").
        stage_m = re.search(r"\(\s*stage\s*1\s*([a-dа-д])\s*\)", text, re.I)
        if stage_m:
            letter = stage_m.group(1).upper()
            stage_label = f"1{_CYR_LETTER.get(letter, letter)}"
        day_only = re.search(r"\(\s*day\s*1\s*([a-dа-д])\s*\)", text, re.I)
        if day_only:
            letter = day_only.group(1).upper()
            day_label = f"1{_CYR_LETTER.get(letter, letter)}"
        day2 = re.search(r"\(\s*day\s*([2-4])\s*\)", text, re.I)
        if day2:
            day_label = f"Day {day2.group(1)}"
        if re.search(r"\(\s*final\s*day\s*\)", text, re.I):
            day_label = "Final"

        if prefer_stage and stage_label:
            label = stage_label
        else:
            label = day_label or stage_label

        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return label, cleaned

    def _clean_base_name(self, name: str, *, is_stage: bool) -> str:
        value = name.strip(" -|_~©`'\"«»")
        value = re.sub(r"^\s*[|·\-_/\\]+\s*", "", value)
        value = re.sub(r"^[^\wА-Яа-яЁё]+", "", value, flags=re.UNICODE)
        # Drop lone OCR prefix letters stuck before the real title.
        value = re.sub(r"^(?:[A-Za-zА-Яа-яЁё]|ff|Pu|AND)\s+", "", value)
        value = re.sub(r"\(\s*[^)]*\s*\)", " ", value)
        value = re.sub(r"(?i)\byour\s*stack\s*\+?", " ", value)
        value = re.sub(r"(?i)\b\d+\s*seats?\b", " ", value)
        value = re.sub(r"(?i)\b\d+seats?\b", " ", value)
        value = re.sub(r"(?i)\.?8\s*-?\s*[mм][aа][xх]\b", " ", value)
        value = re.sub(r"(?i)\bstage\s*1[a-d]?\b", " ", value)
        value = re.sub(r"(?i)\b(?:gtd|ctd)\b", " ", value)
        # Drop guarantee leftovers like 5:000:000 or 2.500.000.
        value = re.sub(r"\b\d{1,3}([:.,]\d{3}){1,2}\b", " ", value)
        value = re.sub(r"\b\d{3,7}\b", " ", value)
        value = re.sub(r"(?i)\s+\d+\s+(?=stage\b)", " ", value)
        value = re.sub(r"[|\\]+", " ", value)
        value = re.sub(r"\s+\d+\s*$", "", value)
        value = re.sub(r"[\s_~©|·\-,=:\\.]+$", "", value)
        value = re.sub(r"\s+", " ", value).strip(" -|_~©`'\"")
        # Cyrillic OCR leftovers after Pokerdom / 8-max.
        value = re.sub(r"(?i)\bобо\b", " ", value)
        # Drop OCR soup after a known clean title.
        value = re.sub(
            r"(?i)^(HIGHROLLERS CUP)(?:(?!\bSTAGE\b|\bBY\b).)*",
            r"\1 ",
            value,
        )
        value = re.sub(r"\s+", " ", value).strip(" -|_~©`'\"")
        if not value:
            return ""
        if is_stage and not value.upper().endswith("STAGE"):
            value = f"{value} STAGE"
        return value

    def _strip_closed_name_tail(self, name: str) -> str:
        value = name.strip(" -|_~")
        cut = re.search(
            r"(?:"
            r"\s+\d{1,3}\s*/\s*\d{1,3}"
            r"|\s+[_~©|·\-]+"
            r"|\s+\d{1,3}\s*min\b"
            r"|\s+\d{1,3}\s*$"
            r")",
            value,
            flags=re.I,
        )
        if cut:
            value = value[: cut.start()]
        value = re.sub(r"[\s_~©|·\-]+$", "", value)
        return value.strip(" -|_~©")

    def _resolve_closed_orphans(self, rows: list[_RawRow]) -> list[_RawRow]:
        open_by_key: dict[str, str] = {}
        open_by_soft: dict[str, str] = {}
        for row in rows:
            if row.is_closed or row.buyin is None:
                continue
            if "satellite" in row.base_name.lower():
                continue
            key = self._group_key(row.base_name)
            soft = self._soft_group_key(row.base_name)
            open_by_key[key] = row.base_name
            # Prefer longer/more specific open name when soft keys collide.
            prev = open_by_soft.get(soft)
            if prev is None or len(row.base_name) >= len(prev):
                open_by_soft[soft] = row.base_name
        if not open_by_key:
            return rows

        fixed: list[_RawRow] = []
        for row in rows:
            if not row.is_closed:
                fixed.append(row)
                continue
            key = self._group_key(row.base_name)
            soft = self._soft_group_key(row.base_name)
            if key in open_by_key:
                fixed.append(row)
                continue
            # FINAL DAY often drops optional KNOCKOUT:
            # "KALININGRAD CHAMPIONSHIP PKO" ↔ "KALININGRAD KNOCKOUT CHAMPIONSHIP PKO"
            if soft in open_by_soft:
                row.base_name = open_by_soft[soft]
                fixed.append(row)
                continue
            best: str | None = None
            best_score = 0.0
            closed_tokens = set(soft.split())
            for open_key, open_name in open_by_key.items():
                open_soft = self._soft_group_key(open_name)
                # "russian poker open event" ↔ "russian poker open knockout event"
                prefix_hit = (
                    (soft.startswith(open_soft) or open_soft.startswith(soft))
                    and min(len(soft), len(open_soft)) >= 12
                )
                score = 0.0
                if prefix_hit:
                    score = float(len(open_soft))
                else:
                    open_tokens = set(open_soft.split())
                    if closed_tokens and open_tokens:
                        overlap = closed_tokens & open_tokens
                        # Strong anchor tokens (pokerdom / altai / championship).
                        anchors = {
                            "pokerdom",
                            "altai",
                            "champ",
                            "main",
                            "kaliningrad",
                            "superk",
                        }
                        if overlap & anchors:
                            score = 50 + len(overlap)
                        else:
                            ratio = len(overlap) / len(closed_tokens)
                            if len(overlap) >= 3 and ratio >= 0.6:
                                score = ratio * 100 + len(overlap)
                if score > best_score:
                    best = open_name
                    best_score = score
            if best is not None:
                row.base_name = best
            fixed.append(row)
        return fixed

    def _group_events(
        self,
        rows: list[_RawRow],
        *,
        currency: str,
    ) -> tuple[list[DraftEvent], list[DraftCellIssue]]:
        by_name: dict[str, list[_RawRow]] = defaultdict(list)
        for row in rows:
            by_name[self._group_key(row.base_name)].append(row)

        events: list[DraftEvent] = []
        issues: list[DraftCellIssue] = []
        for key, group_rows in sorted(by_name.items(), key=lambda item: item[1][0].source_row):
            group_rows = sorted(group_rows, key=lambda row: (row.play_date, row.play_time))
            open_rows = [row for row in group_rows if not row.is_closed and row.buyin is not None]
            if not open_rows:
                if all(row.is_closed for row in group_rows):
                    issues.append(
                        DraftCellIssue(
                            field="buyin",
                            severity="warning",
                            message=(
                                "Closed-only rows without parent event: "
                                f"{group_rows[0].base_name}"
                            ),
                            code="closed_orphan",
                        )
                    )
                continue

            # Prefer the highest open buy-in as the «main» price when flights differ
            # (e.g. Russian Poker Open 1A vs 1B re-entry).
            buyin = max((row.buyin for row in open_rows if row.buyin is not None), default=None)
            if buyin is None:
                continue
            primary = next(row for row in open_rows if row.buyin == buyin)

            bounty = primary.buyin_bounty
            if bounty is not None and bounty >= buyin:
                bounty = None

            start_stack = primary.start_stack or next(
                (row.start_stack for row in open_rows if row.start_stack),
                None,
            )
            late_reg = primary.late_reg_level or next(
                (row.late_reg_level for row in open_rows if row.late_reg_level),
                None,
            )
            day_end = next((row.day_end_note for row in group_rows if row.day_end_note), None)
            guarantee = next((row.guarantee for row in open_rows if row.guarantee), None)
            name = primary.base_name

            tags: list[str] = []
            for row in group_rows:
                for tag in row.tags:
                    if tag not in tags:
                        tags.append(tag)

            notes: list[str] = []
            for row in group_rows:
                notes.extend(row.notes)
            buyins = {format(row.buyin, "f") for row in open_rows if row.buyin is not None}
            if len(buyins) > 1:
                notes.append(f"Buy-in variants in file: {', '.join(sorted(buyins))}")

            flights: list[DraftFlight] = []
            multi = len(group_rows) > 1
            used_labels: set[str] = set()
            auto_n = 0
            for row in group_rows:
                label = row.flight_label
                if multi and label is None:
                    auto_n += 1
                    label = f"D{auto_n}"
                if multi and label is not None:
                    original = label
                    suffix = 1
                    while label in used_labels:
                        suffix += 1
                        candidate = f"{original}-{suffix}"
                        label = candidate if len(candidate) <= 16 else f"{original[:12]}-{suffix}"
                    used_labels.add(label)
                flights.append(
                    DraftFlight(
                        label=label if multi else None,
                        play_date=row.play_date,
                        play_time=row.play_time,
                        source_row=row.source_row,
                        source_page=1,
                        source_fragment=row.raw_name[:2000],
                    )
                )

            events.append(
                DraftEvent(
                    number=None,
                    name=name[:160],
                    buyin=buyin,
                    buyin_bounty=bounty,
                    currency_code=currency,
                    guarantee=guarantee,
                    game_type=detect_game_type(name),
                    tags=tags,
                    start_stack=start_stack,
                    late_reg_level=late_reg,
                    day_end_note=day_end,
                    notes="; ".join(dict.fromkeys(notes)) or None,
                    flights=flights,
                    parse_path=ParsePath.CODE,
                    source_row=group_rows[0].source_row,
                    source_page=1,
                    source_fragment=group_rows[0].raw_name[:2000],
                )
            )
        return events, issues

    def _group_key(self, name: str) -> str:
        value = name.lower().replace("ё", "е")
        value = re.sub(r"[^a-z0-9а-я]+", " ", value)
        replacements = {
            "superkknockout": "superk",
            "knockout": "ko",
            "нокаут": "ko",
            "championship": "champ",
            "tournament": "",
            "event": "",
            "турнир": "",
            "pko": "",
            "highrollers": "highroller",
            "highroleers": "highroller",
        }
        for src, dst in replacements.items():
            value = value.replace(src, dst)
        return re.sub(r"\s+", " ", value).strip()

    def _soft_group_key(self, name: str) -> str:
        """Group key with optional KO stripped for FINAL↔DAY1 matching."""
        value = self._group_key(name)
        value = re.sub(r"\bko\b", " ", value)
        return re.sub(r"\s+", " ", value).strip()
