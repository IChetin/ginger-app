"""Unit tests for organizer logo validation."""

from __future__ import annotations

import struct
import zlib

import pytest

from app.utils.logo_image import LogoValidationError, validate_logo_bytes


def _crc(chunk_type: bytes, data: bytes) -> bytes:
    return struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)


def make_png(width: int, height: int) -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", 13) + b"IHDR" + ihdr + _crc(b"IHDR", ihdr)
    iend = struct.pack(">I", 0) + b"IEND" + _crc(b"IEND", b"")
    return signature + ihdr_chunk + iend


def test_accepts_png_120() -> None:
    data = make_png(120, 120)
    result = validate_logo_bytes(data, max_bytes=1024 * 1024, min_dimension=120)
    assert result.content_type == "image/png"
    assert result.width == 120
    assert result.height == 120


def test_rejects_png_too_small() -> None:
    data = make_png(64, 64)
    with pytest.raises(LogoValidationError, match="too small"):
        validate_logo_bytes(data, max_bytes=1024 * 1024, min_dimension=120)


def test_rejects_oversized_payload() -> None:
    data = make_png(120, 120) + b"x" * 100
    with pytest.raises(LogoValidationError, match="too large"):
        validate_logo_bytes(data, max_bytes=len(data) - 1, min_dimension=120)


def test_accepts_svg_with_viewbox() -> None:
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle r="10"/></svg>'
    result = validate_logo_bytes(svg, max_bytes=1024 * 1024, min_dimension=120)
    assert result.content_type == "image/svg+xml"
    assert result.width == 200


def test_rejects_unknown_bytes() -> None:
    with pytest.raises(LogoValidationError, match="unsupported"):
        validate_logo_bytes(b"not-an-image", max_bytes=1024, min_dimension=120)


@pytest.mark.unit
def test_marked_unit() -> None:
    assert True
