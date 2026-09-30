"""Текст с картинки через Tesseract — бесплатно и на своём сервере (Иван, 30.09).

Афиши союзов и скрины лобби читаются неидеально: стилизованные цифры на ярком фоне
Tesseract иногда путает. Поэтому результат идёт только в черновик акции, а сомнительные
поля менеджер проверяет глазами.
"""

from __future__ import annotations

import asyncio
import shutil

from app.core.exceptions import AppError

LANGUAGES = "rus+eng"
TIMEOUT_SECONDS = 40


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
    """Два прохода: разреженный текст (афиши) и блоком (списки в лобби) — склеиваем.

    Разборщик берёт первые совпадения и не дублирует места, поэтому повтор строк
    из второго прохода ему не мешает, а пропущенное первым он добирает.
    """
    if shutil.which("tesseract") is None:
        raise AppError("ocr_unavailable", "Распознавание картинок на сервере не установлено", 503)
    sparse = await _run(data, "11")
    block = await _run(data, "6")
    return f"{sparse}\n{block}"
