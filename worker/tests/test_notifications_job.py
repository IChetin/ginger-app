from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

from worker.config import Settings
from worker.db.models import NotificationQueue, NotificationStatus, PushSubscription
from worker.jobs.notifications import process_notification_queue_with_sender
from worker.push.client import PushOutcome, PushSendResult


class _FakeSession:
    def __init__(
        self,
        notifications: list[NotificationQueue],
        subs: list[PushSubscription],
    ) -> None:
        self.notifications = {row.id: row for row in notifications}
        self.subs = list(subs)
        self.deleted: list[object] = []

    def get(self, _model: type[Any], key: uuid.UUID) -> NotificationQueue | None:
        return self.notifications.get(key)

    def scalars(self, _stmt: object) -> list[PushSubscription]:
        return list(self.subs)

    def delete(self, obj: object) -> None:
        self.deleted.append(obj)
        if isinstance(obj, PushSubscription) and obj in self.subs:
            self.subs.remove(obj)


def _notification(*, attempts: int = 0) -> NotificationQueue:
    return NotificationQueue(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        type="reminder",
        payload={"title": "T", "body": "B", "url": "/events/1", "type": "reminder"},
        scheduled_at=datetime.now(UTC) - timedelta(minutes=1),
        status=NotificationStatus.PENDING,
        attempts=attempts,
    )


def _sub(user_id: uuid.UUID) -> PushSubscription:
    return PushSubscription(
        id=uuid.uuid4(),
        user_id=user_id,
        endpoint="https://push.example/1",
        p256dh="p",
        auth="a",
    )


def test_success_marks_sent() -> None:
    note = _notification()
    sub = _sub(note.user_id)
    session = _FakeSession([note], [sub])
    settings = Settings(vapid_private_key="x", notification_batch_size=10)

    def sender(_sub: PushSubscription, _payload: object, _settings: Settings) -> PushSendResult:
        return PushSendResult(outcome=PushOutcome.SUCCESS, status_code=201)

    with patch(
        "worker.jobs.notifications._claim_due_ids",
        return_value=[note.id],
    ):
        count = process_notification_queue_with_sender(session, settings=settings, sender=sender)
    assert count == 1
    assert note.status == NotificationStatus.SENT
    assert note.sent_at is not None


def test_gone_deletes_subscription_and_fails_without_success() -> None:
    note = _notification()
    sub = _sub(note.user_id)
    session = _FakeSession([note], [sub])
    settings = Settings(vapid_private_key="x", notification_batch_size=10)

    def sender(_sub: PushSubscription, _payload: object, _settings: Settings) -> PushSendResult:
        return PushSendResult(outcome=PushOutcome.GONE, status_code=410)

    with patch(
        "worker.jobs.notifications._claim_due_ids",
        return_value=[note.id],
    ):
        process_notification_queue_with_sender(session, settings=settings, sender=sender)
    assert sub in session.deleted
    assert note.status == NotificationStatus.FAILED
    assert note.attempts == 1


def test_retryable_increments_attempts() -> None:
    note = _notification(attempts=0)
    sub = _sub(note.user_id)
    session = _FakeSession([note], [sub])
    settings = Settings(vapid_private_key="x", notification_batch_size=10)

    def sender(_sub: PushSubscription, _payload: object, _settings: Settings) -> PushSendResult:
        return PushSendResult(outcome=PushOutcome.RETRYABLE, status_code=503, error="push_failed")

    with patch(
        "worker.jobs.notifications._claim_due_ids",
        return_value=[note.id],
    ):
        process_notification_queue_with_sender(session, settings=settings, sender=sender)
        assert note.status == NotificationStatus.PENDING
        assert note.attempts == 1

        process_notification_queue_with_sender(session, settings=settings, sender=sender)
        process_notification_queue_with_sender(session, settings=settings, sender=sender)
    assert note.status == NotificationStatus.FAILED
    assert note.attempts == 3


def test_no_subscriptions_fail_fast() -> None:
    note = _notification()
    session = _FakeSession([note], [])
    settings = Settings(vapid_private_key="x", notification_batch_size=10)

    def sender(_sub: PushSubscription, _payload: object, _settings: Settings) -> PushSendResult:
        raise AssertionError("should not send")

    with patch(
        "worker.jobs.notifications._claim_due_ids",
        return_value=[note.id],
    ):
        process_notification_queue_with_sender(session, settings=settings, sender=sender)
    assert note.status == NotificationStatus.FAILED
    assert note.last_error == "no_subscriptions"


def test_claim_due_ids_sql_filters_by_scheduled_at() -> None:
    """_claim_due_ids must select only pending rows with scheduled_at <= NOW()."""
    from unittest.mock import MagicMock

    from worker.jobs.notifications import _claim_due_ids

    due_id = uuid.uuid4()
    session = MagicMock()
    session.execute.return_value.fetchall.return_value = [(due_id,)]

    result = _claim_due_ids(session, batch_size=5)
    assert result == [due_id]

    call_args = session.execute.call_args
    sql = str(call_args.args[0])
    assert "scheduled_at <= NOW()" in sql
    assert "status = 'pending'" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    params = call_args.args[1] if len(call_args.args) > 1 else call_args.kwargs
    assert params["batch_size"] == 5
