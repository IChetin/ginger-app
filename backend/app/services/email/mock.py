import logging

from app.core.security import mask_email
from app.services.email.base import EmailSendResult

logger = logging.getLogger(__name__)


class MockEmailProvider:
    name = "mock"

    async def send_code(self, email: str, code: str) -> EmailSendResult:
        logger.info("mock otp delivered to %s code=%s", mask_email(email), code)
        return EmailSendResult(ok=True, provider=self.name)

    async def send_verification_link(self, email: str, url: str) -> EmailSendResult:
        logger.info("mock verification link to %s url=%s", mask_email(email), url)
        return EmailSendResult(ok=True, provider=self.name)

    async def send_password_reset_link(self, email: str, url: str) -> EmailSendResult:
        logger.info("mock password reset link to %s url=%s", mask_email(email), url)
        return EmailSendResult(ok=True, provider=self.name)
