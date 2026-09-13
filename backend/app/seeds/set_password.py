"""Задать пароль пользователю прямо на сервере — вход, пока не подключена почта.

Пароль вводится в терминале и не отображается; в историю команд и в логи не попадает.
Запускать с TTY (-t у ssh и -it у docker), иначе ввести пароль будет некуда:

    ssh -t ginger 'cd /opt/ginger/app && docker compose -f docker-compose.prod.yml run --rm -it \
        backend python -m app.seeds.set_password you@example.com'
"""

from __future__ import annotations

import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.core.email import normalize_email
from app.core.security import hash_password
from app.models.auth import User


def _ask_password() -> str:
    settings = get_settings()
    first = getpass.getpass("Новый пароль: ")
    if not settings.password_min_length <= len(first) <= settings.password_max_length:
        raise SystemExit(
            f"Пароль должен быть от {settings.password_min_length} "
            f"до {settings.password_max_length} символов"
        )
    if getpass.getpass("Повторите пароль: ") != first:
        raise SystemExit("Пароли не совпали")
    return first


async def set_password(email: str, password: str) -> str:
    normalized = normalize_email(email)
    async with async_session_factory() as session, session.begin():
        user = await session.scalar(select(User).where(User.email == normalized))
        if user is None:
            raise SystemExit(f"Пользователь {normalized} не найден")
        user.password_hash = hash_password(password)
    await engine.dispose()
    return f"пароль для {normalized} задан"


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python -m app.seeds.set_password EMAIL", file=sys.stderr)
        raise SystemExit(2)
    if not sys.stdin.isatty():
        raise SystemExit("Нужен интерактивный терминал: запустите с ssh -t и docker run -it")
    print(asyncio.run(set_password(sys.argv[1], _ask_password())))


if __name__ == "__main__":
    main()
