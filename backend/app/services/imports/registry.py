from __future__ import annotations

from app.services.imports.base import ParserContext, ScheduleParser, StructureParser

_REGISTRY: list[ScheduleParser] = []
_STRUCTURE_REGISTRY: list[StructureParser] = []


def register_parser(parser: ScheduleParser) -> ScheduleParser:
    _REGISTRY.append(parser)
    return parser


def register_structure_parser(parser: StructureParser) -> StructureParser:
    _STRUCTURE_REGISTRY.append(parser)
    return parser


def list_parsers() -> list[ScheduleParser]:
    return list(_REGISTRY)


def list_structure_parsers() -> list[StructureParser]:
    return list(_STRUCTURE_REGISTRY)


def find_parser(ctx: ParserContext, data: bytes) -> ScheduleParser | None:
    for parser in _REGISTRY:
        if parser.supports(ctx, data):
            return parser
    return None


def find_parser_by_name(name: str) -> ScheduleParser | None:
    for parser in _REGISTRY:
        if parser.name == name:
            return parser
    return None


def find_structure_parser(ctx: ParserContext, data: bytes) -> StructureParser | None:
    for parser in _STRUCTURE_REGISTRY:
        if parser.supports(ctx, data):
            return parser
    return None


def find_structure_parser_by_name(name: str) -> StructureParser | None:
    for parser in _STRUCTURE_REGISTRY:
        if parser.name == name:
            return parser
    return None
