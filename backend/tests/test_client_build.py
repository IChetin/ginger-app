import pytest
from httpx import AsyncClient

from app.core.config import get_settings


async def test_outdated_client_build_gets_426(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "min_client_build", "20260915120000")

    outdated = await client.get("/api/v1/clubs", headers={"X-Client-Build": "20260901000000"})
    assert outdated.status_code == 426
    assert outdated.json()["error"]["code"] == "client_outdated"

    fresh = await client.get("/api/v1/clubs", headers={"X-Client-Build": "20260915130000"})
    assert fresh.status_code == 200

    # Без заголовка — старые клиенты и скрипты — не трогаем; здоровье сервиса — всегда.
    assert (await client.get("/api/v1/clubs")).status_code == 200
    health = await client.get("/api/v1/health", headers={"X-Client-Build": "20260101000000"})
    assert health.status_code == 200


async def test_check_disabled_without_minimum(client: AsyncClient) -> None:
    response = await client.get("/api/v1/clubs", headers={"X-Client-Build": "1"})
    assert response.status_code == 200
