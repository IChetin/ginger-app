from fastapi import APIRouter

from app.api.v1 import (
    auth,
    bookmarks,
    clubs,
    currencies,
    health,
    media,
    notifications,
    push,
    schedule,
    search,
)
from app.api.v1.admin.router import router as admin_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(schedule.router)
api_router.include_router(search.router)
api_router.include_router(bookmarks.router)
api_router.include_router(notifications.router)
api_router.include_router(push.router)
api_router.include_router(currencies.router)
api_router.include_router(clubs.router)
api_router.include_router(media.router)
api_router.include_router(admin_router)
