from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class EmailSendResult:
    ok: bool
    provider: str


class EmailProvider(Protocol):
    name: str

    async def send_code(self, email: str, code: str) -> EmailSendResult: ...

    async def send_verification_link(self, email: str, url: str) -> EmailSendResult: ...

    async def send_password_reset_link(self, email: str, url: str) -> EmailSendResult: ...
