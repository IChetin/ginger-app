"""Unit tests for hand JSON validation and get_state_at_step (no DB)."""

from __future__ import annotations

import copy

import pytest
from pydantic import ValidationError

from app.schemas.hands import HandData, parse_stored_hand
from app.services.hand_engine import build_timeline, get_state_at_step, min_aggressive_to

SAMPLE_HAND: dict[str, object] = {
    "schema_version": 1,
    "table_size": 9,
    "blinds": {"sb": 1000, "bb": 2000, "ante": 2000},
    "hero_seat": 1,
    "button_seat": 1,
    "seats": [
        {
            "seat": 1,
            "position": "BTN",
            "name": "Вы",
            "stack": 86000,
            "is_hero": True,
            "cards": ["As", "Kc"],
        },
        {"seat": 2, "position": "SB", "name": "Игрок 2", "stack": 42000},
        {"seat": 3, "position": "BB", "name": "Игрок 3", "stack": 31000},
        {
            "seat": 7,
            "position": "CO",
            "name": "Игрок 7",
            "stack": 128000,
            "cards": ["Qh", "Jh"],
        },
    ],
    "streets": [
        {
            "street": "preflop",
            "board": [],
            "actions": [
                {"seat": 7, "action": "raise", "amount": 6000},
                {"seat": 1, "action": "call", "amount": 6000},
                {"seat": 2, "action": "fold"},
                {"seat": 3, "action": "fold"},
            ],
        },
        {
            "street": "flop",
            "board": ["Ks", "9h", "4d"],
            "actions": [
                {"seat": 7, "action": "bet", "amount": 18000},
                {"seat": 1, "action": "call", "amount": 18000},
            ],
        },
        {
            "street": "turn",
            "board": ["Ks", "9h", "4d", "7d"],
            "actions": [
                {"seat": 7, "action": "check"},
                {"seat": 1, "action": "bet", "amount": 22500},
                {"seat": 7, "action": "call", "amount": 22500},
            ],
        },
        {
            "street": "river",
            "board": ["Ks", "9h", "4d", "7d", "2c"],
            "actions": [
                {"seat": 7, "action": "check"},
                {"seat": 1, "action": "check"},
            ],
        },
    ],
    "result": {
        "winner_seats": [1],
        "pot": 114000,
        "hero_invested": 48500,
        "hero_profit": 65500,
        "side_pots": None,
    },
}

FOLD_PREFLOP: dict[str, object] = {
    "schema_version": 1,
    "table_size": 6,
    "blinds": {"sb": 500, "bb": 1000, "ante": 0},
    "hero_seat": 1,
    "button_seat": 1,
    "seats": [
        {
            "seat": 1,
            "position": "BTN",
            "name": "Вы",
            "stack": 50000,
            "is_hero": True,
            "cards": ["Ah", "Ad"],
        },
        {"seat": 2, "position": "SB", "name": "Игрок 2", "stack": 40000},
        {"seat": 3, "position": "BB", "name": "Игрок 3", "stack": 40000},
    ],
    "streets": [
        {
            "street": "preflop",
            "board": [],
            "actions": [
                {"seat": 1, "action": "raise", "amount": 2500},
                {"seat": 2, "action": "fold"},
                {"seat": 3, "action": "fold"},
            ],
        },
    ],
    "result": {
        "winner_seats": [1],
        "pot": 4000,
        "hero_invested": 2500,
        "hero_profit": 1500,
        "side_pots": None,
    },
}


def test_sample_hand_validates() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    timeline = build_timeline(data)
    assert timeline[0].kind == "post"
    final = get_state_at_step(data, len(timeline) - 1)
    assert final.pot == 114000
    assert final.hero_invested == 48500
    assert final.board == ("Ks", "9h", "4d", "7d", "2c")
    assert final.actor_seat is None


def test_hero_name_is_always_you_and_seat_name_is_capped() -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["seats"][0]["name"] = "Не я"  # type: ignore[index]
    payload["seats"][1]["name"] = "Рег из Минска"  # type: ignore[index]
    data = HandData.model_validate(payload)
    assert data.seats[0].name == "Вы"
    assert data.seats[1].name == "Рег из Минска"
    too_long = copy.deepcopy(SAMPLE_HAND)
    too_long["seats"][1]["name"] = "Этот ник явно длиннее шестнадцати"  # type: ignore[index]
    with pytest.raises(ValidationError):
        HandData.model_validate(too_long)


def test_state_is_deterministic() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    timeline = build_timeline(data)
    for step in range(len(timeline)):
        a = get_state_at_step(data, step)
        b = get_state_at_step(data, step)
        assert a.pot == b.pot
        assert a.board == b.board
        assert a.current_bet == b.current_bet
        assert [(s.seat, s.stack, s.folded, s.committed) for s in a.seats] == [
            (s.seat, s.stack, s.folded, s.committed) for s in b.seats
        ]


