#!/usr/bin/env python3
"""CLI helpers for Playwright E2E against the dev database.

Commands print JSON on stdout.

Usage (from repo root)::

    backend/.venv/bin/python scripts/e2e_db.py verify-email --email test+x@example.com
    backend/.venv/bin/python scripts/e2e_db.py create-staff-user --email ... --password ... --role editor
    backend/.venv/bin/python scripts/e2e_db.py queue-for-flight --flight-id ...
    backend/.venv/bin/python scripts/e2e_db.py create-published-series --name TEST_...
    backend/.venv/bin/python scripts/e2e_db.py cleanup --email ... --series-prefix TEST_abc
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import asyncpg
from argon2 import PasswordHasher

from _db import resolve_database_url

_hasher = PasswordHasher()


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(resolve_database_url())


async def cmd_verify_email(email: str) -> dict[str, object]:
    conn = await _connect()
    try:
        row = await conn.fetchrow(
            """
            UPDATE users
            SET email_verified_at = COALESCE(email_verified_at, NOW())
            WHERE email = lower($1)
            RETURNING id::text, email, role::text, email_verified_at
            """,
            email.strip().lower(),
        )
        if row is None:
            raise SystemExit(f"user not found: {email}")
        return dict(row)
    finally:
        await conn.close()


async def cmd_set_user_password(*, email: str, password: str) -> dict[str, object]:
    email_n = email.strip().lower()
    password_hash = _hasher.hash(password)
    conn = await _connect()
    try:
        row = await conn.fetchrow("SELECT id::text FROM users WHERE email = $1", email_n)
        if row is None:
            raise SystemExit(f"user not found: {email_n}")
        await conn.execute(
            """
            UPDATE users
            SET password_hash = $2,
                email_verified_at = COALESCE(email_verified_at, NOW()),
                updated_at = NOW()
            WHERE id = $1::uuid
            """,
            row["id"],
            password_hash,
        )
        return {"id": row["id"], "email": email_n, "has_password": True}
    finally:
        await conn.close()


async def cmd_create_staff_user(
    *,
    email: str,
    password: str,
    role: str,
    nickname: str | None,
) -> dict[str, object]:
    if role not in {"user", "editor", "admin"}:
        raise SystemExit(f"invalid role: {role}")
    email_n = email.strip().lower()
    nick = nickname or email_n.split("@")[0].replace("+", "_")[:32]
    password_hash = _hasher.hash(password)
    user_id = uuid.uuid4()
    conn = await _connect()
    try:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT id::text FROM users WHERE email = $1",
                email_n,
            )
            if existing:
                await conn.execute(
                    """
                    UPDATE users
                    SET password_hash = $2,
                        role = $3::user_role,
                        email_verified_at = COALESCE(email_verified_at, NOW()),
                        nickname = $4
                    WHERE id = $1::uuid
                    """,
                    existing["id"],
                    password_hash,
                    role,
                    nick,
                )
                return {"id": existing["id"], "email": email_n, "role": role, "created": False}

            await conn.execute(
                """
                INSERT INTO users (
                    id, email, nickname, role, password_hash,
                    email_verified_at, base_currency, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4::user_role, $5, NOW(), 'RUB', NOW(), NOW()
                )
                """,
                user_id,
                email_n,
                nick,
                role,
                password_hash,
            )
            return {"id": str(user_id), "email": email_n, "role": role, "created": True}
    finally:
        await conn.close()


async def cmd_queue_for_flight(flight_id: str) -> dict[str, object]:
    conn = await _connect()
    try:
        rows = await conn.fetch(
            """
            SELECT id::text, user_id::text, type::text, scheduled_at, status::text, payload
            FROM notification_queue
            WHERE bookmark_id IN (
                SELECT id FROM bookmarks
                WHERE target_type = 'flight' AND target_id = $1::uuid
            )
            ORDER BY scheduled_at
            """,
            flight_id,
        )
        return {
            "items": [
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "type": r["type"],
                    "scheduled_at": r["scheduled_at"].isoformat(),
                    "status": r["status"],
                }
                for r in rows
            ]
        }
    finally:
        await conn.close()


async def cmd_create_published_series(
    *,
    name: str,
    venue_timezone: str = "Europe/Moscow",
    start_at: str | None = None,
) -> dict[str, object]:
    """Create organizer/venue/series/event/flight marked published for E2E."""
    slug = f"test-{uuid.uuid4().hex[:10]}"
    organizer_id = uuid.uuid4()
    venue_id = uuid.uuid4()
    series_id = uuid.uuid4()
    event_id = uuid.uuid4()
    flight_id = uuid.uuid4()
    if start_at:
        flight_start = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
    else:
        flight_start = datetime.now(UTC) + timedelta(days=3)

    starts_on = (flight_start.astimezone(UTC) - timedelta(days=1)).date()
    ends_on = starts_on + timedelta(days=5)

    conn = await _connect()
    try:
        async with conn.transaction():
            country = await conn.fetchval("SELECT code FROM countries LIMIT 1")
            if country is None:
                raise SystemExit("no countries in DB — run seeds first")
            await conn.execute(
                """
                INSERT INTO organizers (id, name, slug, links, created_at, updated_at)
                VALUES ($1, $2, $3, '{}'::jsonb, NOW(), NOW())
                """,
                organizer_id,
                f"{name} Org",
                slug,
            )
            await conn.execute(
                """
                INSERT INTO venues (
                    id, country_code, city, name, slug, timezone, created_at, updated_at
                ) VALUES ($1, $2, 'Test City', $3, $4, $5, NOW(), NOW())
                """,
                venue_id,
                country,
                f"{name} Venue",
                slug,
                venue_timezone,
            )
            await conn.execute(
                """
                INSERT INTO series (
                    id, organizer_id, venue_id, name, starts_on, ends_on,
                    status, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    'schedule_published'::series_status, NOW(), NOW()
                )
                """,
                series_id,
                organizer_id,
                venue_id,
                name,
                starts_on,
                ends_on,
            )
            await conn.execute(
                """
                INSERT INTO events (
                    id, series_id, number, name, buyin, currency_code,
                    game_type, status, created_at, updated_at
                ) VALUES (
                    $1, $2, 1, $3, 10000.00, 'RUB',
                    'nlh'::game_type, 'scheduled'::event_status, NOW(), NOW()
                )
                """,
                event_id,
                series_id,
                f"{name} Main",
            )
            await conn.execute(
                """
                INSERT INTO flights (id, event_id, label, start_at)
                VALUES ($1, $2, NULL, $3)
                """,
                flight_id,
                event_id,
                flight_start,
            )
        return {
            "organizer_id": str(organizer_id),
            "venue_id": str(venue_id),
            "series_id": str(series_id),
            "event_id": str(event_id),
            "flight_id": str(flight_id),
            "name": name,
            "starts_on": starts_on.isoformat(),
            "ends_on": ends_on.isoformat(),
            "start_at": flight_start.isoformat(),
        }
    finally:
        await conn.close()


async def cmd_move_flight(flight_id: str, start_at: str) -> dict[str, object]:
    flight_start = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
    conn = await _connect()
    try:
        row = await conn.fetchrow(
            """
            UPDATE flights
            SET start_at = $2, updated_at = NOW()
            WHERE id = $1::uuid
            RETURNING id::text, event_id::text, start_at
            """,
            flight_id,
            flight_start,
        )
        if row is None:
            raise SystemExit(f"flight not found: {flight_id}")
        return {
            "id": row["id"],
            "event_id": row["event_id"],
            "start_at": row["start_at"].isoformat(),
        }
    finally:
        await conn.close()


async def cmd_cleanup(*, email: str | None, series_prefix: str | None) -> dict[str, object]:
    conn = await _connect()
    deleted = {"users": 0, "series": 0}
    try:
        async with conn.transaction():
            if series_prefix:
                series_ids = [
                    r["id"]
                    for r in await conn.fetch(
                        "SELECT id FROM series WHERE name LIKE $1",
                        f"{series_prefix}%",
                    )
                ]
                if series_ids:
                    await conn.execute(
                        """
                        DELETE FROM bookmarks
                        WHERE (target_type = 'series' AND target_id = ANY($1::uuid[]))
                           OR (target_type = 'flight' AND target_id IN (
                                SELECT f.id FROM flights f
                                JOIN events e ON e.id = f.event_id
                                WHERE e.series_id = ANY($1::uuid[])
                              ))
                        """,
                        series_ids,
                    )
                    await conn.execute(
                        """
                        DELETE FROM change_log
                        WHERE (entity_type = 'series' AND entity_id = ANY($1::uuid[]))
                           OR (entity_type = 'event' AND entity_id IN (
                                SELECT id FROM events WHERE series_id = ANY($1::uuid[])
                              ))
                           OR (entity_type = 'flight' AND entity_id IN (
                                SELECT f.id FROM flights f
                                JOIN events e ON e.id = f.event_id
                                WHERE e.series_id = ANY($1::uuid[])
                              ))
                        """,
                        series_ids,
                    )
                    await conn.execute(
                        "DELETE FROM import_jobs WHERE series_id = ANY($1::uuid[])",
                        series_ids,
                    )
                    await conn.execute(
                        "DELETE FROM results WHERE event_id IN "
                        "(SELECT id FROM events WHERE series_id = ANY($1::uuid[]))",
                        series_ids,
                    )
                    await conn.execute(
                        "DELETE FROM series WHERE id = ANY($1::uuid[])",
                        series_ids,
                    )
                    deleted["series"] = len(series_ids)

            if email:
                user = await conn.fetchrow(
                    "SELECT id FROM users WHERE email = lower($1)",
                    email,
                )
                if user:
                    uid = user["id"]
                    await conn.execute(
                        "DELETE FROM notification_queue WHERE user_id = $1",
                        uid,
                    )
                    await conn.execute("DELETE FROM bookmarks WHERE user_id = $1", uid)
                    await conn.execute("DELETE FROM results WHERE user_id = $1", uid)
                    await conn.execute("DELETE FROM sessions WHERE user_id = $1", uid)
                    await conn.execute("DELETE FROM auth_tokens WHERE user_id = $1", uid)
                    await conn.execute(
                        "UPDATE change_log SET actor_id = NULL WHERE actor_id = $1",
                        uid,
                    )
                    await conn.execute("DELETE FROM users WHERE id = $1", uid)
                    deleted["users"] = 1
        return deleted
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_verify = sub.add_parser("verify-email")
    p_verify.add_argument("--email", required=True)

    p_staff = sub.add_parser("create-staff-user")
    p_staff.add_argument("--email", required=True)
    p_staff.add_argument("--password", required=True)
    p_staff.add_argument("--role", default="editor")
    p_staff.add_argument("--nickname", default=None)

    p_set_pw = sub.add_parser("set-user-password")
    p_set_pw.add_argument("--email", required=True)
    p_set_pw.add_argument("--password", required=True)

    p_queue = sub.add_parser("queue-for-flight")
    p_queue.add_argument("--flight-id", required=True)

    p_series = sub.add_parser("create-published-series")
    p_series.add_argument("--name", required=True)
    p_series.add_argument("--venue-timezone", default="Europe/Moscow")
    p_series.add_argument("--start-at", default=None)

    p_move = sub.add_parser("move-flight")
    p_move.add_argument("--flight-id", required=True)
    p_move.add_argument("--start-at", required=True)

    p_clean = sub.add_parser("cleanup")
    p_clean.add_argument("--email", default=None)
    p_clean.add_argument("--series-prefix", default=None)

    args = parser.parse_args()

    if args.cmd == "verify-email":
        result = asyncio.run(cmd_verify_email(args.email))
    elif args.cmd == "create-staff-user":
        result = asyncio.run(
            cmd_create_staff_user(
                email=args.email,
                password=args.password,
                role=args.role,
                nickname=args.nickname,
            )
        )
    elif args.cmd == "set-user-password":
        result = asyncio.run(
            cmd_set_user_password(email=args.email, password=args.password)
        )
    elif args.cmd == "queue-for-flight":
        result = asyncio.run(cmd_queue_for_flight(args.flight_id))
    elif args.cmd == "create-published-series":
        result = asyncio.run(
            cmd_create_published_series(
                name=args.name,
                venue_timezone=args.venue_timezone,
                start_at=args.start_at,
            )
        )
    elif args.cmd == "move-flight":
        result = asyncio.run(cmd_move_flight(args.flight_id, args.start_at))
    elif args.cmd == "cleanup":
        result = asyncio.run(cmd_cleanup(email=args.email, series_prefix=args.series_prefix))
    else:
        raise SystemExit(f"unknown command: {args.cmd}")

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
