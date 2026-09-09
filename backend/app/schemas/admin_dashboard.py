"""Admin operational dashboard DTOs."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ChangeType


class DashboardAlertItem(BaseModel):
    id: UUID
    label: str
    series_id: UUID | None = None


class DashboardAlertCount(BaseModel):
    count: int
    items: list[DashboardAlertItem] = Field(default_factory=list)


class DashboardPushFailedAlert(BaseModel):
    count: int


class DashboardAttention(BaseModel):
    imports_review: DashboardAlertCount
    series_without_schedule: DashboardAlertCount
    push_failed_24h: DashboardPushFailedAlert
    stale_series: DashboardAlertCount


class KpiActiveSeries(BaseModel):
    value: int
    running_now: int


class KpiEventsWeek(BaseModel):
    value: int
    series_count: int


class KpiWithDelta(BaseModel):
    value: int
    delta_7d: int


class KpiPush24h(BaseModel):
    sent: int
    failed: int


class DashboardKpis(BaseModel):
    active_series: KpiActiveSeries
    events_next_7d: KpiEventsWeek
    users: KpiWithDelta
    bookmarks: KpiWithDelta
    push_24h: KpiPush24h


class DashboardUpcomingItem(BaseModel):
    kind: str  # flight | series
    start_at: datetime
    local_time: str | None = None
    title: str
    subtitle: str
    event_id: UUID | None = None
    series_id: UUID
    subscribers: int


class DashboardRecentChange(BaseModel):
    id: UUID
    change_type: ChangeType
    via_import: bool = False
    title: str
    detail: str | None = None
    created_at: datetime
    series_id: UUID | None = None
    event_id: UUID | None = None


class DashboardNav(BaseModel):
    imports_review_count: int


class AdminDashboardResponse(BaseModel):
    generated_at: datetime
    attention: DashboardAttention
    kpis: DashboardKpis
    upcoming: list[DashboardUpcomingItem]
    recent_changes: list[DashboardRecentChange]
    nav: DashboardNav
