import { describe, expect, it } from "vitest";

import {
  emptyTableInput,
  inferTablePhase,
  occupiedAfterResize,
  seatsLostWhenResizing,
  tableFromWizard,
  tableReducer,
  tableShrinkWarning,
  tableToWizard,
  type TableInputState,
} from "@/features/hands/lib/tableInputState";
import { emptyWizard, wizardReducer, type WizardStep } from "@/features/hands/lib/wizardState";
import {
  buildHandData,
  formatChipInput,
  lastReplayState,
  resolveWinners,
  resolvedStack,
} from "@/features/hands/lib/hand-engine";

function checks(seats: number[]) {
  return seats.map((seat) => ({ seat, action: "check" as const }));
}

function riverShowdownTable(overrides: Partial<TableInputState> = {}): TableInputState {
  return {
    ...emptyTableInput(),
    phase: "winner",
    heroCards: ["As", "Ah"],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: [
          { seat: 1, action: "call", amount: 2000 },
          { seat: 2, action: "call", amount: 2000 },
          { seat: 3, action: "check" },
        ],
      },
      { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
      { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: checks([2, 3, 1]) },
      { street: "river", board: ["Ad", "2c", "3d", "9s", "4h"], actions: checks([2, 3, 1]) },
    ],
    ...overrides,
  };
}

