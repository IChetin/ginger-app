"""Day2 worker: Web Push notification dispatch + CBR FX sync."""

from __future__ import annotations

import logging
import signal
import sys
import time
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from worker.config import get_settings
from worker.jobs.fx_rates import process_fx_rates
from worker.jobs.notifications import process_notification_queue

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("day2.worker")


def _cron_trigger(expr: str) -> CronTrigger:
    parts = expr.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {expr!r}")
    minute, hour, day, month, day_of_week = parts
    return CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone="UTC",
    )


def main() -> None:
    settings = get_settings()
    logger.info("starting day2 worker env=%s", settings.app_env)

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        process_notification_queue,
        "interval",
        seconds=settings.notification_job_interval_seconds,
        id="process_notifications",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    cron_kwargs: dict[str, Any] = {
        "id": "sync_fx_rates",
        "max_instances": 1,
        "coalesce": True,
        "replace_existing": True,
    }
    scheduler.add_job(
        process_fx_rates,
        _cron_trigger(settings.fx_job_cron),
        **cron_kwargs,
    )
    scheduler.start()

    def _shutdown(signum: int, _frame: object) -> None:
        logger.info("shutting down (signal=%s)", signum)
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        _shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()
