"""Письма через Yandex Cloud Postbox по HTTPS (API, совместимый с Amazon SES v2).

SMTP-порты с сервера закрыты хостером, а обычный HTTPS (443) открыт — поэтому отправка идёт
запросом SendEmail, подписанным AWS Signature Version 4 статическим ключом сервисного
аккаунта с ролью postbox.sender. Адрес отправителя должен быть на домене, подтверждённом
в Postbox записями DKIM.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from email.utils import formataddr
from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.email.base import EmailSendResult
from app.services.email.templates import (
    build_otp_email,
    build_password_reset_email,
    build_verification_email,
)

logger = logging.getLogger(__name__)

SEND_EMAIL_PATH = "/v2/email/outbound-emails"
SIGNING_SERVICE = "ses"
REQUEST_TIMEOUT_SECONDS = 15


def _hmac_sha256(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def sigv4_authorization(
    *,
    method: str,
    path: str,
    query: str,
    headers: dict[str, str],
    payload: bytes,
    access_key_id: str,
    secret_access_key: str,
    region: str,
    service: str,
    amz_date: str,
) -> str:
    """Заголовок Authorization по AWS Signature Version 4.

    `headers` — все подписываемые заголовки, включая host и x-amz-date; `amz_date` —
    время в формате 20260914T093000Z.
    """
    items = sorted(
        (name.lower().strip(), " ".join(value.split())) for name, value in headers.items()
    )
    canonical_headers = "".join(f"{name}:{value}\n" for name, value in items)
    signed_headers = ";".join(name for name, _ in items)
    canonical_request = "\n".join(
        [
            method,
            path,
            query,
            canonical_headers,
            signed_headers,
            hashlib.sha256(payload).hexdigest(),
        ]
    )
    date = amz_date[:8]
    scope = f"{date}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _hmac_sha256(
        _hmac_sha256(
            _hmac_sha256(_hmac_sha256(f"AWS4{secret_access_key}".encode(), date), region),
            service,
        ),
        "aws4_request",
    )
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return (
        f"AWS4-HMAC-SHA256 Credential={access_key_id}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )


class PostboxEmailProvider:
    name = "postbox"

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        now: datetime | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._now = now

    def _sender(self) -> str:
        name = self._settings.smtp_from_name
        address = self._settings.smtp_from
        return formataddr((name, address), charset="utf-8") if name else address

    async def _send(
        self, email: str, subject: str, plain: str, html: str, kind: str
    ) -> EmailSendResult:
        body = json.dumps(
            {
                "FromEmailAddress": self._sender(),
                "Destination": {"ToAddresses": [email]},
                "Content": {
                    "Simple": {
                        "Subject": {"Data": subject, "Charset": "UTF-8"},
                        "Body": {
                            "Text": {"Data": plain, "Charset": "UTF-8"},
                            "Html": {"Data": html, "Charset": "UTF-8"},
                        },
                    }
                },
            },
            ensure_ascii=False,
        ).encode("utf-8")
        url = self._settings.postbox_endpoint.rstrip("/") + SEND_EMAIL_PATH
        amz_date = (self._now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")
        headers = {
            "content-type": "application/json",
            "host": urlparse(url).netloc,
            "x-amz-date": amz_date,
        }
        authorization = sigv4_authorization(
            method="POST",
            path=SEND_EMAIL_PATH,
            query="",
            headers=headers,
            payload=body,
            access_key_id=self._settings.postbox_access_key_id,
            secret_access_key=self._settings.postbox_secret_access_key,
            region=self._settings.postbox_region,
            service=SIGNING_SERVICE,
            amz_date=amz_date,
        )
        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                response = await client.post(
                    url, content=body, headers={**headers, "authorization": authorization}
                )
        except httpx.HTTPError as error:
            logger.error("postbox %s failed: %s", kind, error)
            raise AppError(
                code="email_unavailable",
                message="Не удалось отправить письмо. Попробуйте позже",
                status_code=503,
            ) from error
        if response.status_code >= 300:
            # Текст ошибки Postbox не содержит секретов, но помогает понять причину: ключ,
            # неподтверждённый домен, лимиты песочницы.
            logger.error(
                "postbox %s rejected: HTTP %s %s", kind, response.status_code, response.text[:300]
            )
            raise AppError(
                code="email_unavailable",
                message="Не удалось отправить письмо. Попробуйте позже",
                status_code=503,
            )
        logger.info("postbox %s delivered", kind)
        return EmailSendResult(ok=True, provider=self.name)

    async def send_code(self, email: str, code: str) -> EmailSendResult:
        subject, plain, html = build_otp_email(code=code, settings=self._settings)
        return await self._send(email, subject, plain, html, "otp")

    async def send_verification_link(self, email: str, url: str) -> EmailSendResult:
        subject, plain, html = build_verification_email(url=url, settings=self._settings)
        return await self._send(email, subject, plain, html, "verification")

    async def send_password_reset_link(self, email: str, url: str) -> EmailSendResult:
        subject, plain, html = build_password_reset_email(url=url, settings=self._settings)
        return await self._send(email, subject, plain, html, "password reset")
