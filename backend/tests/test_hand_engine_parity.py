"""FE/BE hand-engine parity against shared JSON fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.hands import parse_stored_hand
from app.services.hand_engine import build_timeline, get_state_at_step

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "frontend/src/features/hands/lib/hand-engine/__fixtures__/parity.json"


def _cases() -> list[dict]:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return list(payload["cases"])


def _snapshot(data, step: int) -> dict:
    state = get_state_at_step(data, step)
    return {
        "kind": "deal" if state.is_deal else ("action" if state.last_action else "post"),
        "street": state.street,
        "pot": state.pot,
        "currentBet": state.current_bet,
        "actorSeat": state.actor_seat,
        "heroInvested": state.hero_invested,
    }


@pytest.mark.parametrize("case", _cases(), ids=lambda item: item["id"])
def test_parity_case(case: dict) -> None:
    data = parse_stored_hand(case["data"])
    timeline = build_timeline(data)
    last = _snapshot(data, len(timeline) - 1)
    mismatch = case.get("expectMismatch")

    if case["id"] == "fold-win":
        assert last["pot"] == 1500
        assert last["heroInvested"] == 500
    elif case["id"] == "dead-button":
        posted = _snapshot(data, 0)
        assert posted["pot"] == 5000
        assert posted["currentBet"] == 2000
    elif case["id"] == "heads-up":
        posted = _snapshot(data, 0)
        assert posted["pot"] == 1500
        assert posted["actorSeat"] == 1
    elif case["id"] == "uncalled-raise":
        assert last["pot"] == 2000
        assert last["heroInvested"] == 1000
    elif case["id"] == "allin-uncalled":
        flop = next(
            i
            for i, item in enumerate(timeline)
            if item.kind == "deal" and item.street == "flop"
        )
        state = _snapshot(data, flop)
        assert state["pot"] == 160_000
    elif case["id"] == "sample-9max-table-ante":
        assert last["pot"] == 114_000
        assert last["heroInvested"] == 48_500
    elif case["id"] == "bb-ante-raise":
        assert last["pot"] == 15_000
