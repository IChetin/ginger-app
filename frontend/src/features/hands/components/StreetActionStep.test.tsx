import { useReducer } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { formatChips } from "@/features/hands/components/PlayingCard";
import { StreetActionStep } from "@/features/hands/components/StreetActionStep";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import {
  boardPickerIncomplete,
  emptyWizard,
  isEditingAllBoard,
  streetClosed,
  wizardReducer,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { renderWithProviders } from "@/test/render";

function base(overrides: Partial<WizardState> = {}): WizardState {
  const state: WizardState = {
    ...emptyWizard(),
    step: 3,
    occupied: [1, 3, 4, 8],
    tableSize: 9,
    heroSeat: 1,
    buttonSeat: 1,
    heroCards: ["As", "Kd"],
    ...overrides,
  };
  if (overrides.streets && overrides.activeStreetIndex == null) {
    state.activeStreetIndex = Math.max(0, overrides.streets.length - 1);
  }
  return state;
}

function renderStep(initial: WizardState) {
  function Harness() {
    const [state, dispatch] = useReducer(wizardReducer, initial);
    return (
      <>
        <StreetActionStep state={state} dispatch={dispatch} />
        <button
          type="button"
          data-testid="wizard-next"
          disabled={
            boardPickerIncomplete(state) ||
            (!(state.pickingBoard || isEditingAllBoard(state)) && !streetClosed(state))
          }
        >
          Дальше
        </button>
      </>
    );
  }
  return renderWithProviders(<Harness />);
}

function flopWithBet(): WizardState {
  return base({
    furthestStep: 3,
    occupied: [1, 2, 3, 7],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: [
          { seat: 7, action: "call", amount: 2000 },
          { seat: 1, action: "call", amount: 2000 },
          { seat: 2, action: "call", amount: 2000 },
          { seat: 3, action: "check" },
        ],
      },
      {
        street: "flop",
        board: ["Ks", "9h", "4d"],
        actions: [
          { seat: 2, action: "check" },
          { seat: 3, action: "bet", amount: 4000 },
        ],
      },
    ],
  });
}

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const PREFLOP_TO_HEADS_UP = [
  { seat: 4, action: "fold" as const },
  { seat: 5, action: "fold" as const },
  { seat: 6, action: "fold" as const },
  { seat: 7, action: "fold" as const },
  { seat: 8, action: "fold" as const },
  { seat: 9, action: "fold" as const },
  { seat: 1, action: "call" as const, amount: 2000 },
  { seat: 2, action: "fold" as const },
  { seat: 3, action: "check" as const },
];

const PREFLOP_TO_THREE = [
  { seat: 4, action: "fold" as const },
  { seat: 5, action: "fold" as const },
  { seat: 6, action: "fold" as const },
  { seat: 7, action: "fold" as const },
  { seat: 8, action: "fold" as const },
  { seat: 9, action: "fold" as const },
  { seat: 1, action: "call" as const, amount: 2000 },
  { seat: 2, action: "call" as const, amount: 2000 },
  { seat: 3, action: "check" as const },
];

const HEADS_UP_CHECKS = [
  { seat: 3, action: "check" as const },
  { seat: 1, action: "check" as const },
];

function nineMaxToRiver(street: "preflop" | "flop" | "turn" | "river" = "preflop"): WizardState {
  const streets: WizardState["streets"] = [
    { street: "preflop", board: [], actions: PREFLOP_TO_HEADS_UP },
  ];
  if (street !== "preflop") {
    streets.push({
      street: "flop",
      board: ["Ks", "9h", "4d"],
      actions: street === "flop" ? [] : HEADS_UP_CHECKS,
    });
  }
  if (street === "turn" || street === "river") {
    streets.push({
      street: "turn",
      board: ["Ks", "9h", "4d", "7d"],
      actions: street === "turn" ? [] : HEADS_UP_CHECKS,
    });
  }
  if (street === "river") {
    streets.push({
      street: "river",
      board: ["Ks", "9h", "4d", "7d", "2c"],
      actions: [],
    });
  }
  return base({ occupied: NINE, furthestStep: 3, streets });
}

