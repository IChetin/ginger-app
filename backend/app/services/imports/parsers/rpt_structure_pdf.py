from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from io import BytesIO

import pdfplumber

from app.models.enums import ParsePath
from app.schemas.imports import (
    DraftBlindLevel,
    DraftCellIssue,
    DraftStructure,
    DraftStructureSet,
    StructureParseResult,
)
from app.services.imports.base import ParserContext, organizer_slug_allowed
from app.services.imports.parsers.common import parse_decimal


@dataclass
class _LevelRow:
    level_no: int
    sb: int
    bb: int
    ante: int | None
    minutes: int | None


@dataclass
class _SetBuf:
    label: str = "default"
    levels: list[_LevelRow] = field(default_factory=list)
    default_minutes: int | None = None


class RptTournamentStructurePdfParser:
    name = "rpt_structure_pdf_v1"
    organizer_slugs = frozenset({"rpt"})
    supported_types = frozenset({"pdf"})
    description = "RPT: PDF структур блайндов (structure sets / shared satellites)"

    def supports(self, ctx: ParserContext, data: bytes) -> bool:
        if ctx.import_kind != "structures":
            return False
        if ctx.detected_type != "pdf":
            return False
        if not organizer_slug_allowed(self.organizer_slugs, ctx):
            return False
        try:
            with pdfplumber.open(BytesIO(data)) as pdf:
                if len(pdf.pages) < 3:
                    return False
                sample = "\n".join((page.extract_text() or "") for page in pdf.pages[:3])
        except Exception:  # noqa: BLE001
            return False
        lower = sample.lower()
        has_structure = "level" in lower and ("small blind" in lower or "bb ante" in lower)
        has_schedule = "вх. плата" in lower or "название турнира" in lower
        return has_structure and not has_schedule and ("бай-ин" in lower or "buy-in" in lower)

    def parse(self, ctx: ParserContext, data: bytes) -> StructureParseResult:
        structures: list[DraftStructure] = []
        issues: list[DraftCellIssue] = []
        with pdfplumber.open(BytesIO(data)) as pdf:
            for index, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                structure = self._parse_page(text, page_no=index)
                if structure is not None:
                    structures.append(structure)
                else:
                    issues.append(
                        DraftCellIssue(
                            field="structures",
                            severity="warning",
                            message=f"Could not parse structure page {index}",
                            code="page_unparsed",
                        )
                    )
        confidence = Decimal("0.9") if len(structures) >= 20 else Decimal("0.75")
        return StructureParseResult(
            structures=structures,
            unparsed_rows=[],
            confidence=confidence,
            parser_used=self.name,
            parse_path=ParsePath.CODE,
            issues=issues,
        )

    def _parse_page(self, text: str, *, page_no: int) -> DraftStructure | None:
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return None

        title = self._find_title(lines)
        if title is None:
            return None
        is_shared = "all satellites" in title.lower()

        buyin = self._first_money(lines, prefix=r"Бай-ин")
        start_stack = self._first_int(lines, prefix=r"Стартовый стек")
        late_reg = self._first_int(lines, prefix=r"Поздняя\s+регистрац")
        default_minutes = self._default_minutes(lines)
        notes = self._notes(lines)

        sets = self._parse_sets(lines, default_minutes=default_minutes, late_reg=late_reg)
        if not sets:
            return None

        return DraftStructure(
            source_title=title[:200],
            parsed_buyin=buyin,
            parsed_start_stack=start_stack,
            parsed_late_reg_level=late_reg,
            notes="; ".join(notes) or None,
            structure_sets=sets,
            match_confidence=None,
            selected=True,
            is_shared_satellites=is_shared,
            source_page=page_no,
            issues=(
                [
                    DraftCellIssue(
                        field="structure_sets",
                        severity="warning",
                        message="Multiple day durations found; imported primary minutes",
                        code="minutes_variant",
                    )
                ]
                if "день 1a" in " ".join(lines).lower()
                and "день 1b" in " ".join(lines).lower()
                and len(sets) == 1
                else []
            ),
        )

    def _find_title(self, lines: list[str]) -> str | None:
        for line in lines:
            lower = line.lower()
            if lower.startswith("во всех") or lower.startswith("в ситуации"):
                continue
            if lower.startswith("бай-ин") or lower.startswith("level"):
                continue
            if re.fullmatch(r"[A-Z0-9А-ЯЁ \-_/&'.]+", line) and len(line) >= 5:
                return line
            if "structure" in lower and "satellite" in lower:
                return line
        return None

    def _first_money(self, lines: list[str], *, prefix: str) -> Decimal | None:
        pattern = re.compile(rf"(?i){prefix}\s*:\s*(.+)")
        for line in lines:
            match = pattern.search(line)
            if not match:
                continue
            # Prefer first RUB amount.
            money = re.search(r"(\d[\d\s]*)\s*RUB", match.group(1), re.I)
            if money:
                return parse_decimal(money.group(1))
            return parse_decimal(match.group(1))
        return None

    def _first_int(self, lines: list[str], *, prefix: str) -> int | None:
        pattern = re.compile(rf"(?i){prefix}[^:]*:\s*(.+)")
        for line in lines:
            match = pattern.search(line)
            if not match:
                continue
            # Prefer plain integer after colon; for multi-values take first.
            value = re.search(r"(\d+)", match.group(1))
            return int(value.group(1)) if value else None
        return None

    def _default_minutes(self, lines: list[str]) -> int | None:
        joined = " ".join(lines)
        # Explicit single duration.
        match = re.search(r"(?i)время уровней:\s*(\d+)\s*мин", joined)
        if match:
            return int(match.group(1))
        # Prefer Day 1A duration when variants exist.
        match = re.search(r"(?i)(?:день|day)\s*1a[^\d]*(\d+)\s*мин", joined)
        if match:
            return int(match.group(1))
        match = re.search(r"(?i)поздняя рег[^\d]*(\d+)\s*мин", joined)
        if match:
            return int(match.group(1))
        match = re.search(r"(\d+)\s*мин", joined)
        return int(match.group(1)) if match else 20

    def _notes(self, lines: list[str]) -> list[str]:
        notes: list[str] = []
        for line in lines:
            lower = line.lower()
            if lower.startswith("турнирная") or "нокаут" in lower or "bounty" in lower:
                notes.append(line)
            if "время уровней" in lower and ("день" in lower or "day" in lower):
                notes.append(line)
        return notes[:5]

    def _parse_sets(
        self,
        lines: list[str],
        *,
        default_minutes: int | None,
        late_reg: int | None,
    ) -> list[DraftStructureSet]:
        current = _SetBuf(label="default", default_minutes=default_minutes)
        sets: list[_SetBuf] = []
        in_table = False

        for line in lines:
            set_label = self._set_label(line)
            if set_label is not None:
                if current.levels:
                    sets.append(current)
                current = _SetBuf(label=set_label, default_minutes=default_minutes)
                in_table = False
                continue
            if line.upper().startswith("LEVEL"):
                in_table = True
                continue
            if not in_table:
                continue
            if line.upper().startswith("NEXT LEVELS") or line.upper().startswith("END OF"):
                in_table = False
                continue
            level = self._parse_level_line(line)
            if level is not None:
                current.levels.append(level)

        if current.levels:
            sets.append(current)
        if not sets:
            return []

        result: list[DraftStructureSet] = []
        for buf in sets:
            levels: list[DraftBlindLevel] = []
            for row in buf.levels:
                minutes = row.minutes or buf.default_minutes or default_minutes or 20
                levels.append(
                    DraftBlindLevel(
                        level_no=row.level_no,
                        sb=row.sb,
                        bb=row.bb,
                        ante=row.ante,
                        minutes=minutes,
                        is_late_reg_end=bool(late_reg and row.level_no == late_reg),
                    )
                )
            result.append(DraftStructureSet(label=buf.label, levels=levels))
        return result

    def _set_label(self, line: str) -> str | None:
        text = line.strip()
        match = re.fullmatch(r"(?i)(?:day|день)\s*1\s*([ab])", text)
        if match:
            return f"1{match.group(1).upper()}"
        match = re.fullmatch(r"(?i)day\s*1a/?1b/?1c", text)
        if match:
            return "default"
        if re.fullmatch(r"(?i)day\s*1", text):
            return "default"
        if re.fullmatch(r"(?i)final(?:\s*day)?", text):
            return "Final"
        return None

    def _parse_level_line(self, line: str) -> _LevelRow | None:
        nums = [int(item) for item in re.findall(r"\d+", line)]
        if len(nums) < 3:
            return None
        level_no, sb, bb = nums[0], nums[1], nums[2]
        if level_no < 1 or level_no > 80:
            return None
        ante: int | None = None
        minutes: int | None = None
        if len(nums) == 3:
            ante = None
        elif len(nums) == 4:
            # Either ante or minutes. Minutes are usually small (<=60).
            if nums[3] <= 60 and nums[3] != nums[2]:
                minutes = nums[3]
            else:
                ante = nums[3]
        else:
            ante = nums[3]
            if nums[4] <= 90:
                minutes = nums[4]
        return _LevelRow(level_no=level_no, sb=sb, bb=bb, ante=ante, minutes=minutes)
