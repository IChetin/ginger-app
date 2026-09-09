"""Belarus Poker Tour schedule parser (image PDF via OCR)."""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, time
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
    parse_time_value,
)

logger = logging.getLogger(__name__)

_DAY_HEADER_RE = re.compile(
    r"^\s*(\d{1,2})\.(\d{1,2})\s+"
    r"(?:понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\b",
    re.IGNORECASE,
)
_FOOTNOTE_RE = re.compile(r"^\s*\*\s*(.+)$")
_ROW_TIME_RE = re.compile(r"^\s*(\d{1,2}:\d{2})\b")
_KO_BLOCK_RE = re.compile(
    r"\(\s*((?:triple\s+)?(?:mystery|mistery)\*?|"
    r"progressive\s+ko|"
    r"ko|"
    r"к[оo])"
    r"(?:\s*\$\s*(\d{1,6}))?\s*\)",
    re.IGNORECASE,
)
_LATE_REG_RE = re.compile(
    r"(?<!\d)(\d{1,2})\s*[|/\[]\s*(\d{1,2}:\d{2})\b|"
    r"(?<!\d)(\d{1,2})\s+(\d{1,2}:\d{2})\b"
)
_BUYIN_RE = re.compile(r"\$\s*(\d{1,6})\b")
_DAY_END_RE = re.compile(
    r"(\d+\s*уров\.?|до\s*(?:ft|рт|ет|ft\.))\s*$",
    re.IGNORECASE,
)
_COLOR_NAMES = {
    "pink": "Grand event",
    "green": "Main event",
    "blue": "HighRoller event",
    "yellow": "Omaha Main event",
}


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
    start_stack: int | None
    late_reg_level: int | None
    late_reg_time: time | None
    day_end_note: str | None
    is_closed: bool
    has_tv: bool
    currency_usd: bool
    tags: list[str] = field(default_factory=list)
    color_family: str | None = None
    notes: list[str] = field(default_factory=list)


