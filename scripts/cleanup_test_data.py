#!/usr/bin/env python3
"""Delete E2E/test artefacts from the dev database (prefix TEST_ / stubs / test emails).

Usage (from repo root)::

    backend/.venv/bin/python scripts/cleanup_test_data.py --dry-run
    backend/.venv/bin/python scripts/cleanup_test_data.py
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import asyncpg

from _db import (
    STUB_SERIES_NAMES,
    TEST_EMAIL_LIKE,
    TEST_EMAIL_SMOKE_LIKE,
    TEST_SERIES_PREFIX,
    resolve_database_url,
)


def _series_match_sql() -> tuple[str, list[Any]]:
    """ILIKE TEST_% plus exact stub names (case-insensitive)."""
    stubs_lower = [name.lower() for name in STUB_SERIES_NAMES]
    return (
        """
        SELECT id, name, status,
               (SELECT count(*) FROM events e WHERE e.series_id = series.id) AS event_count
        FROM series
        WHERE name ILIKE $1
           OR lower(trim(name)) = ANY($2::text[])
        ORDER BY name
        """,
        [f"{TEST_SERIES_PREFIX}%", stubs_lower],
    )


async def _collect(conn: asyncpg.Connection) -> dict[str, Any]:
    series_sql, series_args = _series_match_sql()
    series_rows = await conn.fetch(series_sql, *series_args)
    venue_rows = await conn.fetch(
        "SELECT id, name FROM venues WHERE name ILIKE $1 ORDER BY name",
        f"{TEST_SERIES_PREFIX}%",
    )
    organizer_rows = await conn.fetch(
        "SELECT id, name FROM organizers WHERE name ILIKE $1 ORDER BY name",
        f"{TEST_SERIES_PREFIX}%",
    )
    user_rows = await conn.fetch(
        """
        SELECT id, email, role::text AS role
        FROM users
        WHERE email LIKE $1
           OR email LIKE $2 ESCAPE '\\'
        ORDER BY email
        """,
        TEST_EMAIL_LIKE,
        TEST_EMAIL_SMOKE_LIKE,
    )
    return {
        "series_rows": series_rows,
        "venue_rows": venue_rows,
        "organizer_rows": organizer_rows,
        "user_rows": user_rows,
        "series": len(series_rows),
        "venues": len(venue_rows),
        "organizers": len(organizer_rows),
        "users": len(user_rows),
        "series_ids": [row["id"] for row in series_rows],
        "venue_ids": [row["id"] for row in venue_rows],
        "organizer_ids": [row["id"] for row in organizer_rows],
        "user_ids": [row["id"] for row in user_rows],
    }


def _print_plan(counts: dict[str, Any], *, dry_run: bool) -> None:
    prefix = "would delete" if dry_run else "deleting"
    print(
        f"{prefix}: series={counts['series']} venues={counts['venues']} "
        f"organizers={counts['organizers']} users={counts['users']}"
    )
    for row in counts["series_rows"]:
        print(
            f"  series: {row['name']!r} status={row['status']} "
            f"events={row['event_count']} id={row['id']}"
        )
    for row in counts["venue_rows"]:
        print(f"  venue: {row['name']!r} id={row['id']}")
    for row in counts["organizer_rows"]:
        print(f"  organizer: {row['name']!r} id={row['id']}")
    for row in counts["user_rows"]:
        print(f"  user: {row['email']} role={row['role']} id={row['id']}")


async def cleanup(*, dry_run: bool) -> dict[str, int]:
    dsn = resolve_database_url()
    conn = await asyncpg.connect(dsn)
    try:
        counts = await _collect(conn)
        _print_plan(counts, dry_run=dry_run)
        if dry_run:
            return {
                "series": counts["series"],
                "venues": counts["venues"],
                "organizers": counts["organizers"],
                "users": counts["users"],
            }

        async with conn.transaction():
            series_ids = counts["series_ids"]
            user_ids = counts["user_ids"]

            if series_ids:
                event_ids = [
                    row["id"]
                    for row in await conn.fetch(
                        "SELECT id FROM events WHERE series_id = ANY($1::uuid[])",
                        series_ids,
                    )
                ]
                flight_ids: list[object] = []
                if event_ids:
                    flight_ids = [
                        row["id"]
                        for row in await conn.fetch(
                            "SELECT id FROM flights WHERE event_id = ANY($1::uuid[])",
                            event_ids,
                        )
                    ]
                    await conn.execute(
                        "DELETE FROM results WHERE event_id = ANY($1::uuid[])",
                        event_ids,
                    )
                    await conn.execute(
                        "DELETE FROM change_log WHERE entity_type = 'event' AND entity_id = ANY($1::uuid[])",
                        event_ids,
                    )
                if flight_ids:
                    await conn.execute(
                        """
                        DELETE FROM bookmarks
                        WHERE target_type = 'flight' AND target_id = ANY($1::uuid[])
                        """,
                        flight_ids,
                    )
                    await conn.execute(
                        "DELETE FROM change_log WHERE entity_type = 'flight' AND entity_id = ANY($1::uuid[])",
                        flight_ids,
                    )
                await conn.execute(
                    """
                    DELETE FROM bookmarks
                    WHERE target_type = 'series' AND target_id = ANY($1::uuid[])
                    """,
                    series_ids,
                )
                await conn.execute(
                    "DELETE FROM change_log WHERE entity_type = 'series' AND entity_id = ANY($1::uuid[])",
                    series_ids,
                )
                await conn.execute(
                    "DELETE FROM import_jobs WHERE series_id = ANY($1::uuid[])",
                    series_ids,
                )
                await conn.execute("DELETE FROM series WHERE id = ANY($1::uuid[])", series_ids)

            if user_ids:
                await conn.execute(
                    "DELETE FROM notification_queue WHERE user_id = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute(
                    "DELETE FROM push_subscriptions WHERE user_id = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute(
                    "DELETE FROM bookmarks WHERE user_id = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute(
                    "DELETE FROM results WHERE user_id = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute(
                    "DELETE FROM import_jobs WHERE uploaded_by = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute(
                    "UPDATE change_log SET actor_id = NULL WHERE actor_id = ANY($1::uuid[])",
                    user_ids,
                )
                await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", user_ids)

            venue_ids = counts["venue_ids"]
            if venue_ids:
                # Only delete venues not referenced by remaining series.
                await conn.execute(
                    """
                    DELETE FROM venues
                    WHERE id = ANY($1::uuid[])
                      AND NOT EXISTS (SELECT 1 FROM series s WHERE s.venue_id = venues.id)
                    """,
                    venue_ids,
                )
            organizer_ids = counts["organizer_ids"]
            if organizer_ids:
                await conn.execute(
                    """
                    DELETE FROM organizers
                    WHERE id = ANY($1::uuid[])
                      AND NOT EXISTS (SELECT 1 FROM series s WHERE s.organizer_id = organizers.id)
                    """,
                    organizer_ids,
                )

        print(
            f"deleted: series={counts['series']} venues={counts['venues']} "
            f"organizers={counts['organizers']} users={counts['users']}"
        )
        return {
            "series": counts["series"],
            "venues": counts["venues"],
            "organizers": counts["organizers"],
            "users": counts["users"],
        }
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print TEST_/stub rows that would be deleted",
    )
    args = parser.parse_args()
    asyncio.run(cleanup(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
