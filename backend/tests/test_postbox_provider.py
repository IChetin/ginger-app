import json
from datetime import UTC, datetime

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.email.factory import UnconfiguredEmailProvider, get_email_provider
from app.services.email.postbox import PostboxEmailProvider, sigv4_authorization


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "_env_file": None,
        "email_provider": "postbox",
        "smtp_from": "noreply@lisa52.com",
        "smtp_from_name": "Ginger",
        "postbox_access_key_id": "KEYID",
        "postbox_secret_access_key": "SECRET",
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def test_sigv4_matches_independent_implementation() -> None:
    # Эталон снят с curl 8.21 (--aws-sigv4 "aws:amz:ru-central1:ses") на том же запросе.
    authorization = sigv4_authorization(
        method="POST",
        path="/v2/email/outbound-emails",
        query="",
        headers={
            "content-type": "application/json",
            "host": "127.0.0.1:8765",
            "x-amz-date": "20260914T093000Z",
        },
        payload=b'{"a":1}',
        access_key_id="KEYID",
        secret_access_key="SECRETKEY",
        region="ru-central1",
        service="ses",
        amz_date="20260914T093000Z",
    )
    assert authorization == (
        "AWS4-HMAC-SHA256 Credential=KEYID/20260914/ru-central1/ses/aws4_request, "
        "SignedHeaders=content-type;host;x-amz-date, "
        "Signature=03c498bd9de32fd47e41888cbcb3c12c5cfcb4d4e248572ec4adb535cebca2ef"
    )


async def test_sends_signed_send_email_request() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"MessageId": "m-1"})

    provider = PostboxEmailProvider(
        _settings(),
        transport=httpx.MockTransport(handler),
        now=datetime(2026, 9, 14, 9, 30, tzinfo=UTC),
    )
    result = await provider.send_code("player@example.com", "123456")

    assert result.ok and result.provider == "postbox"
    (request,) = captured
    assert str(request.url) == "https://postbox.cloud.yandex.net/v2/email/outbound-emails"
    assert request.headers["x-amz-date"] == "20260914T093000Z"
    assert request.headers["authorization"].startswith(
        "AWS4-HMAC-SHA256 Credential=KEYID/20260914/ru-central1/ses/aws4_request, "
        "SignedHeaders=content-type;host;x-amz-date, Signature="
    )
    body = json.loads(request.content)
    assert body["FromEmailAddress"] == "Ginger <noreply@lisa52.com>"
    assert body["Destination"] == {"ToAddresses": ["player@example.com"]}
    simple = body["Content"]["Simple"]
    assert "123456" in simple["Body"]["Text"]["Data"]
    assert simple["Subject"]["Charset"] == "UTF-8"


async def test_rejected_request_returns_503() -> None:
    provider = PostboxEmailProvider(
        _settings(),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(403, json={"message": "identity not verified"})
        ),
    )
    with pytest.raises(AppError) as error:
        await provider.send_code("player@example.com", "123456")
    assert error.value.status_code == 503
    assert error.value.code == "email_unavailable"


def test_factory_uses_postbox_only_when_configured() -> None:
    assert isinstance(get_email_provider(_settings()), PostboxEmailProvider)
    assert isinstance(
        get_email_provider(_settings(postbox_secret_access_key="")), UnconfiguredEmailProvider
    )
    assert isinstance(get_email_provider(_settings(smtp_from="")), UnconfiguredEmailProvider)
