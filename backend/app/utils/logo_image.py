"""Validate organizer logo uploads (PNG / WebP / SVG) without Pillow."""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass

ALLOWED_CONTENT_TYPES = frozenset(
    {
        "image/png",
        "image/webp",
        "image/svg+xml",
    }
)

_SVG_TAG_RE = re.compile(r"<svg\b", re.IGNORECASE)
_SVG_VIEWBOX_RE = re.compile(
    r"viewBox\s*=\s*[\"']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*[\"']",
    re.IGNORECASE,
)
_SVG_WIDTH_RE = re.compile(r"\bwidth\s*=\s*[\"']\s*([-\d.]+)", re.IGNORECASE)
_SVG_HEIGHT_RE = re.compile(r"\bheight\s*=\s*[\"']\s*([-\d.]+)", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class ValidatedLogo:
    content_type: str
    data: bytes
    width: int | None
    height: int | None


class LogoValidationError(ValueError):
    """Raised when uploaded bytes are not an acceptable logo."""


def validate_logo_bytes(
    data: bytes,
    *,
    declared_content_type: str | None = None,
    max_bytes: int,
    min_dimension: int,
) -> ValidatedLogo:
    if not data:
        raise LogoValidationError("empty file")
    if len(data) > max_bytes:
        raise LogoValidationError(f"file too large (max {max_bytes} bytes)")

    detected = _detect_content_type(data)
    if detected is None:
        raise LogoValidationError("unsupported image type (PNG, WebP, SVG only)")

    if declared_content_type:
        normalized = declared_content_type.split(";", 1)[0].strip().lower()
        if normalized and normalized not in ALLOWED_CONTENT_TYPES:
            raise LogoValidationError("unsupported Content-Type")
        if normalized and normalized != detected:
            raise LogoValidationError("Content-Type does not match file contents")

    width: int | None
    height: int | None
    if detected == "image/png":
        width, height = _png_size(data)
    elif detected == "image/webp":
        width, height = _webp_size(data)
    else:
        width, height = _svg_size(data)

    if width is not None and height is not None:
        if width < min_dimension or height < min_dimension:
            raise LogoValidationError(
                f"image too small (min {min_dimension}×{min_dimension})"
            )

    return ValidatedLogo(
        content_type=detected,
        data=data,
        width=width,
        height=height,
    )


def _detect_content_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    # SVG may start with BOM / XML declaration.
    head = data[:512].lstrip()
    if head.startswith(b"\xef\xbb\xbf"):
        head = head[3:]
    try:
        text = head.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if _SVG_TAG_RE.search(text):
        return "image/svg+xml"
    return None


def _png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24:
        raise LogoValidationError("invalid PNG")
    width, height = struct.unpack(">II", data[16:24])
    if width <= 0 or height <= 0:
        raise LogoValidationError("invalid PNG dimensions")
    return width, height


def _webp_size(data: bytes) -> tuple[int, int]:
    if len(data) < 30:
        raise LogoValidationError("invalid WebP")
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        # Canvas size is 24-bit little-endian, stored as size-1.
        w = 1 + int.from_bytes(data[24:27], "little")
        h = 1 + int.from_bytes(data[27:30], "little")
        return w, h
    if chunk == b"VP8 " and len(data) >= 30:
        # Lossy bitstream: width/height in frame header at offset 26.
        bits = struct.unpack("<H", data[26:28])[0]
        width = bits & 0x3FFF
        bits = struct.unpack("<H", data[28:30])[0]
        height = bits & 0x3FFF
        if width <= 0 or height <= 0:
            raise LogoValidationError("invalid WebP dimensions")
        return width, height
    if chunk == b"VP8L" and len(data) >= 25:
        bits = struct.unpack("<I", data[21:25])[0]
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    raise LogoValidationError("unsupported WebP variant")


def _svg_size(data: bytes) -> tuple[int | None, int | None]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise LogoValidationError("invalid SVG encoding") from exc
    if not _SVG_TAG_RE.search(text):
        raise LogoValidationError("invalid SVG")

    viewbox = _SVG_VIEWBOX_RE.search(text)
    if viewbox:
        width = abs(float(viewbox.group(3)))
        height = abs(float(viewbox.group(4)))
        return int(width), int(height)

    width_m = _SVG_WIDTH_RE.search(text)
    height_m = _SVG_HEIGHT_RE.search(text)
    if width_m and height_m:
        return int(float(width_m.group(1))), int(float(height_m.group(1)))

    # Scalable logo without explicit size — accept.
    return None, None
