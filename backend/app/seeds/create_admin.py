"""Создать администратора или повысить существующего — первый вход на пустом проде.

Вход по коду аккаунт не создаёт, а регистрация закрыта приглашениями, поэтому первого
администратора заводим командой на сервере:

    docker compose -f docker-compose.prod.yml run --rm backend \
        python -m app.seeds.create_admin you@example.com ivan

Повторный запуск безопасен: существующему пользователю просто выдаётся роль admin.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.core.email import normalize_email
from app.models.auth import User
from app.models.enums import UserRole


async def create_admin(email: str, nickname: str) -> str:
    normalized = normalize_email(email)
    async with async_session_factory() as session, session.begin():
        user = await session.scalar(select(User).where(User.email == normalized))
        if user is None:
            session.add(
                User(
                    email=normalized,
                    nickname=nickname,
                    role=UserRole.ADMIN,
                    base_currency="RUB",
                    email_verified_at=datetime.now(UTC),
                )
            )
            result = f"создан администратор {normalized}"
        else:
            user.role = UserRole.ADMIN
            result = f"{normalized} теперь администратор"
    await engine.dispose()
    return result


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: python -m app.seeds.create_admin EMAIL NICKNAME", file=sys.stderr)
        raise SystemExit(2)
    print(asyncio.run(create_admin(sys.argv[1], sys.argv[2])))


if __name__ == "__main__":
    main()
