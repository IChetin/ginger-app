"""Built-in schedule/structure parsers.

Importing this package registers parsers in the global registry.
"""

from __future__ import annotations

from app.services.imports.parsers.apc_xlsx import AmberPokerChampionshipXlsxParser
from app.services.imports.parsers.bpt_pdf import BelarusPokerTourPdfParser
from app.services.imports.parsers.rpf_pdf import RussianPokerFestivalPdfParser
from app.services.imports.parsers.rpt_schedule_ocr import RptScheduleOcrParser
from app.services.imports.parsers.rpt_structure_pdf import RptTournamentStructurePdfParser
from app.services.imports.registry import register_parser, register_structure_parser

_BUILTIN_NAMES = frozenset(
    {
        "apc_xlsx_v1",
        "rpf_pdf_v1",
        "bpt_pdf_v1",
        "rpt_schedule_ocr_v1",
        "rpt_structure_pdf_v1",
    }
)


def register_builtin_parsers(*, force: bool = False) -> None:
    from app.services.imports.registry import list_parsers, list_structure_parsers

    if not force and (list_parsers() or list_structure_parsers()):
        # Avoid duplicate registrations when package imported multiple times.
        names = {parser.name for parser in list_parsers()} | {
            parser.name for parser in list_structure_parsers()
        }
        if names >= _BUILTIN_NAMES:
            return
        # Registry incomplete (e.g. new parser added) — register only missing ones.
        known = names
        for parser in (
            AmberPokerChampionshipXlsxParser(),
            RussianPokerFestivalPdfParser(),
            BelarusPokerTourPdfParser(),
            RptScheduleOcrParser(),
        ):
            if parser.name not in known:
                register_parser(parser)
        structure = RptTournamentStructurePdfParser()
        if structure.name not in known:
            register_structure_parser(structure)
        return
    register_parser(AmberPokerChampionshipXlsxParser())
    register_parser(RussianPokerFestivalPdfParser())
    register_parser(BelarusPokerTourPdfParser())
    register_parser(RptScheduleOcrParser())
    register_structure_parser(RptTournamentStructurePdfParser())


register_builtin_parsers()