describe("tableInputState", () => {
  it("starts with hero, SB and BB seated", () => {
    const state = emptyTableInput();
    expect(state.phase).toBe("setup");
    expect(state.tableSize).toBe(9);
    expect(state.occupied).toEqual([1, 2, 3]);
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
  });

  it("sits and unsits optional seats; BB and hero stay", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "toggleSeat", seat: 4 });
    expect(state.occupied).toEqual([1, 2, 3, 4]);
    state = tableReducer(state, { type: "toggleSeat", seat: 4 });
    expect(state.occupied).toEqual([1, 2, 3]);
    state = tableReducer(state, { type: "toggleSeat", seat: 3 });
    expect(state.occupied).toEqual([1, 2, 3]);
    state = tableReducer(state, { type: "toggleSeat", seat: 1 });
    expect(state.occupied).toEqual([1, 2, 3]);
  });

  it("keeps seated players that still fit and drops seats past the new size", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "toggleSeat", seat: 4 });
    state = tableReducer(state, { type: "toggleSeat", seat: 8 });
    expect(state.occupied).toEqual([1, 2, 3, 4, 8]);
    state = tableReducer(state, { type: "setTableSize", size: 6 });
    expect(state.tableSize).toBe(6);
    expect(state.occupied).toEqual([1, 2, 3, 4]);
    expect(seatsLostWhenResizing([1, 2, 3, 4, 8], 6)).toEqual([8]);
    expect(occupiedAfterResize([1, 2, 3, 4, 8], 6, 1, 1)).toEqual([1, 2, 3, 4]);
    expect(tableShrinkWarning([8])).toBe("На месте 8 уже сидит игрок — он будет снят со стола.");
    expect(tableShrinkWarning([8, 9])).toBe(
      "На местах 8, 9 уже сидят игроки — они будут сняты со стола.",
    );
  });

  it("locks both heads-up seats", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "toggleSeat", seat: 2 });
    expect(state.occupied).toEqual([1, 3]);
    state = tableReducer(state, { type: "toggleSeat", seat: 1 });
    state = tableReducer(state, { type: "toggleSeat", seat: 3 });
    expect(state.occupied).toEqual([1, 3]);
  });

  it("plays fold/check/bet through streets and undo", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    expect(state.phase).toBe("acting");
    state = tableReducer(state, { type: "chooseAction", kind: "fold" });
    state = tableReducer(state, { type: "chooseAction", kind: "fold" });
    expect(state.phase).toBe("result");
    expect(state.winnerSeats).toEqual([3]);
    state = tableReducer(state, { type: "undo" });
    expect(state.phase).toBe("acting");
  });

  it("opens sizing empty and confirms only after an amount is set", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "openSizing", kind: "raise" });
    expect(state.phase).toBe("sizing");
    expect(state.sizing).toEqual({ to: null, preset: null });
    state = tableReducer(state, { type: "confirmSizing" });
    expect(state.phase).toBe("sizing");
    expect(state.streets[0]?.actions).toEqual([]);
    state = tableReducer(state, { type: "setSizing", to: 800, preset: "2x" });
    state = tableReducer(state, { type: "confirmSizing" });
    expect(state.streets[0]?.actions[0]?.action).toBe("raise");
    expect(state.flyingChip?.seat).toBe(1);
  });

  it("does not confirm a raise below min (BB 200 → min 400)", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "openSizing", kind: "raise" });
    expect(state.sizing?.to).toBeNull();
    state = tableReducer(state, { type: "setSizing", to: 2, preset: null });
    state = tableReducer(state, { type: "confirmSizing" });
    expect(state.phase).toBe("sizing");
    expect(state.streets[0]?.actions).toEqual([]);
  });

  it("recalculates the pot when blinds change mid-hand and keeps actions", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "fold" });
    expect(state.streets[0]?.actions).toHaveLength(1);
    const potBefore = lastReplayState(state).pot;
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 400 } });
    expect(state.streets[0]?.actions).toHaveLength(1);
    expect(state.phase).toBe("acting");
    expect(lastReplayState(state).pot).not.toBe(potBefore);
  });

  it("opens opponent holes during betting and stays acting after two cards", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "tapSeatCards", seat: 2 });
    expect(state.phase).toBe("cards");
    expect(state.deck).toMatchObject({ kind: "showdown", seat: 2 });
    state = tableReducer(state, { type: "toggleCard", card: "Ks" });
    state = tableReducer(state, { type: "toggleCard", card: "Kh" });
    expect(state.showdownCards[2]).toEqual(["Ks", "Kh"]);
    expect(state.phase).toBe("acting");
  });

  it("rejects a card already used by the hero", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "openDeck", kind: "hero" });
    state = tableReducer(state, { type: "toggleCard", card: "As" });
    state = tableReducer(state, { type: "toggleCard", card: "Kd" });
    expect(state.heroCards).toEqual(["As", "Kd"]);
    state = tableReducer(state, { type: "tapSeatCards", seat: 2 });
    expect(state.deck?.selected).toEqual([]);
    state = tableReducer(state, { type: "toggleCard", card: "As" });
    expect(state.deck?.selected).toEqual([]);
    state = tableReducer(state, { type: "toggleCard", card: "Ks" });
    expect(state.deck?.selected).toEqual(["Ks"]);
  });

  it("treats a finished published hand as result even at wizard step 1", () => {
    const wizard = {
      ...emptyWizard(),
      step: 1 as WizardStep,
      heroCards: ["As", "Ah"],
      winnerSeats: [1],
      streets: riverShowdownTable().streets,
    };
    expect(inferTablePhase(wizard)).toBe("result");
    expect(tableFromWizard(wizard).phase).toBe("result");
  });

  it("warns cascade count when editing an earlier action", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    expect(state.streets[0]?.actions).toHaveLength(2);
    state = tableReducer(state, { type: "tapSeat", seat: 1 });
    expect(state.editingActionIndex).toBe(0);
  });

  it("round-trips a wizard draft", () => {
    let wizard = emptyWizard();
    wizard = wizardReducer(wizard, { type: "toggleSeat", seat: 5 });
    wizard = wizardReducer(wizard, { type: "setSeatName", seat: 2, name: "Саша" });
    const table = tableFromWizard(wizard);
    const back = tableToWizard(table);
    expect(back.occupied).toEqual(wizard.occupied);
    expect(back.names[2]).toBe("Саша");
  });

  it("produces the same data as the wizard for a fold-win", () => {
    let table = emptyTableInput();
    table = tableReducer(table, { type: "startHand" });
    table = tableReducer(table, { type: "chooseAction", kind: "fold" });
    table = tableReducer(table, { type: "chooseAction", kind: "fold" });
    const tableData = buildHandData(table);

    let wizard = emptyWizard();
    wizard = wizardReducer(wizard, { type: "setBlinds", blinds: table.blinds });
    wizard = wizardReducer(wizard, { type: "setStep", step: 3 });
    wizard = wizardReducer(wizard, { type: "addAction", action: { seat: 1, action: "fold" } });
    wizard = wizardReducer(wizard, { type: "addAction", action: { seat: 2, action: "fold" } });
    const wizardData = buildHandData(wizard);
    expect(tableData.streets[0]?.actions).toEqual(wizardData.streets[0]?.actions);
    expect(tableData.result.winner_seats).toEqual(wizardData.result.winner_seats);
    expect(tableData.result.pot).toBe(wizardData.result.pot);
  });

  it("mucks unshown seats when picking a winner so the hand can be saved", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    expect(state.phase).toBe("result");
    expect(state.muckedSeats).toEqual([2, 3]);
    expect(resolveWinners(state)).toEqual([1]);
    expect(buildHandData(state).result.hero_profit).toBeGreaterThan(0);
  });

  it("can pick a winner without hero cards", () => {
    let state = riverShowdownTable({ heroCards: [] });
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    expect(state.phase).toBe("result");
    expect(state.muckedSeats).toEqual([2, 3]);
    expect(resolveWinners(state)).toEqual([1]);
  });

  it("keeps the manual winner after hero cards are entered later", () => {
    let state = riverShowdownTable({ heroCards: [] });
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    state = tableReducer(state, { type: "tapSeatCards", seat: 1 });
    expect(state.phase).toBe("cards");
    expect(state.deck?.kind).toBe("hero");
    state = tableReducer(state, { type: "toggleCard", card: "As" });
    state = tableReducer(state, { type: "toggleCard", card: "Ah" });
    expect(state.heroCards).toEqual(["As", "Ah"]);
    expect(state.phase).toBe("result");
    expect(resolveWinners(state)).toEqual([1]);
  });

  it("opens the showdown deck from opponent hole cards", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "tapSeatCards", seat: 2 });
    expect(state.phase).toBe("cards");
    expect(state.deck).toMatchObject({ kind: "showdown", seat: 2 });
  });

  it("unmucks a seat when showdown cards are entered", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    expect(state.muckedSeats).toEqual([2, 3]);
    state = tableReducer(state, { type: "tapSeatCards", seat: 2 });
    state = tableReducer(state, { type: "toggleCard", card: "Ks" });
    state = tableReducer(state, { type: "toggleCard", card: "Kh" });
    expect(state.showdownCards[2]).toEqual(["Ks", "Kh"]);
    expect(state.muckedSeats).toEqual([3]);
    expect(state.phase).toBe("result");
    expect(resolveWinners(state)).toEqual([1]);
  });

  it("does not treat an incomplete showdown as a finished result", () => {
    let state = riverShowdownTable({
      heroCards: [],
      phase: "cards",
      deck: { kind: "hero", selected: [] },
    });
    state = tableReducer(state, { type: "closeDeck" });
    expect(state.phase).toBe("winner");
    expect(state.deck).toBeNull();
  });

  it("prompts once when preflop ends without hero cards", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    expect(state.phase).toBe("heroPrompt");
    expect(state.heroCardsPromptSeen).toBe(true);
    state = tableReducer(state, { type: "continueWithoutHeroCards" });
    expect(state.phase).toBe("cards");
    expect(state.deck?.kind).toBe("board");
    state = tableReducer(state, { type: "toggleCard", card: "2c" });
    state = tableReducer(state, { type: "toggleCard", card: "7d" });
    state = tableReducer(state, { type: "toggleCard", card: "Jh" });
    expect(state.phase).toBe("acting");
    expect(state.heroCardsPromptSeen).toBe(true);
  });

  it("opens the hero deck from the prompt and then the flop", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    state = tableReducer(state, { type: "openDeck", kind: "hero" });
    expect(state.deck?.kind).toBe("hero");
    state = tableReducer(state, { type: "toggleCard", card: "As" });
    state = tableReducer(state, { type: "toggleCard", card: "Kd" });
    expect(state.heroCards).toEqual(["As", "Kd"]);
    expect(state.phase).toBe("cards");
    expect(state.deck?.kind).toBe("board");
  });

  it("stores a tournament link", () => {
    let state = emptyTableInput();
    state = tableReducer(state, {
      type: "setLink",
      eventId: "event-1",
      seriesId: null,
      liveSessionId: "live-1",
    });
    expect(state.eventId).toBe("event-1");
    expect(state.seriesId).toBeNull();
    expect(state.liveSessionId).toBe("live-1");
    state = tableReducer(state, {
      type: "setLink",
      eventId: null,
      seriesId: "series-1",
      liveSessionId: null,
    });
    expect(state.eventId).toBeNull();
    expect(state.seriesId).toBe("series-1");
  });

  it("stays on result after mucking a non-winner", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    expect(state.phase).toBe("result");
    state = tableReducer(state, { type: "muckSeat", seat: 2 });
    expect(state.phase).toBe("result");
    expect(state.muckedSeats).toEqual([2, 3]);
    expect(resolveWinners(state)).toEqual([1]);
  });

  it("returns to winner pick after mucking the chosen winner", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "pickWinner", seat: 2 });
    expect(state.phase).toBe("result");
    state = tableReducer(state, { type: "muckSeat", seat: 2 });
    expect(state.phase).toBe("winner");
    expect(resolveWinners(state)).toEqual([]);
  });

  it("replaces a flop card and copies it onto later streets", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "tapBoardCard", index: 0 });
    expect(state.phase).toBe("cards");
    expect(state.deck).toMatchObject({ kind: "board", replaceIndex: 0 });
    state = tableReducer(state, { type: "toggleCard", card: "Kc" });
    expect(state.deck).toBeNull();
    expect(state.streets.find((street) => street.street === "flop")?.board[0]).toBe("Kc");
    expect(state.streets.find((street) => street.street === "turn")?.board[0]).toBe("Kc");
    expect(state.streets.find((street) => street.street === "river")?.board[0]).toBe("Kc");
    expect(state.phase).toBe("winner");
  });

  it("closes a board replacement on undo without changing cards", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "tapBoardCard", index: 1 });
    state = tableReducer(state, { type: "undo" });
    expect(state.deck).toBeNull();
    expect(state.streets.find((street) => street.street === "flop")?.board[1]).toBe("2c");
  });

  it("finishes without opponent hole cards via muck and skip", () => {
    let state = riverShowdownTable();
    state = tableReducer(state, { type: "muckSeat", seat: 2 });
    state = tableReducer(state, { type: "muckSeat", seat: 3 });
    state = tableReducer(state, { type: "pickWinner", seat: 1 });
    expect(state.phase).toBe("result");
    expect(resolveWinners(state)).toEqual([1]);
    expect(buildHandData(state).result.winner_seats).toEqual([1]);
  });

  it("opens showdown after a heads-up all-in before the flop", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "toggleSeat", seat: 2 });
    state = tableReducer(state, { type: "setStack", seat: 1, value: "100000" });
    state = tableReducer(state, { type: "setStack", seat: 3, value: "80000" });
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "allin" });
    state = tableReducer(state, { type: "chooseAction", kind: "allin" });
    if (state.phase === "heroPrompt") {
      state = tableReducer(state, { type: "continueWithoutHeroCards" });
    }
    expect(state.phase).toBe("showdown");
    expect(state.streets.map((street) => street.street)).toEqual(["preflop"]);
    state = tableReducer(state, { type: "skipToResult" });
    expect(state.phase === "winner" || state.phase === "result").toBe(true);
  });

  it("undoes a turn card without removing the flop", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "startHand" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "call" });
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    if (state.phase === "heroPrompt") {
      state = tableReducer(state, { type: "continueWithoutHeroCards" });
    }
    expect(state.phase).toBe("cards");
    expect(state.deck?.lockedCount).toBe(0);
    for (const card of ["2c", "7d", "Jh"] as const) {
      state = tableReducer(state, { type: "toggleCard", card });
    }
    expect(state.phase).toBe("acting");
    expect(state.streets.find((street) => street.street === "flop")?.board).toEqual([
      "2c",
      "7d",
      "Jh",
    ]);
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    state = tableReducer(state, { type: "chooseAction", kind: "check" });
    expect(state.phase).toBe("cards");
    expect(state.deck?.lockedCount).toBe(3);
    expect(state.deck?.selected).toEqual(["2c", "7d", "Jh"]);
    state = tableReducer(state, { type: "undo" });
    expect(state.phase).toBe("acting");
    expect(state.streets.map((street) => street.street)).toEqual(["preflop", "flop"]);
    expect(state.streets.find((street) => street.street === "flop")?.board).toEqual([
      "2c",
      "7d",
      "Jh",
    ]);
    state = tableReducer(state, { type: "continueShowdown" });
    expect(state.phase).toBe("cards");
    state = tableReducer(state, { type: "toggleCard", card: "As" });
    expect(state.phase).toBe("acting");
    expect(state.streets.find((street) => street.street === "turn")?.board).toEqual([
      "2c",
      "7d",
      "Jh",
      "As",
    ]);
    state = tableReducer(state, { type: "undo" });
    expect(state.streets.map((street) => street.street)).toEqual(["preflop", "flop"]);
    expect(state.streets.find((street) => street.street === "flop")?.board).toEqual([
      "2c",
      "7d",
      "Jh",
    ]);
    expect(state.phase).toBe("acting");
  });
});

