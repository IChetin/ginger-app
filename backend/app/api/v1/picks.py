from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.picks import EditorPickRead, PickKind
from app.services import picks as picks_service

router = APIRouter(tags=["picks"])


@router.get("/editor-picks", response_model=list[EditorPickRead])
async def get_editor_picks(
    db: Annotated[AsyncSession, Depends(get_db)],
    kind: Annotated[PickKind, Query()],
) -> list[EditorPickRead]:
    """Editor's Pick для плашки MTT или CASH. Пики, под которые сейчас ничего нет, не отдаём."""
    return await picks_service.list_public_picks(db, kind=kind, now=datetime.now(UTC))
