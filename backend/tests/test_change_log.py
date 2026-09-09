from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.enums import ChangeType, EventStatus, SeriesStatus
from app.services import change_log as change_log_service

pytestmark = pytest.mark.unit


def test_json_safe_converts_enums_and_decimals() -> None:
    payload = change_log_service.json_safe(
        {
            "status": SeriesStatus.ANNOUNCED,
            "buyin": Decimal("10000.00"),
            "id": uuid4(),
            "starts_on": date(2026, 8, 1),
            "start_at": datetime(2026, 8, 1, 12, 0, tzinfo=UTC),
        }
    )
    assert payload["status"] == "announced"
    assert payload["buyin"] == "10000.00"
    assert isinstance(payload["id"], str)
    assert payload["starts_on"] == "2026-08-01"
    assert payload["start_at"] == "2026-08-01T12:00:00+00:00"


def test_changed_fields_returns_diff_only() -> None:
    old = {"name": "A", "status": "announced", "buyin": "100.00"}
    new = {"name": "B", "status": "announced", "buyin": "100.00"}
    old_diff, new_diff = change_log_service.changed_fields(old, new)
    assert old_diff == {"name": "A"}
    assert new_diff == {"name": "B"}


def test_changed_fields_no_changes() -> None:
    snapshot = {"name": "Same", "status": "announced"}
    old_diff, new_diff = change_log_service.changed_fields(snapshot, snapshot.copy())
    assert old_diff is None
    assert new_diff is None


@pytest.mark.parametrize(
    ("old_status", "new_status", "expected"),
    [
        (SeriesStatus.ANNOUNCED, SeriesStatus.SCHEDULE_PUBLISHED, ChangeType.SCHEDULE_PUBLISHED),
        (SeriesStatus.ANNOUNCED, SeriesStatus.CANCELLED, ChangeType.CANCELLED),
        (SeriesStatus.SCHEDULE_PUBLISHED, SeriesStatus.RUNNING, ChangeType.UPDATED),
        (SeriesStatus.RUNNING, SeriesStatus.FINISHED, ChangeType.UPDATED),
        (SeriesStatus.FINISHED, SeriesStatus.CANCELLED, ChangeType.CANCELLED),
        (SeriesStatus.ANNOUNCED, SeriesStatus.ANNOUNCED, None),
        (SeriesStatus.ANNOUNCED, SeriesStatus.RUNNING, ChangeType.UPDATED),
    ],
)
def test_resolve_series_change_type(
    old_status: SeriesStatus,
    new_status: SeriesStatus,
    expected: ChangeType | None,
) -> None:
    result = change_log_service.resolve_series_change_type(
        old_status=old_status,
        new_status=new_status,
    )
    assert result == expected


def test_is_series_published() -> None:
    assert change_log_service.is_series_published(SeriesStatus.SCHEDULE_PUBLISHED) is True
    assert change_log_service.is_series_published(SeriesStatus.ANNOUNCED) is False


def test_blind_levels_snapshot_ordering() -> None:
    class Level:
        def __init__(self, level_no: int, structure_set_label: str = "default") -> None:
            self.id = uuid4()
            self.structure_set_label = structure_set_label
            self.level_no = level_no
            self.sb = 100
            self.bb = 200
            self.ante = 200
            self.minutes = 20
            self.is_break = False
            self.is_late_reg_end = False

    snapshot = change_log_service.blind_levels_snapshot(
        [Level(2, "1B"), Level(1, "1A"), Level(2, "1A"), Level(1, "1B")]
    )
    assert [(item["structure_set_label"], item["level_no"]) for item in snapshot] == [
        ("1A", 1),
        ("1A", 2),
        ("1B", 1),
        ("1B", 2),
    ]


def test_event_snapshot_includes_status_value() -> None:
    class EventStub:
        series_id = uuid4()
        number = 1
        name = "Main"
        slug = "1-main"
        buyin = Decimal("5000.00")
        buyin_bounty = None
        currency_code = "RUB"
        guarantee = None
        game_type = "nlh"
        tags: list[str] = []
        start_stack = 30000
        start_blinds = None
        reentry_count = 1
        reentry_unlimited = False
        late_reg_level = 6
        day_end_note = None
        status = EventStatus.SCHEDULED
        notes = None

    snapshot = change_log_service.event_snapshot(EventStub())  # type: ignore[arg-type]
    assert snapshot["status"] == "scheduled"
    assert snapshot["buyin"] == "5000.00"