describe("table blinds autofill and stacks", () => {
  it("keeps SB, BB and ante linked no matter which field was edited last", () => {
    let state = emptyTableInput();
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 500 } });
    expect(state.blinds).toMatchObject({ sb: 250, bb: 500, ante: 500 });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: true, ante: false });

    state = emptyTableInput();
    state = tableReducer(state, { type: "setBlinds", blinds: { sb: 300 } });
    expect(state.blinds).toMatchObject({ sb: 300, bb: 600, ante: 600 });
    expect(state.blindsManual).toMatchObject({ sb: true, bb: false, ante: false });

    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 1000 } });
    expect(state.blinds).toMatchObject({ sb: 500, bb: 1000, ante: 1000 });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: true, ante: false });

    state = tableReducer(state, { type: "setBlinds", blinds: { ante: 50 } });
    expect(state.blinds).toMatchObject({ sb: 25, bb: 50, ante: 50 });
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 800 } });
    expect(state.blinds).toMatchObject({ sb: 400, bb: 800, ante: 800 });
  });

  it("recalculates SB and BB from ante, then the others from BB (300 → 150/300, then 400 → 200/400/400)", () => {
    let state = emptyTableInput();
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: false, ante: false });

    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 200 } });
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });

    state = tableReducer(state, { type: "setBlinds", blinds: { ante: 300 } });
    expect(state.blinds).toMatchObject({ sb: 150, bb: 300, ante: 300 });
    expect(state.blindsManual.ante).toBe(true);

    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 400 } });
    expect(state.blinds).toMatchObject({ sb: 200, bb: 400, ante: 400 });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: true, ante: false });
  });

  it("still fills ante from BB after switching to occupied ante", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "setBlinds", blinds: { ante_mode: "occupied" } });
    expect(state.blinds.ante).toBe(200);
    expect(state.blindsManual).toMatchObject({ sb: false, bb: false, ante: false });
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 400 } });
    expect(state.blinds).toMatchObject({ sb: 200, bb: 400, ante: 400, ante_mode: "occupied" });
  });

  it("resets manual flags only on a new hand hydrate", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "setBlinds", blinds: { ante: 300 } });
    expect(state.blindsManual.ante).toBe(true);
    state = tableReducer(state, { type: "hydrate", state: emptyTableInput() });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: false, ante: false });
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
  });

  it("rescales default 100 BB stacks and keeps a manual stack in chips", () => {
    let state = emptyTableInput();
    expect(resolvedStack(state.stacks[1], state.blinds.bb)).toBe(20_000);
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 500 } });
    expect(resolvedStack(state.stacks[1], state.blinds.bb)).toBe(50_000);
    state = tableReducer(state, { type: "setStack", seat: 1, value: formatChipInput(30_000) });
    state = tableReducer(state, { type: "setBlinds", blinds: { bb: 1000 } });
    expect(resolvedStack(state.stacks[1], state.blinds.bb)).toBe(30_000);
    expect(resolvedStack(state.stacks[2], state.blinds.bb)).toBe(100_000);
  });
});