def test_rewind_matches_forward() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    later = get_state_at_step(data, 8)
    mid = get_state_at_step(data, 3)
    again = get_state_at_step(data, 3)
    assert again.pot == mid.pot
    assert later.pot >= mid.pot


def test_duplicate_cards_rejected() -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["seats"][3]["cards"] = ["As", "Qh"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        HandData.model_validate(payload)


def test_wrong_action_order_rejected() -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["streets"][0]["actions"][0] = {  # type: ignore[index]
        "seat": 1,
        "action": "raise",
        "amount": 6000,
    }
    with pytest.raises(ValidationError):
        HandData.model_validate(payload)


def test_fold_preflop_has_no_board() -> None:
    data = HandData.model_validate(FOLD_PREFLOP)
    timeline = build_timeline(data)
    assert all(item.kind != "deal" for item in timeline)
    final = get_state_at_step(data, len(timeline) - 1)
    assert final.board == ()
    assert final.pot == 4000


def test_allin_preflop_runout() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 6,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 20000,
                "is_hero": True,
                "cards": ["As", "Ad"],
            },
            {
                "seat": 3,
                "position": "BB",
                "name": "Игрок 3",
                "stack": 20000,
                "cards": ["Kh", "Kd"],
            },
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 1, "action": "raise", "amount": 20000},
                    {"seat": 3, "action": "allin", "amount": 20000},
                ],
            },
            {"street": "flop", "board": ["2c", "7d", "9h"], "actions": []},
            {"street": "turn", "board": ["2c", "7d", "9h", "Qc"], "actions": []},
            {
                "street": "river",
                "board": ["2c", "7d", "9h", "Qc", "3s"],
                "actions": [],
            },
        ],
        "result": {
            "winner_seats": [1],
            "pot": 40000,
            "hero_invested": 20000,
            "hero_profit": 20000,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    timeline = build_timeline(data)
    deals = [item for item in timeline if item.kind == "deal"]
    assert [item.street for item in deals] == ["flop", "turn", "river"]
    flop = get_state_at_step(data, timeline.index(deals[0]))
    assert flop.board == ("2c", "7d", "9h")
    river = get_state_at_step(data, len(timeline) - 1)
    assert river.board[-1] == "3s"
    assert river.pot == 40000


def test_starting_pot_includes_table_antes_and_blinds() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    posted = get_state_at_step(data, 0)
    assert posted.pot == 9 * 2000 + 1000 + 2000


def _three_handed_6(
    ante_mode: str | None,
    *,
    ante: int = 2000,
    actions: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    blinds: dict[str, object] = {"sb": 1000, "bb": 2000, "ante": ante}
    if ante_mode is not None:
        blinds["ante_mode"] = ante_mode
    return {
        "schema_version": 1,
        "table_size": 6,
        "blinds": blinds,
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 100000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "SB", "name": "SB", "stack": 100000},
            {"seat": 3, "position": "BB", "name": "BB", "stack": 100000},
        ],
        "streets": [{"street": "preflop", "board": [], "actions": actions or []}],
        "result": {
            "winner_seats": [3],
            "pot": 0,
            "hero_invested": 0,
            "hero_profit": 0,
            "side_pots": None,
        },
    }


def test_bb_ante_posts_once_from_the_big_blind() -> None:
    posted = get_state_at_step(parse_stored_hand(_three_handed_6("bb")), 0)
    assert posted.pot == 5_000


def test_occupied_ante_posts_from_sitting_players() -> None:
    posted = get_state_at_step(parse_stored_hand(_three_handed_6("occupied")), 0)
    assert posted.pot == 9_000


def test_ante_zero_skips_ante_mode() -> None:
    posted = get_state_at_step(parse_stored_hand(_three_handed_6("bb", ante=0)), 0)
    assert posted.pot == 3_000


def test_bb_ante_raise_and_call() -> None:
    payload = _three_handed_6(
        "bb",
        actions=[
            {"seat": 1, "action": "raise", "amount": 6000},
            {"seat": 2, "action": "fold"},
            {"seat": 3, "action": "call", "amount": 6000},
        ],
    )
    payload["result"] = {
        "winner_seats": [1],
        "pot": 0,
        "hero_invested": 0,
        "hero_profit": 0,
        "side_pots": None,
    }
    data = HandData.model_validate(payload)
    timeline = build_timeline(data)
    final = get_state_at_step(data, len(timeline) - 1)
    assert final.pot == 15_000


