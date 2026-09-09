class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        *,
        retry_after: int | None = None,
        attempts_left: int | None = None,
        active_session_id: str | None = None,
        result_id: str | None = None,
        server: dict | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after
        self.attempts_left = attempts_left
        self.active_session_id = active_session_id
        self.result_id = result_id
        self.server = server
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(code="not_found", message=message, status_code=404)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(code="unauthorized", message=message, status_code=401)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(code="forbidden", message=message, status_code=403)


class ConflictError(AppError):
    def __init__(
        self,
        message: str = "Conflict",
        *,
        active_session_id: str | None = None,
        result_id: str | None = None,
        server: dict | None = None,
        code: str = "conflict",
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=409,
            active_session_id=active_session_id,
            result_id=result_id,
            server=server,
        )


class RateLimitError(AppError):
    def __init__(
        self,
        message: str = "Too many requests",
        *,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(
            code="rate_limited",
            message=message,
            status_code=429,
            retry_after=retry_after,
        )


class OtpInvalidError(AppError):
    def __init__(self, message: str = "Неверный код", *, attempts_left: int) -> None:
        super().__init__(
            code="otp_invalid",
            message=message,
            status_code=401,
            attempts_left=attempts_left,
        )


class OtpExpiredError(AppError):
    def __init__(self, message: str = "Код истёк") -> None:
        super().__init__(code="otp_expired", message=message, status_code=401)


class EmailNotVerifiedError(AppError):
    def __init__(self, message: str = "Подтвердите email по ссылке из письма") -> None:
        super().__init__(code="email_not_verified", message=message, status_code=403)


class InvalidCredentialsError(AppError):
    def __init__(self, message: str = "Неверный email или пароль") -> None:
        super().__init__(code="invalid_credentials", message=message, status_code=401)


class AccountNotFoundError(AppError):
    def __init__(
        self,
        message: str = "Аккаунт с таким email не найден. Зарегистрируйтесь",
    ) -> None:
        super().__init__(code="account_not_found", message=message, status_code=404)


class AccountExistsError(AppError):
    def __init__(
        self,
        message: str = "Аккаунт с таким email уже есть. Войдите",
    ) -> None:
        super().__init__(code="account_exists", message=message, status_code=409)


class InvalidTokenError(AppError):
    def __init__(self, message: str = "Ссылка истекла или уже использована") -> None:
        super().__init__(code="invalid_token", message=message, status_code=401)


class CaptchaRequiredError(AppError):
    def __init__(self, message: str = "Подтвердите, что вы не робот") -> None:
        super().__init__(code="captcha_required", message=message, status_code=400)
