from fastapi import APIRouter, Depends

from app.api.v1.admin import (
    bulk_import,
    change_log,
    chips,
    clubs,
    dashboard,
    events,
    imports,
    references,
    series,
    users,
)
from app.api.v1.admin import threads as admin_threads
from app.core.deps import require_editor

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_editor)],
)
router.include_router(dashboard.router)
router.include_router(references.router)
router.include_router(clubs.router)
router.include_router(chips.router)
router.include_router(admin_threads.router)
router.include_router(series.router)
router.include_router(events.router)
# До imports: иначе «/import/bulk» съест маршрут «/import/{job_id}».
router.include_router(bulk_import.router)
router.include_router(imports.router)
router.include_router(users.router)
router.include_router(change_log.router)