def test_short_handed_nine_max_uses_occupied_positions() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 9,
        "blinds": {"sb": 1000, "bb": 2000, "ante": 2000},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 100000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 3, "position": "SB", "name": "Игрок 3", "stack": 100000},
            {"seat": 7, "position": "BB", "name": "Villain", "stack": 100000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 1, "action": "fold"},
                    {"seat": 3, "action": "fold"},
                ],
            }
        ],
        "result": {
            "winner_seats": [7],
            "pot": 21000,
            "hero_invested": 3000,
            "hero_profit": -3000,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert [seat.position for seat in posted.seats] == ["BTN", "SB", "BB"]
    assert posted.pot == 21_000
    assert posted.current_bet == 2000
    assert posted.actor_seat == 1


def test_rejects_hand_without_bb() -> None:
    payload = copy.deepcopy(FOLD_PREFLOP)
    seats = payload["seats"]
    assert isinstance(seats, list)
    payload["seats"] = [
        row for row in seats if isinstance(row, dict) and row.get("position") != "BB"
    ]
    with pytest.raises(ValidationError, match="Хедз-ап: нужны позиции BTN и BB"):
        HandData.model_validate(payload)

    payload = copy.deepcopy(FOLD_PREFLOP)
    extra = list(payload["seats"]) if isinstance(payload["seats"], list) else []
    extra.append({"seat": 4, "position": "CO", "name": "Villain 4", "stack": 40000})
    payload["seats"] = [
        row for row in extra if isinstance(row, dict) and row.get("position") != "BB"
    ]
    with pytest.raises(ValidationError, match="большого блайнда"):
        HandData.model_validate(payload)


def test_three_max_positions_from_button() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 3,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "SB", "name": "Villain 2", "stack": 50000},
            {"seat": 3, "position": "BB", "name": "Villain 3", "stack": 50000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 1, "action": "fold"},
                    {"seat": 2, "action": "fold"},
                ],
            },
        ],
        "result": {
            "winner_seats": [3],
            "pot": 1500,
            "hero_invested": 0,
            "hero_profit": 0,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert posted.actor_seat == 1
    assert [seat.position for seat in posted.seats] == ["BTN", "SB", "BB"]


def test_five_max_positions_from_button() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 5,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "SB", "name": "Villain 2", "stack": 50000},
            {"seat": 3, "position": "BB", "name": "Villain 3", "stack": 50000},
            {"seat": 4, "position": "UTG", "name": "Villain 4", "stack": 50000},
            {"seat": 5, "position": "CO", "name": "Villain 5", "stack": 50000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 4, "action": "fold"},
                    {"seat": 5, "action": "fold"},
                    {"seat": 1, "action": "fold"},
                    {"seat": 2, "action": "fold"},
                ],
            },
        ],
        "result": {
            "winner_seats": [3],
            "pot": 1500,
            "hero_invested": 0,
            "hero_profit": 0,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert posted.actor_seat == 4
    assert [seat.position for seat in posted.seats] == ["BTN", "SB", "BB", "UTG", "CO"]


def test_four_handed_on_nine_max_is_co_not_utg() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 9,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "SB", "name": "Villain 2", "stack": 50000},
            {"seat": 3, "position": "BB", "name": "Villain 3", "stack": 50000},
            {"seat": 7, "position": "CO", "name": "Villain 7", "stack": 50000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 7, "action": "fold"},
                    {"seat": 1, "action": "fold"},
                    {"seat": 2, "action": "fold"},
                ],
            },
        ],
        "result": {
            "winner_seats": [3],
            "pot": 1500,
            "hero_invested": 0,
            "hero_profit": 0,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert posted.actor_seat == 7
    assert [seat.position for seat in posted.seats] == ["BTN", "SB", "BB", "CO"]


def test_heads_up_btn_posts_small_blind() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 2,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "BB", "name": "Villain", "stack": 50000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [{"seat": 1, "action": "fold"}],
            }
        ],
        "result": {
            "winner_seats": [2],
            "pot": 1500,
            "hero_invested": 500,
            "hero_profit": -500,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert posted.pot == 1500
    assert posted.actor_seat == 1
    btn = next(seat for seat in posted.seats if seat.seat == 1)
    bb = next(seat for seat in posted.seats if seat.seat == 2)
    assert btn.committed == 500
    assert bb.committed == 1000


def test_heads_up_on_nine_max_posts_btn_small_blind() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 9,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 5, "position": "BB", "name": "Villain", "stack": 50000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [{"seat": 1, "action": "fold"}],
            }
        ],
        "result": {
            "winner_seats": [5],
            "pot": 1500,
            "hero_invested": 500,
            "hero_profit": -500,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    assert posted.pot == 1500
    assert posted.actor_seat == 1
    btn = next(seat for seat in posted.seats if seat.seat == 1)
    bb = next(seat for seat in posted.seats if seat.seat == 5)
    assert btn.committed == 500
    assert bb.committed == 1000


def test_rejects_zero_starting_stack() -> None:
    payload = copy.deepcopy(FOLD_PREFLOP)
    payload["seats"][1]["stack"] = 0  # type: ignore[index]
    with pytest.raises(ValidationError, match="больше нуля"):
        HandData.model_validate(payload)


def test_rejects_negative_starting_stack() -> None:
    payload = copy.deepcopy(FOLD_PREFLOP)
    payload["seats"][0]["stack"] = -1  # type: ignore[index]
    with pytest.raises(ValidationError, match="больше нуля"):
        HandData.model_validate(payload)


def test_accepts_starting_stack_below_one_bb() -> None:
    payload = {
        "schema_version": 1,
        "table_size": 2,
        "blinds": {"sb": 500, "bb": 1000, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 50000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "BB", "name": "Villain", "stack": 500},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [{"seat": 1, "action": "fold"}],
            }
        ],
        "result": {
            "winner_seats": [2],
            "pot": 1000,
            "hero_invested": 500,
            "hero_profit": -500,
            "side_pots": None,
        },
    }
    data = HandData.model_validate(payload)
    posted = get_state_at_step(data, 0)
    bb = next(seat for seat in posted.seats if seat.seat == 2)
    assert bb.all_in is True
    assert bb.committed == 500
    assert posted.pot == 1000