function nineMaxThreeToFlop(): WizardState {
  return base({
    occupied: NINE,
    furthestStep: 3,
    streets: [
      { street: "preflop", board: [], actions: PREFLOP_TO_THREE },
      { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
    ],
  });
}

function deckCard(name: string) {
  return within(screen.getByTestId("card-deck")).getByRole("button", { name });
}

function queuePositions(): string[] {
  return [...screen.getByTestId("street-queue").querySelectorAll("[data-seat]")].map(
    (row) => row.querySelector("span")?.textContent ?? "",
  );
}

describe("StreetActionStep", () => {
  afterEach(() => {
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("lists preflop in action order and highlights the actor", () => {
    renderStep(base());
    expect(queuePositions()).toEqual(["UTG", "HJ", "BTN", "BB"]);
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("4");
    expect(screen.getByText("ходит")).toBeInTheDocument();
    expect(
      screen.getByTestId("street-queue").querySelector('[data-state="acting"]')?.className,
    ).toMatch(/border-line-gold/);
    expect(screen.getAllByTestId("blind-mark").length).toBeGreaterThan(0);
    expect(screen.queryByText("ваш ход")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bet-sizing")).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(screen.getByTestId("street-pot").textContent).toBe(formatChips(4_000));
  });

  it("shows sizing only after choosing raise", async () => {
    const user = userEvent.setup();
    renderStep(base());
    expect(screen.getByRole("button", { name: "Рейз" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Колл/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Чек" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    const sizing = screen.getByTestId("bet-sizing");
    expect(sizing).toBeInTheDocument();
    const input = screen.getByLabelText("Сумма ставки") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe(`мин. ${formatChips(4000)}`);
    expect(screen.getByRole("button", { name: "Рейз" })).toBeDisabled();
    expect(within(sizing).getByText("Размер рейза")).toBeInTheDocument();
    expect(within(sizing).getByText("2×")).toBeInTheDocument();
    expect(within(sizing).getByText("2.5×")).toBeInTheDocument();
    expect(within(sizing).getByText("3×")).toBeInTheDocument();
    expect(within(sizing).getByText("Олл-ин")).toBeInTheDocument();
    expect(sizing.querySelector('[data-size="x3"]')?.textContent?.replace(/\s/g, "")).toContain(
      "6000",
    );
    expect(screen.queryByText("½ банка")).not.toBeInTheDocument();
  });

  it("blocks a raise below the minimum and shows the floor", async () => {
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    const input = screen.getByLabelText("Сумма ставки");
    await user.type(input, "2");
    expect(screen.getByTestId("number-stepper-error")).toHaveTextContent("Минимум");
    expect(screen.getByRole("button", { name: "Рейз" })).toBeDisabled();
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
  });

  it("shows remaining chips when the SB calls a raise to 3 BB", () => {
    renderStep(
      base({
        occupied: [1, 2, 3],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [{ seat: 1, action: "raise", amount: 6000 }],
          },
        ],
      }),
    );
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("2");
    expect(screen.getByRole("button", { name: /Колл/ }).textContent?.replace(/\s/g, "")).toContain(
      "5000",
    );
    expect(screen.getAllByTestId("blind-mark")).toHaveLength(2);
  });

  it("uses pot fractions on the flop sizing card", async () => {
    const user = userEvent.setup();
    renderStep(
      base({
        occupied: [1, 2, 3, 7],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "call", amount: 2000 },
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Бет" }));
    const sizing = screen.getByTestId("bet-sizing");
    expect(within(sizing).getByText("Размер бета")).toBeInTheDocument();
    expect(within(sizing).getByText("⅓ банка")).toBeInTheDocument();
    expect(within(sizing).getByText("½ банка")).toBeInTheDocument();
    expect(within(sizing).getByText("¾ банка")).toBeInTheDocument();
    expect(within(sizing).getByText("Банк")).toBeInTheDocument();
    expect(within(sizing).queryByText("2×")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Сумма ставки")).toHaveValue("");
  });

  it("shows the BB unit on the raise field when BB mode is on", async () => {
    localStorage.setItem(STACK_DISPLAY_STORAGE_KEY, "bb");
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    expect(screen.getByTestId("amount-bb-suffix")).toBeInTheDocument();
    expect(screen.getByTestId("stack-display-toggle")).toBeInTheDocument();
  });

  it("converts a raise typed in BB into chips", async () => {
    localStorage.setItem(STACK_DISPLAY_STORAGE_KEY, "bb");
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    await user.type(screen.getByLabelText("Сумма ставки"), "3");
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    expect(screen.getByText(/рейз до 3/)).toBeInTheDocument();
  });

  it("does not submit a zero raise", async () => {
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    await user.type(screen.getByLabelText("Сумма ставки"), "0");
    expect(screen.getByTestId("number-stepper-error")).toHaveTextContent(
      "Ставка должна быть больше нуля",
    );
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    expect(screen.queryByText(/рейз до/)).not.toBeInTheDocument();
  });

  it("colors five action types on a 9-max street and mutes folded rows", () => {
    renderStep(
      base({
        occupied: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 4, action: "fold" },
              { seat: 5, action: "fold" },
              { seat: 6, action: "fold" },
              { seat: 7, action: "call", amount: 2000 },
              { seat: 8, action: "raise", amount: 6000 },
              { seat: 9, action: "call", amount: 6000 },
              { seat: 1, action: "allin", amount: 200000 },
            ],
          },
        ],
      }),
    );
    const queue = screen.getByTestId("street-queue");
    const toneOf = (seat: number) =>
      queue
        .querySelector(`[data-seat="${seat}"] [data-testid="action-badge"]`)
        ?.getAttribute("data-tone");

    expect(toneOf(4)).toBe("fold");
    expect(toneOf(9)).toBe("call");
    expect(toneOf(8)).toBe("aggress");
    expect(toneOf(1)).toBe("allin");
    expect(screen.getByText(/олл-ин/)).toBeInTheDocument();
    expect(screen.getByText(/колл 6/)).toBeInTheDocument();
    expect(screen.getByText(/рейз до 6/)).toBeInTheDocument();

    const folded = queue.querySelector('[data-seat="4"]');
    expect(folded?.getAttribute("data-folded")).toBe("1");
    expect(folded?.textContent).not.toMatch(/стек/);
    expect(folded?.className).not.toMatch(/opacity-70/);
    expect(folded?.className).toMatch(/text-ink-3/);

    const raiser = queue.querySelector('[data-seat="8"]');
    expect(raiser?.getAttribute("data-folded")).toBe("0");
    expect(raiser?.className).not.toMatch(/opacity-70/);
    expect(raiser?.textContent).toMatch(/стек/);

    const actor = queue.querySelector('[data-state="acting"]');
    expect(actor?.getAttribute("data-seat")).toBe("7");
    expect(actor?.className).toMatch(/border-line-gold/);
    expect(actor?.textContent).toMatch(/ходит/);
    expect(actor?.querySelector('[data-testid="action-badge"]')).toBeNull();
  });

  it("marks a check with the check tone", () => {
    renderStep(
      base({
        occupied: [1, 2, 3, 7],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "call", amount: 2000 },
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          {
            street: "flop",
            board: ["Ks", "9h", "4d"],
            actions: [{ seat: 2, action: "check" }],
          },
        ],
      }),
    );
    const badge = screen
      .getByTestId("street-queue")
      .querySelector('[data-seat="2"] [data-testid="action-badge"]');
    expect(badge?.getAttribute("data-tone")).toBe("check");
    expect(badge?.getAttribute("data-action")).toBe("check");
    expect(badge?.textContent).toBe("чек");
  });

  it("marks folded and waiting rows differently after an action", async () => {
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-seat="4"]')
        ?.getAttribute("data-state"),
    ).toBe("acted");
    expect(screen.getByText("фолд")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-seat="8"]')
        ?.getAttribute("data-state"),
    ).toBe("acting");
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-seat="1"]')
        ?.getAttribute("data-state"),
    ).toBe("waiting");
  });

  it("postflop starts from SB/BB with the button last", () => {
    renderStep(
      base({
        occupied: [1, 2, 3, 7],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "call", amount: 2000 },
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
        ],
      }),
    );
    expect(queuePositions()).toEqual(["SB", "BB", "MP", "BTN"]);
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("2");
    expect(screen.getByRole("button", { name: "Чек" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Бет" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Колл/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("bet-sizing")).not.toBeInTheDocument();
  });

  it("turn keeps postflop order", () => {
    renderStep(
      base({
        occupied: [1, 2, 3, 7],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "call", amount: 2000 },
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          {
            street: "flop",
            board: ["Ks", "9h", "4d"],
            actions: [
              { seat: 2, action: "check" },
              { seat: 3, action: "check" },
              { seat: 7, action: "check" },
              { seat: 1, action: "check" },
            ],
          },
          { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
        ],
      }),
    );
    expect(screen.getByTestId("street-title")).toHaveTextContent("Тёрн");
    expect(queuePositions()).toEqual(["SB", "BB", "MP", "BTN"]);
  });

  it("river keeps postflop order", () => {
    renderStep(
      base({
        occupied: [1, 2, 3, 7],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "call", amount: 2000 },
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          {
            street: "flop",
            board: ["Ks", "9h", "4d"],
            actions: [
              { seat: 2, action: "check" },
              { seat: 3, action: "check" },
              { seat: 7, action: "check" },
              { seat: 1, action: "check" },
            ],
          },
          {
            street: "turn",
            board: ["Ks", "9h", "4d", "7d"],
            actions: [
              { seat: 2, action: "check" },
              { seat: 3, action: "check" },
              { seat: 7, action: "check" },
              { seat: 1, action: "check" },
            ],
          },
          { street: "river", board: ["Ks", "9h", "4d", "7d", "2c"], actions: [] },
        ],
      }),
    );
    expect(screen.getByTestId("street-title")).toHaveTextContent("Ривер");
    expect(queuePositions()).toEqual(["SB", "BB", "MP", "BTN"]);
  });

  it("keeps the next button disabled through an all-in until callers act", async () => {
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    await user.click(screen.getByRole("button", { name: /Олл-ин/ }));
    await user.click(screen.getByRole("button", { name: "Рейз" }));
    expect(screen.getByText(/олл-ин/)).toBeInTheDocument();
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("8");
  });

  it("undoes the last action and restores the actor", async () => {
    const user = userEvent.setup();
    renderStep(base());
    expect(screen.getByTestId("undo-action")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(screen.getByText("фолд")).toBeInTheDocument();
    expect(screen.getByTestId("undo-action")).toBeEnabled();
    await user.click(screen.getByTestId("undo-action"));
    expect(screen.queryByText("фолд")).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("4");
  });

  it("editing a middle action warns and drops the ones after it", async () => {
    const user = userEvent.setup();
    renderStep(base());
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("acted-seat-4"));
    expect(screen.getByText(/правка/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    expect(screen.getByText("Действия после этого будут удалены")).toBeInTheDocument();
    expect(screen.getByText(/Удалятся 1 действие/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    expect(screen.queryByText("фолд")).not.toBeInTheDocument();
    expect(screen.getByText(/колл/)).toBeInTheDocument();
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-state="acting"]')
        ?.getAttribute("data-seat"),
    ).toBe("8");
  });

  it("lets you replace a flop card after actions without dropping them", async () => {
    const user = userEvent.setup();
    renderStep(flopWithBet());
    expect(screen.getByTestId("edit-board")).toBeInTheDocument();
    expect(screen.getByText(/бет/)).toBeInTheDocument();
    await user.click(screen.getByTestId("board-card-0"));
    expect(deckCard("Qs")).toBeEnabled();
    expect(deckCard("As")).toBeDisabled();
    expect(deckCard("Ks")).toHaveAttribute("aria-pressed", "true");
    expect(deckCard("9h")).toBeDisabled();
    await user.click(deckCard("Qs"));
    expect(screen.getByTestId("board-card-0")).toHaveAccessibleName("Qs");
    expect(screen.getByText(/бет/)).toBeInTheDocument();
    expect(screen.queryByText("Действия после этого будут удалены")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("board-card-0"));
    expect(deckCard("Ks")).toBeEnabled();
  });

  it("blocks next while the flop is incomplete in edit mode", async () => {
    const user = userEvent.setup();
    renderStep(flopWithBet());
    await user.click(screen.getByTestId("edit-board"));
    await user.click(screen.getByTestId("board-card-2"));
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(screen.getByText(/бет/)).toBeInTheDocument();
  });

  it("keeps every preflop folder in the queue", () => {
    renderStep(nineMaxToRiver());
    expect(queuePositions()).toHaveLength(9);
    expect(screen.getByTestId("street-living")).toHaveTextContent("Осталось 2 игрока");
    expect(screen.queryByTestId("folded-earlier")).not.toBeInTheDocument();
    expect(screen.getAllByText("фолд")).toHaveLength(7);
  });

  it("hides earlier folders on the flop and keeps a fold on this street", async () => {
    const user = userEvent.setup();
    renderStep(nineMaxThreeToFlop());
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    expect(queuePositions()).toEqual(["SB", "BB", "BTN"]);
    expect(screen.getByTestId("street-living")).toHaveTextContent("Осталось 3 игрока");
    expect(screen.getByTestId("folded-earlier-toggle")).toHaveTextContent(
      "Сбросили ранее: 6 игроков",
    );
    expect(screen.queryByTestId("folded-earlier-list")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("folded-earlier-toggle"));
    expect(screen.getByTestId("folded-earlier-4")).toHaveTextContent("Игрок 4 · фолд на префлопе");
    expect(screen.getByTestId("folded-earlier-9")).toHaveTextContent("Игрок 9 · фолд на префлопе");
    await user.click(screen.getByTestId("folded-earlier-toggle"));
    expect(screen.queryByTestId("folded-earlier-list")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(queuePositions()).toEqual(["SB", "BB", "BTN"]);
    expect(
      screen
        .getByTestId("street-queue")
        .querySelector('[data-seat="2"]')
        ?.getAttribute("data-folded"),
    ).toBe("1");
    expect(screen.getByTestId("street-living")).toHaveTextContent("Осталось 2 игрока");
    expect(screen.getByTestId("folded-earlier-toggle")).toHaveTextContent(
      "Сбросили ранее: 6 игроков",
    );
  });

  it("shows two of nine on the turn with earlier folds collapsed", () => {
    renderStep(nineMaxToRiver("turn"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Тёрн");
    expect(queuePositions()).toEqual(["BB", "BTN"]);
    expect(screen.getByTestId("street-living")).toHaveTextContent("Осталось 2 игрока");
    expect(screen.getByTestId("folded-earlier-toggle")).toHaveTextContent(
      "Сбросили ранее: 7 игроков",
    );
  });

  it("shows two of nine on the river and lists earlier folds by street", async () => {
    const user = userEvent.setup();
    renderStep(nineMaxToRiver("river"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Ривер");
    expect(queuePositions()).toEqual(["BB", "BTN"]);
    expect(screen.getByTestId("street-living")).toHaveTextContent("Осталось 2 игрока");
    await user.click(screen.getByTestId("folded-earlier-toggle"));
    expect(screen.getByTestId("folded-earlier-2")).toHaveTextContent("Игрок 2 · фолд на префлопе");
    expect(screen.getByTestId("folded-earlier-4")).toHaveTextContent("Игрок 4 · фолд на префлопе");
  });
});

const FOUR = [1, 2, 3, 7];

const PREFLOP_LIMP = [
  { seat: 7, action: "call" as const, amount: 2000 },
  { seat: 1, action: "call" as const, amount: 2000 },
  { seat: 2, action: "call" as const, amount: 2000 },
  { seat: 3, action: "check" as const },
];

const FLOP_CHECKS = [
  { seat: 2, action: "check" as const },
  { seat: 3, action: "check" as const },
  { seat: 7, action: "check" as const },
  { seat: 1, action: "check" as const },
];

function pickingFlop(): WizardState {
  return base({
    occupied: FOUR,
    furthestStep: 3,
    pickingBoard: true,
    boardDraft: [],
    streets: [{ street: "preflop", board: [], actions: PREFLOP_LIMP }],
    activeStreetIndex: 0,
  });
}

function pickingTurn(): WizardState {
  return base({
    occupied: FOUR,
    furthestStep: 3,
    pickingBoard: true,
    boardDraft: ["Ks", "9h", "4d"],
    streets: [
      { street: "preflop", board: [], actions: PREFLOP_LIMP },
      { street: "flop", board: ["Ks", "9h", "4d"], actions: FLOP_CHECKS },
    ],
    activeStreetIndex: 1,
  });
}

function pickingRiver(): WizardState {
  return base({
    occupied: FOUR,
    furthestStep: 3,
    pickingBoard: true,
    boardDraft: ["Ks", "9h", "4d", "7d"],
    streets: [
      { street: "preflop", board: [], actions: PREFLOP_LIMP },
      { street: "flop", board: ["Ks", "9h", "4d"], actions: FLOP_CHECKS },
      { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: FLOP_CHECKS },
    ],
    activeStreetIndex: 2,
  });
}

describe("StreetActionStep board by street", () => {
  it("asks for three flop cards and blocks done until they are picked", async () => {
    const user = userEvent.setup();
    renderStep(pickingFlop());
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    expect(screen.getByTestId("board-picker-hint")).toHaveTextContent("выберите три карты");
    expect(screen.queryByTestId("board-previous")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("board-current").querySelectorAll("[data-testid^='board-card-']"),
    ).toHaveLength(3);
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    await user.click(deckCard("Ks"));
    await user.click(deckCard("9h"));
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    await user.click(deckCard("4d"));
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
    expect(deckCard("Ks")).toBeDisabled();
    expect(deckCard("Ks")).toHaveAttribute("aria-pressed", "false");
  });

  it("groups muted flop cards on the turn and highlights only the turn slot", () => {
    renderStep(pickingTurn());
    expect(screen.getByTestId("street-title")).toHaveTextContent("Тёрн");
    expect(screen.getByTestId("board-picker-hint")).toHaveTextContent("выберите карту");
    expect(
      screen.getByTestId("board-group-flop").querySelectorAll("[data-muted='1']"),
    ).toHaveLength(3);
    expect(screen.getByTestId("board-current")).toContainElement(
      screen.getByTestId("board-card-3"),
    );
    expect(screen.getByTestId("board-card-3").getAttribute("data-muted")).toBe("0");
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(deckCard("Ks")).toBeDisabled();
    expect(deckCard("Ks")).toHaveAttribute("aria-pressed", "false");
  });

  it("groups flop and turn on the river and lets you replace a previous card", async () => {
    const user = userEvent.setup();
    renderStep(pickingRiver());
    expect(screen.getByTestId("street-title")).toHaveTextContent("Ривер");
    expect(screen.getByTestId("board-picker-hint")).toHaveTextContent("выберите карту");
    expect(screen.getByTestId("board-group-flop")).toBeInTheDocument();
    expect(screen.getByTestId("board-group-turn")).toBeInTheDocument();
    expect(screen.getByTestId("board-current")).toContainElement(
      screen.getByTestId("board-card-4"),
    );
    expect(screen.getByTestId("wizard-next")).toBeDisabled();

    await user.click(screen.getByTestId("board-card-1"));
    expect(screen.getByTestId("board-picker-hint")).toHaveTextContent("Меняете 2-ю карту флопа");
    expect(deckCard("9h")).toHaveAttribute("aria-pressed", "true");
    expect(deckCard("Ks")).toBeDisabled();
    expect(deckCard("Ks")).toHaveAttribute("aria-pressed", "false");

    await user.click(deckCard("Qs"));
    expect(screen.getByTestId("board-card-1")).toHaveAccessibleName("Qs");
    expect(screen.getByTestId("board-picker-hint")).toHaveTextContent("выберите карту");
    expect(screen.getByTestId("board-card-4").getAttribute("data-muted")).toBe("0");

    await user.click(deckCard("2c"));
    expect(screen.getByTestId("board-card-4")).toHaveAccessibleName("2c");
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
  });
});

describe("all-in runout has no betting UI", () => {
  function allInFlop(overrides: Partial<WizardState> = {}): WizardState {
    return base({
      furthestStep: 3,
      tableSize: 2,
      occupied: [1, 2],
      blinds: { sb: 500, bb: 1000, ante: 0 },
      stacks: { 1: "100000", 2: "80000" },
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "allin", amount: 100000 },
            { seat: 2, action: "allin", amount: 80000 },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      activeStreetIndex: 1,
      ...overrides,
    });
  }

  it("hides the action pad and enables next when nobody can call", () => {
    renderStep(allInFlop());
    expect(screen.getByTestId("street-allin-runout")).toHaveTextContent(
      "Все игроки в олл-ине — торговли нет, раздаются карты",
    );
    expect(screen.queryByRole("button", { name: "Бет" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Чек" })).toBeNull();
    expect(screen.getByTestId("street-queue").querySelectorAll("[data-seat]").length).toBe(2);
    expect(screen.getByTestId("street-queue").querySelector('[data-state="acting"]')).toBeNull();
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
  });

  it("keeps betting when two players still have chips and a third is all-in", () => {
    renderStep(
      base({
        furthestStep: 3,
        occupied: [1, 2, 3],
        blinds: { sb: 1000, bb: 2000, ante: 0 },
        stacks: { 1: "100000", 2: "100000", 3: "5000" },
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "allin", amount: 5000 },
              { seat: 1, action: "call", amount: 5000 },
              { seat: 2, action: "call", amount: 5000 },
            ],
          },
          { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
        ],
        activeStreetIndex: 1,
      }),
    );
    expect(screen.queryByTestId("street-allin-runout")).toBeNull();
    expect(screen.getByRole("button", { name: "Чек" })).toBeInTheDocument();
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
  });
});
