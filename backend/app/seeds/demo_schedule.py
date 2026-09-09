"""Backward-compatible re-exports for sample schedule seeds."""

from app.seeds.sample_schedules import (
    DEMO_EVENT_MAIN_ID,
    DEMO_SERIES_ID,
    SAMPLE_APC_SERIES_ID,
    SAMPLE_RPF_SERIES_ID,
    SAMPLE_RPT_SERIES_ID,
    seed_demo_schedule,
    seed_sample_schedules,
)

__all__ = [
    "DEMO_EVENT_MAIN_ID",
    "DEMO_SERIES_ID",
    "SAMPLE_APC_SERIES_ID",
    "SAMPLE_RPF_SERIES_ID",
    "SAMPLE_RPT_SERIES_ID",
    "seed_demo_schedule",
    "seed_sample_schedules",
]
