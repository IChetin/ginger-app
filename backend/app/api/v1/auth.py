from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import clear_session_cookie, set_session_cookie
from app.core.database import get_db
from app.core.deps import get_current_user, get_session_id_from_request
from app.core.exceptions import UnauthorizedError
from app.models.auth import User
from app.schemas.auth import (
    ChangePasswordBody,
    LoginPasswordBody,
    RegisterCompleteBody,
    RegisterStartBody,
    RegisterVerifyBody,
    RegisterVerifyResponse,
    RequestCodeBody,
    RequestCodeResponse,
    SetPasswordBody,
    UpdateMeBody,
    UserMe,
    VerifyCodeBody,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"


@router.post("/request-code", response_model=RequestCodeResponse)
async def request_code(
    body: RequestCodeBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RequestCodeResponse:
    result = await auth_service.request_otp(
        db,
        email=body.email,
        client_ip=_client_ip(request),
        captcha_token=body.captcha_token,
    )
    return RequestCodeResponse(
        expires_in_seconds=result.expires_in_seconds,
        retry_after=result.retry_after,
    )


@router.post("/verify", response_model=UserMe)
async def verify_code(
    body: VerifyCodeBody,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    auth_session, user = await auth_service.verify_otp(
        db,
        email=body.email,
        code=body.code,
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, str(auth_session.id))
    return auth_service.user_to_me(user)


@router.post("/register/start", response_model=RequestCodeResponse)
async def register_start(
    body: RegisterStartBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RequestCodeResponse:
    result = await auth_service.register_start(
        db,
        email=body.email,
        client_ip=_client_ip(request),
        captcha_token=body.captcha_token,
    )
    return RequestCodeResponse(
        expires_in_seconds=result.expires_in_seconds,
        retry_after=result.retry_after,
    )


@router.post("/register/verify", response_model=RegisterVerifyResponse)
async def register_verify(
    body: RegisterVerifyBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegisterVerifyResponse:
    result = await auth_service.register_verify(
        db,
        email=body.email,
        code=body.code,
        client_ip=_client_ip(request),
    )
    return RegisterVerifyResponse(
        registration_token=result.registration_token,
        expires_in_seconds=result.expires_in_seconds,
    )


@router.post("/register/complete", response_model=UserMe)
async def register_complete(
    body: RegisterCompleteBody,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    auth_session, user = await auth_service.register_complete(
        db,
        registration_token=body.registration_token,
        password=body.password,
        nickname=body.nickname,
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, str(auth_session.id))
    return auth_service.user_to_me(user)


@router.post("/login", response_model=UserMe)
async def login_password(
    body: LoginPasswordBody,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    auth_session, user = await auth_service.login_with_password(
        db,
        email=body.email,
        password=body.password,
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, str(auth_session.id))
    return auth_service.user_to_me(user)


@router.post("/set-password", response_model=UserMe)
async def set_password(
    body: SetPasswordBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    updated = await auth_service.set_password(db, user, password=body.password)
    return auth_service.user_to_me(updated)


@router.post("/change-password", response_model=UserMe)
async def change_password(
    body: ChangePasswordBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    updated = await auth_service.change_password(
        db,
        user,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return auth_service.user_to_me(updated)


@router.get("/me", response_model=UserMe)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserMe:
    return auth_service.user_to_me(user)


@router.patch("/me", response_model=UserMe)
async def patch_me(
    body: UpdateMeBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMe:
    updated = await auth_service.update_profile(db, user, body)
    return auth_service.user_to_me(updated)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    session_id = get_session_id_from_request(request)
    if session_id is None:
        raise UnauthorizedError("Authentication required")
    await auth_service.logout_session(db, session_id)
    clear_session_cookie(response)
    return {"ok": True}
