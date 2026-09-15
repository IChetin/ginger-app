from fastapi import APIRouter

from app.api.v1 import (
    auth,
    cash,
    chips,
    clubs,
    collector,
    feed,
    health,
    notifications,
    push,
    threads,
)
from app.api.v1.admin.router import router as admin_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(notifications.router)
api_router.include_router(push.router)
api_router.include_router(clubs.router)
api_router.include_router(cash.router)
api_router.include_router(collector.router)
api_router.include_router(feed.router)
api_router.include_router(chips.router)
api_router.include_router(threads.router)
api_router.include_router(admin_router)
