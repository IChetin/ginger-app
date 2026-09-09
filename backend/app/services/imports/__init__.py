"""Import pipeline services and built-in parser registration."""

from app.services.imports import parsers as _parsers  # noqa: F401

__all__ = ["parsers"]
