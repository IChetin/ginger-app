import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import Settings
from app.services.email.base import EmailSendResult
from app.services.email.templates import (
    build_otp_email,
    build_password_reset_email,
    build_verification_email,
)

logger = logging.getLogger(__name__)


class SmtpEmailProvider:
    name = "smtp"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _use_ssl(self) -> bool:
        if self._settings.smtp_use_ssl:
            return True
        return self._settings.smtp_port == 465

    def _use_starttls(self) -> bool:
        if self._use_ssl():
            return False
        return self._settings.smtp_use_tls

    def _send_message(self, email: str, subject: str, plain: str, html: str) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = (
            f"{self._settings.smtp_from_name} <{self._settings.smtp_from}>"
            if self._settings.smtp_from_name
            else self._settings.smtp_from
        )
        message["To"] = email
        message.set_content(plain)
        message.add_alternative(html, subtype="html")

        context = ssl.create_default_context()
        if self._use_ssl():
            with smtplib.SMTP_SSL(
                self._settings.smtp_host,
                self._settings.smtp_port,
                context=context,
            ) as smtp:
                if self._settings.smtp_user:
                    smtp.login(self._settings.smtp_user, self._settings.smtp_password)
                smtp.send_message(message)
            return

        with smtplib.SMTP(self._settings.smtp_host, self._settings.smtp_port) as smtp:
            if self._use_starttls():
                smtp.starttls(context=context)
            if self._settings.smtp_user:
                smtp.login(self._settings.smtp_user, self._settings.smtp_password)
            smtp.send_message(message)

    def _send_otp_sync(self, email: str, code: str) -> None:
        subject, plain, html = build_otp_email(code=code, settings=self._settings)
        self._send_message(email, subject, plain, html)

    def _send_verification_sync(self, email: str, url: str) -> None:
        subject, plain, html = build_verification_email(url=url, settings=self._settings)
        self._send_message(email, subject, plain, html)

    def _send_reset_sync(self, email: str, url: str) -> None:
        subject, plain, html = build_password_reset_email(url=url, settings=self._settings)
        self._send_message(email, subject, plain, html)

    async def send_code(self, email: str, code: str) -> EmailSendResult:
        await asyncio.to_thread(self._send_otp_sync, email, code)
        logger.info("smtp otp delivered via %s", self.name)
        return EmailSendResult(ok=True, provider=self.name)

    async def send_verification_link(self, email: str, url: str) -> EmailSendResult:
        await asyncio.to_thread(self._send_verification_sync, email, url)
        logger.info("smtp verification delivered via %s", self.name)
        return EmailSendResult(ok=True, provider=self.name)

    async def send_password_reset_link(self, email: str, url: str) -> EmailSendResult:
        await asyncio.to_thread(self._send_reset_sync, email, url)
        logger.info("smtp password reset delivered via %s", self.name)
        return EmailSendResult(ok=True, provider=self.name)
