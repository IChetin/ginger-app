from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app.core.exceptions import AppError

DetectedType = str

ZIP_MAGIC = b"PK\x03\x04"
PDF_MAGIC = b"%PDF"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
GIF_MAGIC = b"GIF8"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass(frozen=True)
class DetectedFile:
    detected_type: DetectedType
    content_type: str
    sha256: str
    size: int


def _looks_like_csv(data: bytes) -> bool:
    sample = data[:4096]
    if b"\x00" in sample:
        return False
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = sample.decode("cp1251")
        except UnicodeDecodeError:
            return False
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 1:
        return False
    return any("," in line or ";" in line or "\t" in line for line in lines[:5])


def detect_file(
    data: bytes,
    *,
    filename: str,
    declared_content_type: str | None,
    max_bytes: int,
) -> DetectedFile:
    if not data:
        raise AppError("validation_error", "Uploaded file is empty", 400)
    if len(data) > max_bytes:
        raise AppError(
            "validation_error",
            f"File exceeds max size of {max_bytes} bytes",
            400,
        )

    lower_name = filename.lower()
    detected_type: DetectedType | None = None
    content_type = declared_content_type or "application/octet-stream"

    if data.startswith(ZIP_MAGIC) and (
        lower_name.endswith(".xlsx")
        or "spreadsheetml" in content_type
        or content_type == XLSX_CONTENT_TYPE
    ):
        detected_type = "xlsx"
        content_type = XLSX_CONTENT_TYPE
    elif data.startswith(PDF_MAGIC) or lower_name.endswith(".pdf"):
        if not data.startswith(PDF_MAGIC):
            raise AppError("validation_error", "File extension says pdf but content is not", 400)
        detected_type = "pdf"
        content_type = "application/pdf"
    elif data.startswith(PNG_MAGIC) or data.startswith(JPEG_MAGIC) or data.startswith(GIF_MAGIC):
        detected_type = "image"
        if data.startswith(PNG_MAGIC):
            content_type = "image/png"
        elif data.startswith(JPEG_MAGIC):
            content_type = "image/jpeg"
        else:
            content_type = "image/gif"
    elif _looks_like_csv(data) or lower_name.endswith(".csv"):
        if not _looks_like_csv(data):
            raise AppError("validation_error", "File extension says csv but content is not", 400)
        detected_type = "csv"
        content_type = "text/csv"
    else:
        raise AppError(
            "validation_error",
            "Unsupported file type; expected xlsx, csv, pdf, jpg/png",
            400,
        )

    return DetectedFile(
        detected_type=detected_type,
        content_type=content_type,
        sha256=hashlib.sha256(data).hexdigest(),
        size=len(data),
    )
