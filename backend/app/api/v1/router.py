from fastapi import APIRouter

from app.api.v1 import (
    auth,
    bookmarks,
    hands,
    health,
    live,
    media,
    notifications,
    push,
    results,
    schedule,
    search,
    stats,
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
api_router.include_router(results.router)
api_router.include_router(stats.router)
api_router.include_router(live.router)
api_router.include_router(hands.router)
api_router.include_router(media.router)
api_router.include_router(admin_router)