describe("table reseat", () => {
  function sitCount(count: 2 | 4 | 9): TableInputState {
    let state = emptyTableInput();
    if (count === 2) {
      return tableReducer(state, { type: "toggleSeat", seat: 2 });
    }
    for (let seat = 4; seat <= count; seat++) {
      state = tableReducer(state, { type: "toggleSeat", seat });
    }
    return state;
  }

  it.each([2, 4, 9] as const)(
    "moves name, stack and cards with the player on a %s-handed table",
    (count) => {
      let state = sitCount(count);
      const from = count === 2 ? 3 : 2;
      const to = count === 2 ? 2 : 4;
      state = tableReducer(state, { type: "setSeatName", seat: from, name: "Саша" });
      state = tableReducer(state, { type: "setStack", seat: from, value: formatChipInput(58_000) });
      state = { ...state, showdownCards: { ...state.showdownCards, [from]: ["Ah", "Kd"] } };
      if (count !== 2) {
        state = tableReducer(state, { type: "setSeatName", seat: to, name: "Коля" });
        state = tableReducer(state, { type: "setStack", seat: to, value: formatChipInput(12_000) });
        state = { ...state, showdownCards: { ...state.showdownCards, [to]: ["Qc", "Jd"] } };
      }
      state = tableReducer(state, { type: "moveSeat", from, to });
      if (count === 2) {
        expect(state.occupied).toEqual([1, 2]);
        expect(state.names[2]).toBe("Саша");
        expect(state.stacks[2]).toBe(formatChipInput(58_000));
        expect(state.showdownCards[2]).toEqual(["Ah", "Kd"]);
        expect(state.names[3]).toBeUndefined();
        expect(state.stacks[3]).toBeUndefined();
        expect(state.showdownCards[3]).toBeUndefined();
      } else {
        expect(state.names[to]).toBe("Саша");
        expect(state.stacks[to]).toBe(formatChipInput(58_000));
        expect(state.showdownCards[to]).toEqual(["Ah", "Kd"]);
        expect(state.names[from]).toBe("Коля");
        expect(state.stacks[from]).toBe(formatChipInput(12_000));
        expect(state.showdownCards[from]).toEqual(["Qc", "Jd"]);
      }
    },
  );

  it("moves the hero player, not just the hero flag", () => {
    let state = emptyTableInput();
    state = tableReducer(state, { type: "toggleSeat", seat: 5 });
    state = tableReducer(state, { type: "setStack", seat: 1, value: formatChipInput(77_000) });
    state = tableReducer(state, { type: "setSeatName", seat: 5, name: "Вилл" });
    state = tableReducer(state, { type: "moveSeat", from: 1, to: 5 });
    expect(state.heroSeat).toBe(5);
    expect(state.stacks[5]).toBe(formatChipInput(77_000));
    expect(state.names[1]).toBe("Вилл");
    expect(state.names[5]).toBeUndefined();
  });
});
