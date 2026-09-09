from __future__ import annotations

import pytest

from app.core.exceptions import AppError
from app.services.imports.detect import detect_file


def test_detect_pdf_and_images() -> None:
    pdf = detect_file(b"%PDF-1.4...", filename="a.pdf", declared_content_type=None, max_bytes=1000)
    assert pdf.detected_type == "pdf"
    png = detect_file(
        b"\x89PNG\r\n\x1a\nxxxx",
        filename="a.png",
        declared_content_type="image/png",
        max_bytes=1000,
    )
    assert png.detected_type == "image"
    csv = detect_file(
        b"num,name,buyin\n1,Main,100\n",
        filename="a.csv",
        declared_content_type="text/csv",
        max_bytes=1000,
    )
    assert csv.detected_type == "csv"


def test_reject_oversize_and_unknown() -> None:
    with pytest.raises(AppError) as oversized:
        detect_file(b"x" * 10, filename="a.csv", declared_content_type=None, max_bytes=5)
    assert oversized.value.code == "validation_error"
    with pytest.raises(AppError):
        detect_file(b"\x00\x01\x02", filename="a.bin", declared_content_type=None, max_bytes=1000)