def test_ante_zero_is_valid() -> None:
    data = HandData.model_validate(FOLD_PREFLOP)
    assert data.blinds.ante == 0


def test_rejects_single_participant() -> None:
    payload = copy.deepcopy(FOLD_PREFLOP)
    payload["seats"] = payload["seats"][:1]  # type: ignore[index]
    with pytest.raises(ValidationError):
        HandData.model_validate(payload)


def test_write_corrects_result_totals_from_engine() -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["result"]["pot"] = 1  # type: ignore[index]
    payload["result"]["hero_invested"] = 1  # type: ignore[index]
    payload["result"]["hero_profit"] = 1  # type: ignore[index]
    data = HandData.model_validate(payload)
    assert data.result.pot == 114000
    assert data.result.hero_invested == 48500
    assert data.result.hero_profit == 65500


def test_stored_hand_skips_engine_pot_check() -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["result"]["pot"] = 104000  # type: ignore[index]
    payload["result"]["hero_profit"] = 55500  # type: ignore[index]
    stored = parse_stored_hand(payload)
    assert stored.result.pot == 104000


def _flop_open_payload(sb: int, bb: int, bet: int) -> dict[str, object]:
    return {
        "schema_version": 1,
        "table_size": 3,
        "blinds": {"sb": sb, "bb": bb, "ante": 0},
        "hero_seat": 1,
        "button_seat": 1,
        "seats": [
            {
                "seat": 1,
                "position": "BTN",
                "name": "Вы",
                "stack": 100_000,
                "is_hero": True,
                "cards": ["As", "Kd"],
            },
            {"seat": 2, "position": "SB", "name": "SB", "stack": 100_000},
            {"seat": 3, "position": "BB", "name": "BB", "stack": 100_000},
        ],
        "streets": [
            {
                "street": "preflop",
                "board": [],
                "actions": [
                    {"seat": 1, "action": "call", "amount": bb},
                    {"seat": 2, "action": "call", "amount": bb},
                    {"seat": 3, "action": "check"},
                ],
            },
            {
                "street": "flop",
                "board": ["Ks", "9h", "4d"],
                "actions": [
                    {"seat": 2, "action": "bet", "amount": bet},
                    {"seat": 3, "action": "fold"},
                    {"seat": 1, "action": "fold"},
                ],
            },
        ],
        "result": {
            "winner_seats": [2],
            "pot": 1,
            "hero_invested": 1,
            "hero_profit": 0,
            "side_pots": None,
        },
    }


@pytest.mark.parametrize(
    ("sb", "bb", "open_min", "raise_min"),
    [(100, 200, 200, 400), (1000, 2000, 2000, 4000)],
)
def test_min_aggressive_to_uses_bb_and_last_raise(
    sb: int, bb: int, open_min: int, raise_min: int
) -> None:
    assert min_aggressive_to(0, 0, bb) == open_min
    assert min_aggressive_to(bb, bb, bb) == raise_min


@pytest.mark.parametrize("bb", [200, 2000])
def test_rejects_flop_bet_below_bb(bb: int) -> None:
    payload = _flop_open_payload(bb // 2, bb, 2)
    with pytest.raises(ValidationError, match="Минимальный бет"):
        HandData.model_validate(payload)


@pytest.mark.parametrize("bb", [200, 2000])
def test_accepts_flop_bet_equal_to_bb(bb: int) -> None:
    payload = _flop_open_payload(bb // 2, bb, bb)
    data = HandData.model_validate(payload)
    assert data.streets[1].actions[0].amount == bb
