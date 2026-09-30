"""Текст с картинки через Tesseract — бесплатно и на своём сервере (Иван, 30.09).

Афиши союзов и скрины лобби читаются неидеально: светлый текст на тёмном фоне и мелкие
цифры Tesseract путает. Поэтому картинку готовим (вдвое крупнее, в сером, негатив —
тёмный текст на светлом) и читаем четырьмя проходами; разборщик берёт первые совпадения
и сверяет призы с фондом. Результат идёт только в черновик — проверяет человек.
"""

from __future__ import annotations

import asyncio
import io
import shutil

from PIL import Image, ImageOps

from app.core.exceptions import AppError

LANGUAGES = "rus+eng"
TIMEOUT_SECONDS = 40
MAX_SIDE = 2400


def _prepared(data: bytes) -> bytes:
    """Вдвое крупнее, серое, негатив и растянутый контраст — так Tesseract видит лучше."""
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("L")
    scale = min(2.0, MAX_SIDE / max(image.size))
    if scale > 1:
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
        )
    image = ImageOps.autocontrast(ImageOps.invert(image))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


async def _run(data: bytes, psm: str) -> str:
    process = await asyncio.create_subprocess_exec(
        "tesseract",
        "stdin",
        "stdout",
        "-l",
        LANGUAGES,
        "--psm",
        psm,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(data), TIMEOUT_SECONDS)
    except TimeoutError as exc:
        process.kill()
        raise AppError("ocr_timeout", "Картинка распознаётся слишком долго", 504) from exc
    return stdout.decode("utf-8", errors="replace")


async def image_to_text(data: bytes) -> str:
    """Подготовленная картинка первой (она читается чище), потом исходник.

    Разреженный текст (psm 11) ловит блоки афиши, блоком (psm 6) — строки таблиц в лобби.
    """
    if shutil.which("tesseract") is None:
        raise AppError("ocr_unavailable", "Распознавание картинок на сервере не установлено", 503)
    try:
        prepared = await asyncio.to_thread(_prepared, data)
    except OSError:
        prepared = data
    passes = [(prepared, "11"), (prepared, "6"), (data, "11"), (data, "6")]
    texts = [await _run(image, psm) for image, psm in passes]
    return "\n".join(texts)
