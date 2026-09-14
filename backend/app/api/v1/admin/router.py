from fastapi import APIRouter, Depends

from app.api.v1.admin import chips, clubs, crm, references, users, wins
from app.api.v1.admin import threads as admin_threads
from app.core.deps import require_editor

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_editor)],
)
router.include_router(references.router)
router.include_router(clubs.router)
router.include_router(chips.router)
router.include_router(admin_threads.router)
router.include_router(users.router)
router.include_router(wins.router)
router.include_router(crm.router)
