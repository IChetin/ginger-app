"""Загрузить неделю выигрышей из CSV «Текучки» прямо на сервере — то же, что кнопка в админке.

CSV читается со стандартного входа, поэтому файл не нужно класть на сервер:

    cat wins-2026-W39.csv | ssh ginger 'cd /opt/ginger/app && docker compose \
        -f docker-compose.prod.yml exec -T backend python -m app.seeds.import_wins you@example.com'

EMAIL — чей это импорт (попадёт в «кто занёс»). Дубли с уже занесённым не создаются.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.core.email import normalize_email
from app.models.auth import User
from app.services.feed import import_wins_csv


async def import_wins(email: str, content: bytes) -> str:
    normalized = normalize_email(email)
    async with async_session_factory() as session, session.begin():
        actor = await session.scalar(select(User).where(User.email == normalized))
        if actor is None:
            raise SystemExit(f"Пользователь {normalized} не найден")
        result = await import_wins_csv(session, actor, content)
    await engine.dispose()
    lines = [f"добавлено {result.created}, уже было {result.duplicates}"]
    lines += [f"  не разобрано — {error}" for error in result.errors]
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python -m app.seeds.import_wins EMAIL < wins.csv", file=sys.stderr)
        raise SystemExit(2)
    print(asyncio.run(import_wins(sys.argv[1], sys.stdin.buffer.read())))


if __name__ == "__main__":
    main()
