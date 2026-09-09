from __future__ import annotations

from app.schemas.hands import HandData
from app.seeds.demo_hands import DEMO_HANDS
from app.services.hand_engine import build_timeline, get_state_at_step


def test_demo_hand_documents_validate_and_replay() -> None:
    assert len(DEMO_HANDS) == 3
    for spec in DEMO_HANDS:
        data = HandData.model_validate(spec["data"])
        timeline = build_timeline(data)
        final = get_state_at_step(data, len(timeline) - 1)
        assert timeline[0].kind == "post"
        assert final.pot == data.result.pot
        assert spec["slug"].startswith("demo-")
        assert spec["note"].endswith("?")
