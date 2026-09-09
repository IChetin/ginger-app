"""Hand JSON validation and deterministic replay state.

Chip counts are integers (tournament chips), not currency.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

from app.schemas.hands import HandAction, HandBlinds, HandDocument, StreetName

POSITIONS_BY_SIZE: dict[int, tuple[str, ...]] = {
    2: ("BTN", "BB"),
    3: ("BTN", "SB", "BB"),
    4: ("BTN", "SB", "BB", "CO"),
    5: ("BTN", "SB", "BB", "UTG", "CO"),
    6: ("BTN", "SB", "BB", "UTG", "HJ", "CO"),
    7: ("BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"),
    8: ("BTN", "SB", "BB", "UTG", "+1", "MP", "HJ", "CO"),
    9: ("BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"),
}

PREFLOP_ORDER = ("UTG", "+1", "+2", "MP", "HJ", "CO", "BTN", "SB", "BB")
POSTFLOP_ORDER = ("SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO", "BTN")
STREET_ORDER: tuple[StreetName, ...] = ("preflop", "flop", "turn", "river")
BOARD_LEN: dict[StreetName, int] = {"preflop": 0, "flop": 3, "turn": 4, "river": 5}

TimelineKind = Literal["post", "action", "deal"]


@dataclass(frozen=True)
class TimelineItem:
    kind: TimelineKind
    street: StreetName
    action_index: int | None = None


@dataclass
class SeatRuntime:
    seat: int
    position: str
    name: str
    stack: int
    committed: int
    folded: bool
    all_in: bool
    is_hero: bool
    cards: list[str]
    starting_stack: int
    invested: int = 0


@dataclass
class ReplayState:
    step: int
    total_steps: int
    street: StreetName
    board: tuple[str, ...]
    pot: int
    current_bet: int
    seats: tuple[SeatRuntime, ...]
    actor_seat: int | None
    last_action: HandAction | None
    log: str
    is_deal: bool
    has_side_pot_warning: bool
    hero_invested: int


def seat_ring(table_size: int, button_seat: int) -> list[int]:
    return [((button_seat - 1 + offset) % table_size) + 1 for offset in range(table_size)]


def occupied_ring(table_size: int, button_seat: int, occupied: list[int]) -> list[int]:
    sitting = set(occupied)
    return [seat for seat in seat_ring(table_size, button_seat) if seat in sitting]


def expected_position(
    table_size: int,
    button_seat: int,
    seat: int,
    occupied: list[int],
) -> str:
    ring = occupied_ring(table_size, button_seat, occupied)
    positions = POSITIONS_BY_SIZE.get(len(ring), POSITIONS_BY_SIZE[9])
    index = ring.index(seat)
    return positions[index]


def _all_cards(data: HandDocument) -> list[str]:
    cards: list[str] = []
    for seat in data.seats:
        cards.extend(seat.cards)
    longest: list[str] = []
    for street in data.streets:
        if len(street.board) >= len(longest):
            longest = list(street.board)
    cards.extend(longest)
    return cards


def _structural_validate(data: HandDocument) -> None:
    if data.table_size not in POSITIONS_BY_SIZE:
        raise ValueError("Размер стола должен быть от 2 до 9")
    seats = [item.seat for item in data.seats]
    if len(seats) != len(set(seats)):
        raise ValueError("Номера мест не должны повторяться")
    if len(seats) < 2:
        raise ValueError("Нужны хотя бы два участника")
    for item in data.seats:
        if item.seat < 1 or item.seat > data.table_size:
            raise ValueError(f"Место {item.seat} вне стола 1…{data.table_size}")
    heroes = [item for item in data.seats if item.is_hero]
    if len(heroes) != 1:
        raise ValueError("В раздаче должен быть ровно один герой")
    hero = heroes[0]
    if hero.seat != data.hero_seat:
        raise ValueError("hero_seat не совпадает с местом героя")
    occupied = sorted(seats)
    if data.button_seat < 1 or data.button_seat > data.table_size:
        raise ValueError(f"Кнопка вне стола 1…{data.table_size}")
    if data.hero_seat not in occupied:
        raise ValueError("Герой должен быть среди участников")
    positions = {item.position for item in data.seats}
    if len(occupied) == 2 and positions != {"BTN", "BB"}:
        raise ValueError("Хедз-ап: нужны позиции BTN и BB")
    if "BB" not in positions:
        raise ValueError("Без большого блайнда раздачи не бывает")
    for item in data.seats:
        expected = expected_position(
            data.table_size,
            data.button_seat,
            item.seat,
            occupied,
        )
        if item.position != expected:
            raise ValueError(
                f"Позиция места {item.seat} должна быть {expected}, указано {item.position}"
            )
        if item.is_hero and len(item.cards) != 2:
            raise ValueError("У героя должны быть две карты")
        if item.cards and len(item.cards) != 2:
            raise ValueError(f"{item.name} карты задаются парой")
        if item.stack <= 0:
            raise ValueError(f"Стек {item.name} должен быть больше нуля")
    all_cards = _all_cards(data)
    if len(all_cards) != len(set(all_cards)):
        raise ValueError("Карты в раздаче не должны повторяться")
    if not data.streets:
        raise ValueError("Нужна хотя бы улица префлоп")
    if data.streets[0].street != "preflop":
        raise ValueError("Первая улица должна быть префлоп")
    prev_board: list[str] = []
    for index, street in enumerate(data.streets):
        expected_street = STREET_ORDER[index]
        if street.street != expected_street:
            raise ValueError(f"Ожидалась улица {expected_street}")
        need = BOARD_LEN[street.street]
        if len(street.board) != need:
            raise ValueError(
                f"{street.street} требует {need} карт борда, указано {len(street.board)}"
            )
        if need and street.board[: len(prev_board)] != prev_board:
            raise ValueError("Борд следующей улицы должен начинаться с карт предыдущей")
        prev_board = list(street.board)
        occupied_set = set(occupied)
        for action in street.actions:
            if action.seat not in occupied_set:
                raise ValueError(f"Действие с неизвестного места {action.seat}")
            needs_amount = action.action in {"call", "raise", "bet", "allin"}
            if needs_amount and action.amount is None:
                raise ValueError(f"{action.action} требует сумму")
            if action.action in {"check", "fold"} and action.amount is not None:
                raise ValueError(f"{action.action} не должно быть суммы")
    winners = set(data.result.winner_seats)
    if not winners.issubset(set(occupied)):
        raise ValueError("Победитель должен быть участником раздачи")
    if data.result.pot < 0 or data.result.hero_invested < 0:
        raise ValueError("Банк и вложения не могут быть отрицательными")


def _by_seat(seats: list[SeatRuntime]) -> dict[int, SeatRuntime]:
    return {seat.seat: seat for seat in seats}


def _can_act(seat: SeatRuntime) -> bool:
    return not seat.folded and not seat.all_in and seat.stack > 0


def _betting_possible(seats: list[SeatRuntime]) -> bool:
    return sum(1 for seat in seats if _can_act(seat)) >= 2


def _living(seats: list[SeatRuntime]) -> list[SeatRuntime]:
    return [seat for seat in seats if not seat.folded]


def _return_uncalled(
    seats: list[SeatRuntime],
    pot: int,
    acted_this_street: set[int],
) -> int:
    highest = 0
    cover = 0
    for seat in seats:
        if seat.committed > highest:
            cover = highest
            highest = seat.committed
        elif seat.committed > cover:
            cover = seat.committed
    extra = highest - cover
    if extra <= 0:
        return pot
    leaders = [seat for seat in seats if seat.committed == highest]
    if len(leaders) != 1:
        return pot
    leader = leaders[0]
    if leader.folded or leader.seat not in acted_this_street:
        return pot
    leader.committed -= extra
    leader.invested -= extra
    leader.stack += extra
    if leader.stack > 0:
        leader.all_in = False
    return pot - extra


def _living_committed_matched(seats: list[SeatRuntime]) -> bool:
    amounts = [seat.committed for seat in _living(seats)]
    if len(amounts) < 2:
        return True
    return all(value == amounts[0] for value in amounts)


def _settle_uncalled(
    seats: list[SeatRuntime],
    pot: int,
    uneven: bool,
    acted_this_street: set[int],
) -> tuple[int, bool]:
    next_pot = _return_uncalled(seats, pot, acted_this_street)
    return next_pot, (False if _living_committed_matched(seats) else uneven)


def _is_heads_up(seats: list[SeatRuntime]) -> bool:
    if len(seats) != 2:
        return False
    positions = {seat.position for seat in seats}
    return positions == {"BTN", "BB"}


def _action_order(seats: list[SeatRuntime], street: StreetName) -> list[int]:
    if _is_heads_up(seats):
        by_pos = {seat.position: seat.seat for seat in seats}
        order: tuple[str, ...] = ("BTN", "BB") if street == "preflop" else ("BB", "BTN")
        return [by_pos[pos] for pos in order if pos in by_pos]
    order = PREFLOP_ORDER if street == "preflop" else POSTFLOP_ORDER
    by_pos = {seat.position: seat.seat for seat in seats}
    return [by_pos[pos] for pos in order if pos in by_pos]


def _pending_actors(seats: list[SeatRuntime], street: StreetName) -> list[int]:
    lookup = _by_seat(seats)
    return [seat for seat in _action_order(seats, street) if _can_act(lookup[seat])]


def _put_chips(seat: SeatRuntime, amount: int, pot: int) -> tuple[int, bool]:
    """Put `amount` additional chips. Returns (new_pot, uneven_allin)."""
    if amount < 0:
        raise ValueError("Нельзя поставить отрицательную сумму")
    put = min(amount, seat.stack)
    uneven = put < amount
    seat.stack -= put
    seat.committed += put
    seat.invested += put
    if seat.stack == 0:
        seat.all_in = True
    return pot + put, uneven or (seat.all_in and put < amount)


def _resolve_ante_mode(blinds: HandBlinds) -> str:
    if blinds.ante_mode in ("bb", "occupied"):
        return blinds.ante_mode
    return "table"


def _apply_posts(
    seats: list[SeatRuntime],
    blinds: HandBlinds,
    table_size: int,
    button_seat: int,
) -> tuple[int, bool]:
    pot = 0
    uneven = False
    if blinds.ante:
        mode = _resolve_ante_mode(blinds)
        if mode == "bb":
            bb_ante = next((seat for seat in seats if seat.position == "BB"), None)
            if bb_ante is not None:
                pot, extra = _put_chips(bb_ante, blinds.ante, pot)
                uneven = uneven or extra
        else:
            for seat in seats:
                pot, extra = _put_chips(seat, blinds.ante, pot)
                uneven = uneven or extra
            if mode == "table":
                pot += blinds.ante * max(0, table_size - len(seats))
        for seat in seats:
            seat.committed = 0
    lookup = _by_seat(seats)
    # Стартовый банк: (SB, если место SB занято) + BB + анте по ante_mode.
    # bb — одно анте с BB; occupied — с каждого сидящего; нет поля — table_size × ante.
    # Хедз-ап (два игрока): BTN постит SB. Нет позиции SB — в банк не идёт.
    if _is_heads_up(seats):
        btn = lookup.get(button_seat) or next(
            (seat for seat in seats if seat.position == "BTN"),
            None,
        )
        bb = next((seat for seat in seats if seat.position == "BB"), None)
        if btn is not None:
            pot, extra = _put_chips(btn, blinds.sb, pot)
            uneven = uneven or extra
        if bb is not None:
            pot, extra = _put_chips(bb, blinds.bb, pot)
            uneven = uneven or extra
        return pot, uneven
    sb_seat: int | None = next(
        (seat.seat for seat in seats if seat.position == "SB"),
        None,
    )
    bb_seat: int | None = next(
        (seat.seat for seat in seats if seat.position == "BB"),
        None,
    )
    if sb_seat is not None:
        pot, extra = _put_chips(lookup[sb_seat], blinds.sb, pot)
        uneven = uneven or extra
    if bb_seat is not None:
        pot, extra = _put_chips(lookup[bb_seat], blinds.bb, pot)
        uneven = uneven or extra
    return pot, uneven


def min_aggressive_to(current_bet: int, last_raise: int, bb: int) -> int:
    """Opening bet = BB; raise = current bet + last raise increment."""
    big = max(1, bb)
    if current_bet <= 0:
        return big
    return current_bet + max(last_raise, 1)


def _is_all_in_to(seat: SeatRuntime, amount: int) -> bool:
    return amount >= seat.committed + seat.stack


def _apply_action(
    seats: list[SeatRuntime],
    action: HandAction,
    pot: int,
    current_bet: int,
    last_raise: int = 1,
    bb: int = 1,
) -> tuple[int, int, bool]:
    lookup = _by_seat(seats)
    seat = lookup[action.seat]
    if seat.folded:
        raise ValueError(f"{seat.name} уже в фолде")
    if action.action != "allin" and not _can_act(seat):
        raise ValueError(f"{seat.name} не может действовать")
    if action.action == "fold":
        seat.folded = True
        return pot, current_bet, False
    if action.action == "check":
        if seat.committed < current_bet:
            raise ValueError(f"{seat.name} не может чекать против ставки")
        return pot, current_bet, False
    if action.action == "call":
        target = action.amount if action.amount is not None else current_bet
        if current_bet <= seat.committed and target <= seat.committed:
            raise ValueError(f"{seat.name} нечего коллировать")
        if target != current_bet and target != seat.committed + seat.stack:
            raise ValueError(f"Колл {seat.name} должен быть до {current_bet}")
        need = target - seat.committed
        pot, uneven = _put_chips(seat, need, pot)
        return pot, current_bet, uneven
    if action.action == "bet":
        if current_bet > 0:
            raise ValueError(f"{seat.name} не может ставить — уже есть ставка")
        if action.amount is None or action.amount <= 0:
            raise ValueError("Бет должен быть больше нуля")
        if action.amount <= seat.committed:
            raise ValueError("Бет должен увеличивать вложение")
        minimum = min_aggressive_to(current_bet, last_raise, bb)
        if action.amount < minimum and not _is_all_in_to(seat, action.amount):
            raise ValueError(f"Минимальный бет {minimum}")
        need = action.amount - seat.committed
        if need > seat.stack:
            raise ValueError("Недостаточно фишек для бета")
        pot, uneven = _put_chips(seat, need, pot)
        return pot, seat.committed, uneven
    if action.action == "raise":
        if current_bet <= 0:
            raise ValueError(f"{seat.name} не может рейзить без ставки — нужен бет")
        if action.amount is None or action.amount <= current_bet:
            raise ValueError("Рейз должен быть выше текущей ставки")
        if action.amount <= seat.committed:
            raise ValueError("Рейз должен увеличивать вложение")
        minimum = min_aggressive_to(current_bet, last_raise, bb)
        if action.amount < minimum and not _is_all_in_to(seat, action.amount):
            raise ValueError(f"Минимальный рейз {minimum}")
        need = action.amount - seat.committed
        if need > seat.stack:
            raise ValueError("Недостаточно фишек для рейза")
        pot, uneven = _put_chips(seat, need, pot)
        return pot, seat.committed, uneven
    # allin
    target = action.amount if action.amount is not None else seat.committed + seat.stack
    need = target - seat.committed
    if need < 0:
        need = seat.stack
    pot, uneven = _put_chips(seat, need if need > 0 else seat.stack, pot)
    new_bet = max(current_bet, seat.committed)
    return pot, new_bet, uneven or (seat.committed < current_bet)


def _reopen_pending(
    pending: list[int],
    seats: list[SeatRuntime],
    street: StreetName,
    actor: int,
    raised: bool,
) -> list[int]:
    if raised:
        full = _pending_actors(seats, street)
        if actor in full:
            index = full.index(actor)
            return full[index + 1 :] + full[:index]
        return full
    return [seat for seat in pending if seat != actor]


def _init_seats(data: HandDocument) -> list[SeatRuntime]:
    return [
        SeatRuntime(
            seat=item.seat,
            position=item.position,
            name=item.name,
            stack=item.stack,
            committed=0,
            folded=False,
            all_in=False,
            is_hero=item.is_hero,
            cards=list(item.cards),
            starting_stack=item.stack,
            invested=0,
        )
        for item in data.seats
    ]


def _reset_street(seats: list[SeatRuntime]) -> None:
    for seat in seats:
        seat.committed = 0


def _format_amount(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def _action_log(seats: list[SeatRuntime], action: HandAction, next_seat: int | None) -> str:
    lookup = _by_seat(seats)
    actor = lookup[action.seat]
    amount = action.amount
    if action.action == "fold":
        body = f"{actor.name} фолд"
    elif action.action == "check":
        body = f"{actor.name} чек"
    elif action.action == "call":
        body = f"{actor.name} колл {_format_amount(amount or 0)}"
    elif action.action == "bet":
        body = f"{actor.name} бет {_format_amount(amount or 0)}"
    elif action.action == "raise":
        body = f"{actor.name} рейз до {_format_amount(amount or 0)}"
    else:
        body = f"{actor.name} олл-ин {_format_amount(amount or actor.committed)}"
    if next_seat is None:
        return body
    nxt = lookup[next_seat]
    suffix = " · ваш ход" if nxt.is_hero else f" · ход {nxt.name}"
    return body + suffix


def _street_label(street: StreetName) -> str:
    labels = {
        "preflop": "Префлоп",
        "flop": "Флоп",
        "turn": "Тёрн",
        "river": "Ривер",
    }
    return labels[street]


def build_timeline(data: HandDocument) -> list[TimelineItem]:
    items: list[TimelineItem] = [TimelineItem(kind="post", street="preflop")]
    for street in data.streets:
        if street.street != "preflop":
            items.append(TimelineItem(kind="deal", street=street.street))
        for index, _action in enumerate(street.actions):
            items.append(TimelineItem(kind="action", street=street.street, action_index=index))
    return items


def _snapshot(
    *,
    step: int,
    total: int,
    street: StreetName,
    board: list[str],
    pot: int,
    current_bet: int,
    seats: list[SeatRuntime],
    actor_seat: int | None,
    last_action: HandAction | None,
    log: str,
    is_deal: bool,
    uneven: bool,
) -> ReplayState:
    hero = next((seat for seat in seats if seat.is_hero), None)
    return ReplayState(
        step=step,
        total_steps=total,
        street=street,
        board=tuple(board),
        pot=pot,
        current_bet=current_bet,
        seats=tuple(replace(seat) for seat in seats),
        actor_seat=actor_seat,
        last_action=last_action,
        log=log,
        is_deal=is_deal,
        has_side_pot_warning=uneven,
        hero_invested=hero.invested if hero is not None else 0,
    )


def get_state_at_step(data: HandDocument, step: int) -> ReplayState:
    timeline = build_timeline(data)
    total = len(timeline)
    if step < 0 or step >= total:
        raise ValueError("Шаг вне раздачи")
    seats = _init_seats(data)
    pot = 0
    current_bet = 0
    last_raise = 0
    board: list[str] = []
    street: StreetName = "preflop"
    pending: list[int] = []
    last_action: HandAction | None = None
    log = ""
    is_deal = False
    uneven = False
    acted_this_street: set[int] = set()
    streets = {item.street: item for item in data.streets}

    def actor() -> int | None:
        return pending[0] if pending else None

    def suffix(next_seat: int | None) -> str:
        if next_seat is None:
            return ""
        lookup = _by_seat(seats)
        nxt = lookup[next_seat]
        return " · ваш ход" if nxt.is_hero else f" · ход {nxt.name}"

    for index, item in enumerate(timeline):
        if item.kind == "post":
            pot, extra = _apply_posts(seats, data.blinds, data.table_size, data.button_seat)
            uneven = uneven or extra
            current_bet = max((seat.committed for seat in seats), default=0)
            if not any(seat.position == "BB" for seat in seats):
                current_bet = max(current_bet, data.blinds.bb)
            last_raise = current_bet
            pending = _pending_actors(seats, "preflop")
            log = "Блайнды и анте" + suffix(actor())
            is_deal = False
            last_action = None
        elif item.kind == "deal":
            if pending and _betting_possible(seats):
                still = [seat for seat in pending if _can_act(_by_seat(seats)[seat])]
                if still:
                    raise ValueError("Улица не закрыта до сдачи борда")
            pot, uneven = _settle_uncalled(seats, pot, uneven, acted_this_street)
            acted_this_street.clear()
            street = item.street
            board = list(streets[street].board)
            _reset_street(seats)
            current_bet = 0
            last_raise = 0
            pending = _pending_actors(seats, street) if _betting_possible(seats) else []
            log = _street_label(street) + suffix(actor())
            is_deal = True
            last_action = None
        else:
            street_data = streets[item.street]
            assert item.action_index is not None
            action = street_data.actions[item.action_index]
            if not pending:
                raise ValueError("Улица уже закрыта, лишнее действие")
            expected = pending[0]
            if action.seat != expected:
                raise ValueError(f"Сейчас ход места {expected}, а действует место {action.seat}")
            prev_bet = current_bet
            pot, current_bet, extra = _apply_action(
                seats, action, pot, current_bet, last_raise, data.blinds.bb
            )
            uneven = uneven or extra
            raised = action.action in {"bet", "raise"} or (
                action.action == "allin" and current_bet > prev_bet
            )
            if raised:
                last_raise = current_bet - prev_bet
            pending = _reopen_pending(pending, seats, item.street, action.seat, raised)
            pending = [seat for seat in pending if _can_act(_by_seat(seats)[seat])]
            if len(_living(seats)) < 2:
                pending = []
            acted_this_street.add(action.seat)
            if not pending:
                pot, uneven = _settle_uncalled(seats, pot, uneven, acted_this_street)
            last_action = action
            log = _action_log(seats, action, actor())
            is_deal = False
        if index == step:
            return _snapshot(
                step=step,
                total=total,
                street=street,
                board=board,
                pot=pot,
                current_bet=current_bet,
                seats=seats,
                actor_seat=actor(),
                last_action=last_action,
                log=log,
                is_deal=is_deal,
                uneven=uneven,
            )
    raise ValueError("Шаг вне раздачи")


def validate_hand_data(data: HandDocument) -> ReplayState:
    """Structural checks + full simulation. Returns the final replay state."""
    _structural_validate(data)
    timeline = build_timeline(data)
    final = get_state_at_step(data, len(timeline) - 1)
    folded = {seat.seat for seat in final.seats if seat.folded}
    for winner in data.result.winner_seats:
        if winner in folded:
            raise ValueError("Победитель не может быть в фолде")
    hero = next(seat for seat in final.seats if seat.is_hero)
    winners = list(dict.fromkeys(data.result.winner_seats))
    share = final.pot // len(winners) if hero.seat in winners else 0
    expected_profit = share - hero.invested
    # Клиентский result.pot может разъехаться с движком (черновик, кэш, dead button).
    # Действия уже прошли симуляцию — итог всегда берём из движка.
    data.result = data.result.model_copy(
        update={
            "pot": final.pot,
            "hero_invested": hero.invested,
            "hero_profit": expected_profit,
        }
    )
    living = [seat for seat in final.seats if not seat.folded]
    if len(living) >= 2 and final.actor_seat is not None:
        raise ValueError("Раздача не завершена — не все уравняли")
    return final