class BelarusPokerTourPdfParser:
    name = "bpt_pdf_v1"
    organizer_slugs = frozenset({"bpt"})
    supported_types = frozenset({"pdf", "image"})
    description = (
        "Belarus Poker Tour: сканы/PDF-картинки расписания (OCR), "
        "группировка флайтов по названию и цвету строки"
    )

    def supports(self, ctx: ParserContext, data: bytes) -> bool:
        if ctx.import_kind != "schedule":
            return False
        if ctx.detected_type not in {"pdf", "image"}:
            return False
        if not organizer_slug_allowed(self.organizer_slugs, ctx):
            return False
        filename = (ctx.filename or "").lower()
        if "bpt" in filename:
            return True
        if ctx.organizer_slug == "bpt":
            return True
        if ctx.detected_type == "image":
            return ctx.skip_organizer_slug_check
        try:
            with pdfplumber.open(BytesIO(data)) as pdf:
                if not pdf.pages:
                    return False
                page = pdf.pages[0]
                text = (page.extract_text() or "").lower()
                if "belarus poker" in text or "grand event" in text:
                    return True
                # Image-only export from macOS / screenshot PDF.
                if page.images and not page.chars:
                    return ctx.organizer_slug == "bpt" or ctx.skip_organizer_slug_check
        except Exception:  # noqa: BLE001
            return False
        return False

    def parse(self, ctx: ParserContext, data: bytes) -> ParseResult:
        year = (ctx.series_starts_on or date.today()).year
        image = self._load_image(data, detected_type=ctx.detected_type)
        ocr_text = self._ocr_text(image)
        lines = [line.rstrip() for line in ocr_text.splitlines() if line.strip()]
        rows, footnotes, unparsed, issues = self._read_lines(lines, year=year)
        color_map = self._sample_row_colors(image, rows)
        for row in rows:
            row.color_family = color_map.get(row.source_row)
        rows = self._resolve_closed_orphans(rows)
        events, group_issues = self._group_events(rows)
        issues.extend(group_issues)

        confidence = Decimal("0.88") if events else Decimal("0.25")
        if unparsed:
            confidence = min(confidence, Decimal("0.72"))
        if any(issue.code == "flight_color_conflict" for issue in issues):
            confidence = min(confidence, Decimal("0.78"))
        if any(issue.severity == "error" for issue in issues):
            confidence = min(confidence, Decimal("0.7"))

        return ParseResult(
            events=events,
            unparsed_rows=unparsed,
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
            series_notes="\n".join(footnotes) if footnotes else None,
        )

    def parse_ocr_text(self, text: str, *, year: int) -> ParseResult:
        """Deterministic path for unit tests (skip OCR)."""
        lines = [line.rstrip() for line in text.splitlines() if line.strip()]
        rows, footnotes, unparsed, issues = self._read_lines(lines, year=year)
        rows = self._resolve_closed_orphans(rows)
        events, group_issues = self._group_events(rows)
        issues.extend(group_issues)
        confidence = Decimal("0.92") if events and not unparsed else Decimal("0.75")
        return ParseResult(
            events=events,
            unparsed_rows=unparsed,
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
            series_notes="\n".join(footnotes) if footnotes else None,
        )

    def _load_image(self, data: bytes, *, detected_type: str) -> Image.Image:
        if detected_type == "image":
            return Image.open(BytesIO(data)).convert("RGB")
        with pdfplumber.open(BytesIO(data)) as pdf:
            if not pdf.pages:
                raise ValueError("Empty PDF")
            page = pdf.pages[0]
            if page.images:
                stream = page.images[0]["stream"]
                return Image.open(BytesIO(stream.get_data())).convert("RGB")
            # Text PDF: render via pdfplumber.
            rendered = page.to_image(resolution=200).original
            return rendered.convert("RGB")

    def _ocr_text(self, image: Image.Image) -> str:
        prepared = self._preprocess(image)
        return pytesseract.image_to_string(prepared, lang="eng+rus", config="--psm 6")

    def _preprocess(self, image: Image.Image) -> Image.Image:
        gray = ImageOps.grayscale(image)
        gray = ImageEnhance.Contrast(gray).enhance(1.8)
        gray = gray.filter(ImageFilter.SHARPEN)
        scale = 1.5
        return gray.resize(
            (int(gray.width * scale), int(gray.height * scale)),
            Image.Resampling.LANCZOS,
        )

    def _read_lines(
        self,
        lines: list[str],
        *,
        year: int,
    ) -> tuple[list[_RawRow], list[str], list[str], list[DraftCellIssue]]:
        rows: list[_RawRow] = []
        footnotes: list[str] = []
        unparsed: list[str] = []
        issues: list[DraftCellIssue] = []
        current_date: date | None = None

        for idx, raw_line in enumerate(lines, start=1):
            line = self._normalize_ocr(raw_line)
            if not line or line.lower().startswith("название турнира"):
                continue
            foot = _FOOTNOTE_RE.match(line)
            if foot:
                footnotes.append(foot.group(1).strip())
                continue
            day = _DAY_HEADER_RE.match(line)
            if day:
                day_n, month_n = int(day.group(1)), int(day.group(2))
                try:
                    current_date = date(year, month_n, day_n)
                except ValueError:
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
            if not _ROW_TIME_RE.match(line):
                # Likely header noise or garbage.
                if re.search(r"\$\d|closed|event|турнир", line, re.I):
                    unparsed.append(raw_line)
                continue
            parsed = self._parse_row(line, play_date=current_date, source_row=idx)
            if parsed is None:
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
            rows.append(parsed)
        return rows, footnotes, unparsed, issues

    def _normalize_ocr(self, text: str) -> str:
        value = text.replace("\xa0", " ").replace("—", " ").replace("–", " ")
        value = value.replace("К0", "KO").replace("K0", "KO").replace("кo", "KO")
        value = value.replace("КО", "KO").replace("Ко", "KO")
        value = re.sub(r"\bypos\.?\b", "уров.", value, flags=re.I)
        value = re.sub(r"\bmistery\b", "mystery", value, flags=re.I)
        value = re.sub(r"\bfinall?\s*day\b", "final day", value, flags=re.I)
        value = re.sub(r"\bMainevent\b", "Main event", value, flags=re.I)
        value = re.sub(r"\bOmahaclassic\b", "Omaha classic", value, flags=re.I)
        value = re.sub(r"\bOmahaMain\b", "Omaha Main", value, flags=re.I)
        value = re.sub(r"day\s*18\b", "day 1B", value, flags=re.I)
        value = re.sub(r"day\s*1[Сс]\b", "day 1C", value, flags=re.I)
        value = re.sub(r"до\s*(?:РТ|ЕТ|PТ)\b", "до FT", value, flags=re.I)
        value = re.sub(r"\s+", " ", value).strip()
        return value

    def _parse_row(self, line: str, *, play_date: date, source_row: int) -> _RawRow | None:
        time_match = _ROW_TIME_RE.match(line)
        if not time_match:
            return None
        play_time = parse_time_value(time_match.group(1))
        if play_time is None:
            return None
        rest = line[time_match.end() :].strip(" |·-_")
        is_closed = bool(re.search(r"\bclosed\b", rest, re.I))
        has_tv = bool(re.search(r"\(final\s*table\)", rest, re.I))

        buyin_bounty, ko_tags, rest_wo_ko = self._extract_ko(rest)
        flight_label, rest_wo_flight = self._extract_flight(rest_wo_ko)
        day_end = None
        day_end_match = _DAY_END_RE.search(rest_wo_flight)
        if day_end_match:
            day_end = day_end_match.group(1).strip()
            day_end = re.sub(r"\s+", " ", day_end)
            if re.search(r"до\s*ft", day_end, re.I):
                day_end = "до FT"
            rest_wo_flight = rest_wo_flight[: day_end_match.start()].rstrip()

        buyin = None
        currency_usd = "$" in rest
        if not is_closed:
            buyin_match = _BUYIN_RE.search(rest_wo_flight)
            if buyin_match:
                buyin = parse_decimal(buyin_match.group(1))
                # Name is text before buy-in.
                name_part = rest_wo_flight[: buyin_match.start()].strip(" -|_")
                after = rest_wo_flight[buyin_match.end() :].strip()
            else:
                name_part = rest_wo_flight
                after = ""
        else:
            # Closed rows: name until "closed"; drop trailing level minutes + OCR junk
            # ("30/40 ~", "_ © В 40/60", "60").
            name_part = re.split(r"\bclosed\b", rest_wo_flight, maxsplit=1, flags=re.I)[0]
            name_part = self._strip_closed_name_tail(name_part)
            after = rest_wo_flight[len(name_part) :].strip() if name_part else rest_wo_flight

        base_name = self._clean_base_name(name_part)
        if not base_name:
            return None

        stack = None
        late_level = None
        late_time = None
        after_norm = after
        if is_closed:
            after_norm = re.sub(r"\bclosed\b", " ", after_norm, flags=re.I)

        # Stack: first standalone 4–6 digit token (avoid glued "30000 25").
        for token in re.findall(r"\b(\d{4,6})\b", after_norm.replace(",", "")):
            value = parse_int(token)
            if value is not None and value >= 1000:
                stack = value
                break

        late_match = _LATE_REG_RE.search(after_norm)
        if late_match:
            level_s = late_match.group(1) or late_match.group(3)
            time_s = late_match.group(2) or late_match.group(4)
            late_level = parse_int(level_s)
            late_time = parse_time_value(time_s)

        tags = list(dict.fromkeys([*ko_tags, *detect_tags(rest), *detect_tags(base_name)]))
        if has_tv and "TV" not in tags:
            tags.append("TV")
        if (
            flight_label
            and "turbo" in rest.lower()
            and "1C" in flight_label
            and "turbo" not in tags
        ):
            tags.append("turbo")

        notes: list[str] = []
        if late_time is not None:
            notes.append(f"Поздняя рег. до {late_time.strftime('%H:%M')}")
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
            start_stack=stack if not is_closed else None,
            late_reg_level=late_level if not is_closed else None,
            late_reg_time=late_time,
            day_end_note=(day_end[:40] if day_end else None),
            is_closed=is_closed,
            has_tv=has_tv,
            currency_usd=currency_usd or buyin is not None,
            tags=tags,
            notes=notes,
        )

    def _strip_closed_name_tail(self, name: str) -> str:
        """Remove level minutes and OCR noise that follows the title on closed rows."""
        value = name.strip(" -|_~")
        # Cut at first level-minutes token possibly preceded/followed by junk.
        # Examples after flight/KO strip: "Belarus open event 30/40 ~",
        # "Main event _ © В 40/60", "HighRoller event 60".
        cut = re.search(
            r"(?:"
            r"\s+\d{1,3}\s*/\s*\d{1,3}"  # 30/40 or 40/60
            r"|\s+[_~©|·\-]+"  # "_ ©" / "~"
            r"|\s+\d{1,3}\s*$"  # trailing single minutes "60"
            r")",
            value,
        )
        if cut:
            value = value[: cut.start()]
        value = re.sub(r"[\s_~©|·\-]+$", "", value)
        return value.strip(" -|_~©")

    def _extract_ko(self, text: str) -> tuple[Decimal | None, list[str], str]:
        tags: list[str] = []
        bounty: Decimal | None = None
        cleaned = text
        for match in _KO_BLOCK_RE.finditer(text):
            block = match.group(0).lower()
            amount = parse_decimal(match.group(2)) if match.group(2) else None
            if "mystery" in block or "mistery" in block:
                tags.append("mystery")
                tags.append("bounty")
            elif "progressive" in block:
                tags.append("pko")
                tags.append("bounty")
            else:
                tags.append("bounty")
            if amount is not None:
                bounty = amount
            cleaned = cleaned.replace(match.group(0), " ")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return bounty, tags, cleaned

    def _extract_flight(self, text: str) -> tuple[str | None, str]:
        label: str | None = None
        cleaned = text
        # Only parenthetical stage markers — bare "day 2" can be part of a title.
        patterns = [
            (re.compile(r"\(\s*(?:turbo\s+)?day\s*1\s*([a-cавс])(?:\s*turbo)?\s*\)", re.I), "1"),
            (re.compile(r"\(\s*day\s*([2-4])\s*\)", re.I), "day"),
            (re.compile(r"\(\s*final\s*day\s*\)", re.I), "final"),
            (re.compile(r"\(\s*final\s*table\s*\)", re.I), "final"),
        ]
        for pattern, kind in patterns:
            match = pattern.search(cleaned)
            if not match:
                continue
            if kind == "1":
                letter = match.group(1).upper()
                mapping = {"А": "A", "В": "B", "С": "C"}
                letter = mapping.get(letter, letter)
                label = f"1{letter}"
            elif kind == "day":
                label = f"Day {match.group(1)}"
            else:
                label = "Final"
            cleaned = pattern.sub(" ", cleaned, count=1)
            cleaned = re.sub(r"\(\s*final\s*table\s*\)", " ", cleaned, flags=re.I)
            cleaned = re.sub(r"\(\s*final\s*day\s*\)", " ", cleaned, flags=re.I)
            break
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return label, cleaned

    def _clean_base_name(self, name: str) -> str:
        value = name.strip(" -|_~©")
        value = re.sub(r"\(\s*triple\s+mystery\*?\s*\)", "", value, flags=re.I)
        value = re.sub(r"\([^)]*\)", "", value)
        value = re.sub(r"[\s_~©|·\-]+$", "", value)
        value = re.sub(r"\s+", " ", value).strip(" -|_~©")
        return value.strip() or name.strip()

    def _resolve_closed_orphans(
        self,
        rows: list[_RawRow],
    ) -> list[_RawRow]:
        """Attach closed rows whose OCR-mangled name missed the parent group."""
        open_names = {
            self._group_key(row.base_name): row.base_name
            for row in rows
            if not row.is_closed and row.buyin is not None
        }
        if not open_names:
            return rows

        fixed: list[_RawRow] = []
        for row in rows:
            if not row.is_closed:
                fixed.append(row)
                continue
            key = self._group_key(row.base_name)
            if key in open_names:
                fixed.append(row)
                continue
            # Prefer longest open name that is a prefix of the mangled closed name.
            best: str | None = None
            best_len = 0
            closed_key = key
            for open_key, open_name in open_names.items():
                prefix_hit = closed_key.startswith(open_key) and len(open_key) > best_len
                reverse_hit = (
                    open_key.startswith(closed_key)
                    and len(closed_key) >= 8
                    and len(open_key) > best_len
                )
                if prefix_hit or reverse_hit:
                    best = open_name
                    best_len = len(open_key)
            if best is not None:
                row.base_name = best
            fixed.append(row)
        return fixed

    def _sample_row_colors(self, image: Image.Image, rows: list[_RawRow]) -> dict[int, str]:
        """Sample left-margin background near OCR line; auxiliary signal only."""
        if not rows:
            return {}
        try:
            prepared = self._preprocess(image)
            data = pytesseract.image_to_data(
                prepared, lang="eng+rus", config="--psm 6", output_type=pytesseract.Output.DICT
            )
        except Exception:  # noqa: BLE001
            logger.exception("BPT color sampling failed")
            return {}

        # Map source OCR line text → average top of words.
        line_tops: dict[str, list[int]] = defaultdict(list)
        n = len(data["text"])
        for i in range(n):
            text = (data["text"][i] or "").strip()
            if not text or int(data["conf"][i]) < 0:
                continue
            top = int(data["top"][i])
            line_tops[text.lower()].append(top)

        rgb = image.convert("RGB")
        scale_y = rgb.height / prepared.height
        result: dict[int, str] = {}
        for row in rows:
            # Find a distinctive token from the name.
            token = None
            for part in re.findall(r"[A-Za-zА-Яа-я]{4,}", row.base_name):
                token = part.lower()
                break
            tops = line_tops.get(token or "", [])
            if not tops:
                continue
            top = int(sorted(tops)[len(tops) // 2] * scale_y)
            # Sample a few pixels on the left margin of the row band.
            ys = [max(0, min(rgb.height - 1, top + dy)) for dy in (2, 8, 14)]
            samples: list[tuple[int, int, int]] = []
            for y in ys:
                for x in (12, 24, 40):
                    if x < rgb.width:
                        samples.append(rgb.getpixel((x, y)))
            if not samples:
                continue
            r = sum(s[0] for s in samples) // len(samples)
            g = sum(s[1] for s in samples) // len(samples)
            b = sum(s[2] for s in samples) // len(samples)
            family = self._classify_fill(r, g, b)
            if family:
                result[row.source_row] = family
        return result

    def _classify_fill(self, r: int, g: int, b: int) -> str | None:
        # Skip near-white / lavender day headers.
        if r > 230 and g > 230 and b > 230:
            return None
        if abs(r - g) < 12 and abs(g - b) < 12:
            return None
        if r > g + 25 and r > b + 15 and r > 160:
            return "pink"
        if g > r + 15 and g > b + 10 and g > 150:
            return "green"
        if b > r + 20 and b > g + 10 and b > 150:
            return "blue"
        if r > 180 and g > 160 and b < 140 and r >= g:
            return "yellow"
        return None

    def _group_events(
        self,
        rows: list[_RawRow],
    ) -> tuple[list[DraftEvent], list[DraftCellIssue]]:
        by_name: dict[str, list[_RawRow]] = defaultdict(list)
        for row in rows:
            by_name[self._group_key(row.base_name)].append(row)

        groups: list[tuple[str, list[_RawRow]]] = []
        for key, named_rows in by_name.items():
            multi = any(row.flight_label or row.is_closed for row in named_rows)
            if multi or len(named_rows) == 1:
                groups.append((key, named_rows))
                continue
            by_buyin: dict[str, list[_RawRow]] = defaultdict(list)
            for row in named_rows:
                buyin_key = format(row.buyin, "f") if row.buyin is not None else "none"
                by_buyin[buyin_key].append(row)
            for subgroup in by_buyin.values():
                groups.append((key, subgroup))

        events: list[DraftEvent] = []
        issues: list[DraftCellIssue] = []
        for key, group_rows in sorted(groups, key=lambda item: item[1][0].source_row):
            group_rows = sorted(group_rows, key=lambda row: (row.play_date, row.play_time))
            open_rows = [row for row in group_rows if not row.is_closed and row.buyin is not None]
            buyin = next((row.buyin for row in open_rows if row.buyin is not None), None)
            if buyin is None:
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
                buyin = Decimal("0")

            bounty = next(
                (row.buyin_bounty for row in group_rows if row.buyin_bounty is not None),
                None,
            )
            if bounty is not None and bounty >= buyin:
                bounty = None

            start_stack = next((row.start_stack for row in open_rows if row.start_stack), None)
            late_reg = next((row.late_reg_level for row in open_rows if row.late_reg_level), None)
            day_end = next((row.day_end_note for row in group_rows if row.day_end_note), None)
            name = group_rows[0].base_name
            for row in group_rows:
                if not row.is_closed:
                    name = row.base_name
                    break

            tags: list[str] = []
            for row in group_rows:
                for tag in row.tags:
                    if tag not in tags:
                        tags.append(tag)

            notes: list[str] = []
            for row in group_rows:
                notes.extend(row.notes)

            expected_color = None
            for color, expected_name in _COLOR_NAMES.items():
                if self._group_key(expected_name) == key:
                    expected_color = color
                    break
            colors = {row.color_family for row in group_rows if row.color_family}
            event_issues: list[DraftCellIssue] = []
            if expected_color and colors - {expected_color}:
                event_issues.append(
                    DraftCellIssue(
                        field="flights",
                        severity="warning",
                        message=(
                            f"Цвет строки ({', '.join(sorted(colors))}) "
                            f"не совпал с названием «{name}» — доверяем названию"
                        ),
                        code="flight_color_conflict",
                    )
                )
                issues.append(event_issues[-1])

            flights: list[DraftFlight] = []
            for row in group_rows:
                label = row.flight_label
                if label is None and len(group_rows) > 1:
                    # Opening day without explicit marker (HighRoller / Belarus open).
                    label = "1"
                flights.append(
                    DraftFlight(
                        label=label if len(group_rows) > 1 else None,
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
                    currency_code="USD",
                    game_type=detect_game_type(name),
                    tags=tags,
                    start_stack=start_stack,
                    late_reg_level=late_reg,
                    day_end_note=day_end,
                    notes="; ".join(dict.fromkeys(notes)) or None,
                    flights=flights,
                    issues=event_issues,
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
        value = re.sub(r"\s+", " ", value).strip()
        return value
