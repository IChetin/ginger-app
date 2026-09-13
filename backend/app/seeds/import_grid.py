"""Импорт сетки клуба из CSV на сервере — то же, что «Сетки клубов» в админке.

Без --apply — предпросмотр: изменения посчитаны и откатаны. Файл читается из stdin:

    ssh ginger 'cd /opt/ginger/app && docker compose -f docker-compose.prod.yml exec -T \
        backend python -m app.seeds.import_grid ginger21 --apply' < poker21-2026-09-14.csv
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.models.clubs import Club
from app.services.tournaments.imports import import_club_templates


async def run(slug: str, data: bytes, *, apply: bool) -> None:
    async with async_session_factory() as session, session.begin():
        club_id = await session.scalar(select(Club.id).where(Club.slug == slug))
        if club_id is None:
            raise SystemExit(f"Клуб {slug} не найден")
        result = await import_club_templates(session, club_id, data, dry_run=not apply)
    await engine.dispose()
    mode = "применено" if apply else "предпросмотр, в базе ничего не изменилось"
    print(
        f"{slug}: {mode}. Строк {result.rows_total}, турниров в сетке {result.templates_parsed}; "
        f"шаблоны +{result.templates_created} -{result.templates_removed}, "
        f"старты +{result.tournaments_created} ~{result.tournaments_updated} "
        f"-{result.tournaments_deleted}"
    )
    for issue in result.issues:
        print(f"  строка {issue.row}: {issue.message}")


def main() -> None:
    args = [arg for arg in sys.argv[1:] if arg != "--apply"]
    if len(args) != 1:
        print(
            "usage: python -m app.seeds.import_grid CLUB_SLUG [--apply] < grid.csv", file=sys.stderr
        )
        raise SystemExit(2)
    asyncio.run(run(args[0], sys.stdin.buffer.read(), apply="--apply" in sys.argv))


if __name__ == "__main__":
    main()
