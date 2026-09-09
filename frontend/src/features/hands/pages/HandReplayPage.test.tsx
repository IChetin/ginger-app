import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import type { HandData, HandRead } from "@/api/types/hands";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import { HandReplayPage } from "@/features/hands/pages/HandReplayPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const updateCurrentUser = vi.hoisted(() => vi.fn());
const fetchHand = vi.hoisted(() => vi.fn());
const updateHand = vi.hoisted(() => vi.fn());
const fetchOpponentNames = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    updateCurrentUser: (...args: unknown[]) => updateCurrentUser(...args),
  };
});

vi.mock("@/features/hands/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/hands/api")>("@/features/hands/api");
  return {
    ...actual,
    fetchHand: (...args: unknown[]) => fetchHand(...args),
    updateHand: (...args: unknown[]) => updateHand(...args),
    fetchOpponentNames: (...args: unknown[]) => fetchOpponentNames(...args),
  };
});

vi.mock("@/features/hands/lib/useEquity", () => ({
  useEquity: () => ({ result: null, failed: false }),
}));

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "player",
  base_currency: "RUB",
  timezone: null,
  stack_display: "chips",
  hide_holes_until_showdown: true,
  hand_input_mode: "table",
  card_deck: "four_color",
  results_visibility: "private",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

const data: HandData = {
  schema_version: 1,
  table_size: 2,
  blinds: { sb: 500, bb: 1000, ante: 0 },
  hero_seat: 1,
  button_seat: 1,
  seats: [
    { seat: 1, position: "BTN", name: "Вы", stack: 5000, is_hero: true, cards: ["As", "Kc"] },
    { seat: 2, position: "BB", name: "Вилл", stack: 148000 },
  ],
  streets: [
    {
      street: "preflop",
      board: [],
      actions: [{ seat: 1, action: "fold" }],
    },
  ],
  result: {
    winner_seats: [2],
    pot: 1500,
    hero_invested: 500,
    hero_profit: -500,
    side_pots: null,
  },
};

function handFixture(overrides: Partial<HandData> = {}): HandRead {
  return {
    id: "hand-1",
    slug: "abc",
    status: "published",
    current_step: null,
    current_street: null,
    title: "Тестовая раздача",
    note: null,
    is_public: true,
    views_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    event_id: null,
    series_id: null,
    live_session_id: null,
    event: null,
    series: null,
    author: { nickname: "player" },
    is_owner: true,
    data: { ...data, ...overrides, blinds: { ...data.blinds, ...(overrides.blinds ?? {}) } },
    wizard: null,
  };
}

function renderReplay(slug = "abc") {
  return renderWithProviders(
    <Routes>
      <Route path="/hand/:slug" element={<HandReplayPage />} />
    </Routes>,
    { route: `/hand/${slug}` },
  );
}

describe("HandReplayPage stack display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(handFixture());
  });

  it("replays a hand without hero cards and hides equity", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        seats: [
          { seat: 1, position: "BTN", name: "Вы", stack: 5000, is_hero: true },
          { seat: 2, position: "BB", name: "Вилл", stack: 148000 },
        ],
      }),
    );
    renderReplay();
    expect(await screen.findByTestId("hand-replay")).toBeInTheDocument();
    expect(screen.queryByTestId("replay-equity")).not.toBeInTheDocument();
    const hero = screen.getByTestId("table-seat-1");
    expect(hero.querySelector("[data-cards-edge='column']")).toBeTruthy();
    expect(within(hero).getByTestId("seat-avatar")).toHaveTextContent("BTN");
    const holes = within(hero).getByTestId("seat-holes");
    expect(holes).toBeInTheDocument();
    expect(holes).toHaveAttribute("data-invite", "0");
  });

  it("toggles chips to BB from the header menu and a stack tap", async () => {
    const user = userEvent.setup();
    renderReplay();
    const replay = await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByTestId("replay-controls-extra")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stack-display-toggle")).not.toBeInTheDocument();
    expect(replay.textContent).toContain("147");
    expect(replay.textContent).not.toContain("\u00a0BB");

    await user.click(screen.getByRole("button", { name: "Ещё" }));
    await user.click(screen.getByRole("menuitem", { name: "Показать BB" }));
    await waitFor(() => {
      expect(screen.getAllByText(/BB/).length).toBeGreaterThan(1);
    });
    expect(replay.textContent).toContain("4,5\u00a0BB");
    expect(replay.textContent).toContain("147\u00a0BB");
    expect(updateCurrentUser).toHaveBeenCalledWith({ stack_display: "bb" });

    const stack = screen.getAllByTestId("seat-stack")[0];
    expect(stack).toBeTruthy();
    await user.click(stack!);
    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({ stack_display: "chips" });
    });
  });

  it("hides the toggle when BB is zero", async () => {
    fetchHand.mockResolvedValue(handFixture({ blinds: { sb: 500, bb: 0, ante: 0 } }));
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByTestId("stack-display-toggle")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ещё" }));
    expect(screen.queryByTestId("replay-menu-units")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("seat-stack").length).toBeGreaterThan(0);
  });

  it("restores the saved mode from the profile", async () => {
    fetchCurrentUser.mockResolvedValue({ ...userFixture, stack_display: "bb" });
    renderReplay();
    const replay = await waitFor(() => screen.getByTestId("hand-replay"));
    await waitFor(() => {
      expect(replay.textContent).toContain("4,5\u00a0BB");
    });
    expect(localStorage.getItem(STACK_DISPLAY_STORAGE_KEY)).toBe("bb");
  });
});

describe("HandReplayPage hide holes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(handFixture());
  });

  it("shows opponent cards as backs on the flop and faces only at showdown", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        table_size: 3,
        blinds: { sb: 100, bb: 200, ante: 0 },
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 100000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "SB", name: "Игрок 2", stack: 100000 },
          { seat: 3, position: "BB", name: "Игрок 3", stack: 100000, cards: ["Qh", "Jh"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "call", amount: 200 },
              { seat: 2, action: "call", amount: 200 },
              { seat: 3, action: "check" },
            ],
          },
          {
            street: "flop",
            board: ["Kd", "9h", "2c"],
            actions: [
              { seat: 2, action: "check" },
              { seat: 3, action: "check" },
              { seat: 1, action: "check" },
            ],
          },
        ],
        result: {
          winner_seats: [1],
          pot: 600,
          hero_invested: 200,
          hero_profit: 400,
          side_pots: null,
        },
      }),
    );
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    const opp = within(screen.getByTestId("table-seat-3")).getByTestId("seat-holes");
    expect(opp.textContent ?? "").not.toMatch(/Q|J/);
    expect(within(opp).getAllByTestId("card-back")).toHaveLength(2);
    expect(within(opp).getAllByTestId("card-back")[0]).toHaveTextContent("2");
    expect(
      within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes").textContent,
    ).toMatch(/A|K/);
    expect(screen.queryByTestId("replay-equity")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await goToLastStep(user);
    expect(screen.queryByTestId("replay-equity")).not.toBeInTheDocument();
    expect(screen.getByTestId("replay-made-hands")).toBeInTheDocument();
    expect(screen.getByTestId("replay-made-hand-1")).toHaveTextContent("пара");
    expect(screen.getByTestId("replay-made-hand-3")).toHaveTextContent("старшая карта");
    expect(screen.getByTestId("replay-showdown")).not.toHaveAttribute("open");
  });

  it("replays a stored hand that has a 1-chip bet", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        table_size: 3,
        blinds: { sb: 100, bb: 200, ante: 0 },
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 100000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "SB", name: "Игрок 2", stack: 100000 },
          { seat: 3, position: "BB", name: "Игрок 3", stack: 100000 },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "call", amount: 200 },
              { seat: 2, action: "call", amount: 200 },
              { seat: 3, action: "check" },
            ],
          },
          {
            street: "flop",
            board: ["Kd", "9h", "2c"],
            actions: [
              { seat: 2, action: "bet", amount: 1 },
              { seat: 3, action: "fold" },
              { seat: 1, action: "fold" },
            ],
          },
        ],
        result: {
          winner_seats: [2],
          pot: 601,
          hero_invested: 200,
          hero_profit: -200,
          side_pots: null,
        },
      }),
    );
    renderReplay();
    expect(await screen.findByTestId("hand-replay")).toBeInTheDocument();
    const user = userEvent.setup();
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole("button", { name: "Вперёд" }));
    }
    expect(screen.getByTestId("table-bet-2")).toHaveTextContent("1");
  });

  it("always hides opponent cards until showdown and has no eye toggle", async () => {
    fetchCurrentUser.mockResolvedValue({ ...userFixture, hide_holes_until_showdown: false });
    fetchHand.mockResolvedValue(
      handFixture({
        table_size: 3,
        blinds: { sb: 100, bb: 200, ante: 0 },
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 100000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "SB", name: "Игрок 2", stack: 100000, cards: ["Jc", "Qc"] },
          { seat: 3, position: "BB", name: "Игрок 3", stack: 100000, cards: ["4c", "5c"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "call", amount: 200 },
              { seat: 2, action: "call", amount: 200 },
              { seat: 3, action: "check" },
            ],
          },
        ],
        result: {
          winner_seats: [1],
          pot: 600,
          hero_invested: 200,
          hero_profit: 400,
          side_pots: null,
        },
      }),
    );
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByTestId("hide-holes-toggle")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-seat-2")).getByTestId("seat-holes").textContent,
    ).not.toMatch(/J|Q/);
    expect(
      within(screen.getByTestId("table-seat-3")).getByTestId("seat-holes").textContent,
    ).not.toMatch(/4|5/);
    expect(
      within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes").textContent,
    ).toMatch(/A|K/);
  });
});

describe("HandReplayPage action colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(
      handFixture({
        table_size: 9,
        blinds: { sb: 1000, bb: 2000, ante: 2000 },
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 86000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "SB", name: "Игрок 2", stack: 42000 },
          { seat: 3, position: "BB", name: "Игрок 3", stack: 31000 },
          { seat: 7, position: "CO", name: "Игрок 7", stack: 128000, cards: ["Qh", "Jh"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 7, action: "raise", amount: 6000 },
              { seat: 1, action: "call", amount: 6000 },
              { seat: 2, action: "fold" },
              { seat: 3, action: "fold" },
            ],
          },
        ],
        result: {
          winner_seats: [1],
          pot: 19000,
          hero_invested: 8000,
          hero_profit: 11000,
          side_pots: null,
        },
      }),
    );
  });

  it("colors the table label and the replay log with the same tone", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await user.click(screen.getByRole("button", { name: "Вперёд" }));
    const table = screen.getByText("РЕЙЗ");
    expect(table.getAttribute("data-tone")).toBe("aggress");
    expect(table.getAttribute("data-variant")).toBe("table");
    const log = screen.getByTestId("replay-log");
    const logBadge = log.querySelector('[data-testid="action-badge"]');
    expect(logBadge?.getAttribute("data-tone")).toBe("aggress");
    expect(logBadge?.textContent).toMatch(/рейз до/);
  });

  it("names the fold street in the log and keeps a single fold mark on the seat", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await user.click(screen.getByRole("button", { name: "Вперёд" }));
    await user.click(screen.getByRole("button", { name: "Вперёд" }));
    await user.click(screen.getByRole("button", { name: "Вперёд" }));
    expect(screen.getByTestId("replay-log")).toHaveTextContent("фолд на префлопе");
    const folded = screen.getByTestId("table-seat-2");
    expect(folded.querySelector('[data-testid="seat-fold-street"]')).toBeNull();
    expect(within(folded).getByText("ФОЛД")).toBeInTheDocument();
    expect(within(folded).getByTestId("seat-name-2")).toHaveTextContent("Игрок 2");
  });

  it("keeps navigation under the table and equity below the controls", async () => {
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    const replay = screen.getByTestId("hand-replay");
    expect(replay.className).not.toMatch(/overflow-hidden/);
    const slot = screen.getByTestId("replay-table-slot");
    expect(slot.className).toMatch(/shrink-0/);
    expect(slot.className).toMatch(/100dvh/);
    const cluster = screen.getByTestId("replay-table-cluster");
    expect(cluster.className).toMatch(/sticky/);
    const felt = screen.getByTestId("poker-felt");
    const controls = screen.getByTestId("replay-controls");
    const below = screen.getByTestId("replay-below");
    expect(felt.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(below.className).not.toMatch(/overflow-y-auto/);
  });
});

describe("HandReplayPage seat names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue(["Рег из Минска"]);
    updateHand.mockImplementation(async (_slug: string, body: { data?: HandData }) =>
      handFixture(body.data ?? {}),
    );
    fetchHand.mockResolvedValue(handFixture());
  });

  it("shows opponent names without an edit control", async () => {
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    const name = screen.getByTestId("seat-name-2");
    expect(name).toHaveTextContent("Вилл");
    expect(name).not.toHaveTextContent("✎");
    expect(screen.queryByRole("button", { name: /Переименовать/ })).not.toBeInTheDocument();
  });

  it("does not let a public viewer rename", async () => {
    fetchHand.mockResolvedValue({ ...handFixture(), is_owner: false });
    fetchCurrentUser.mockResolvedValue(null);
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.getByTestId("seat-name-2")).toHaveTextContent("Вилл");
    expect(screen.queryByRole("button", { name: /Переименовать/ })).not.toBeInTheDocument();
  });
});

describe("HandReplayPage header layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue({ ...userFixture, stack_display: "bb" });
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(
      handFixture({ blinds: { sb: 500, bb: 1000, ante: 1000, ante_mode: "bb" } }),
    );
  });

  it("lets the title shrink and keeps actions from shrinking", async () => {
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    const header = screen.getByTestId("sticky-header");
    expect(header.className).toMatch(/safe-area-inset-top/);
    expect(header).toHaveAttribute("data-compact", "true");
    expect(screen.getByTestId("replay-header-title").className).toMatch(/truncate/);
    expect(screen.getByTestId("replay-header-title").parentElement?.className).toMatch(/min-w-0/);
    expect(screen.getByTestId("sticky-header-title").className).toMatch(/min-w-\[80px\]/);
    const blinds = screen.getByTestId("replay-header-blinds");
    expect(blinds.className).toMatch(/truncate/);
    expect(blinds.className).toMatch(/whitespace-nowrap/);
    expect(blinds).toHaveAttribute("title", "0,5/1\u00a0BB · BB-анте 1\u00a0BB");
    expect(screen.getByTestId("replay-header-blinds-compact")).toHaveTextContent(
      "0,5/1 · BB-анте 1",
    );
    expect(screen.getByTestId("replay-header-blinds-full").textContent).toBe(
      "0,5/1\u00a0BB · BB-анте 1\u00a0BB",
    );
    expect(screen.getByTestId("replay-header-logo").className).toMatch(/min-\[420px\]:inline-flex/);
    expect(screen.queryByTestId("hide-holes-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("replay-header-more").className).toMatch(/shrink-0/);
    expect(screen.getByTestId("replay-fullscreen").className).toMatch(/shrink-0/);
    expect(screen.queryByTestId("replay-controls-extra")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stack-display-toggle")).not.toBeInTheDocument();
  });

  it("puts share and edit behind the overflow menu", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ещё" }));
    expect(screen.getByRole("menuitem", { name: "Поделиться" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Показать фишки" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Править" })).toHaveAttribute(
      "href",
      "/hand/abc/edit",
    );
  });

  it("does not offer the overflow menu to a public viewer", async () => {
    fetchHand.mockResolvedValue({
      ...handFixture({ blinds: { sb: 500, bb: 1000, ante: 1000, ante_mode: "bb" } }),
      is_owner: false,
    });
    fetchCurrentUser.mockResolvedValue(null);
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByTestId("replay-header-more")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hide-holes-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("replay-fullscreen")).toBeInTheDocument();
    expect(screen.getByTestId("sticky-header")).toContainElement(
      screen.getByTestId("stack-display-toggle"),
    );
    expect(screen.queryByTestId("replay-controls-extra")).not.toBeInTheDocument();
  });
});

function seatStackText(seat: number): string {
  return (
    within(screen.getByTestId(`table-seat-${seat}`)).getByTestId("seat-stack").textContent ?? ""
  );
}

async function goToLastStep(user: ReturnType<typeof userEvent.setup>) {
  const steps = screen.getAllByRole("button", { name: /^Шаг / });
  await user.click(steps[steps.length - 1]!);
}

describe("HandReplayPage desktop stage and fullscreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(handFixture());
  });

  it("keeps the replay stage in the page column", async () => {
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.getByTestId("replay-stage").className).not.toMatch(/max-w-\[900px\]/);
    expect(screen.getByTestId("replay-stage").className).not.toMatch(/min-\[1024px\]:max-w-none/);
  });

  it("hides the header and the result in fullscreen", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await goToLastStep(user);
    expect(screen.getByTestId("replay-result")).toBeInTheDocument();
    expect(screen.getByTestId("sticky-header")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Развернуть" }));
    expect(screen.getByTestId("hand-replay")).toHaveAttribute("data-fullscreen", "1");
    expect(screen.queryByTestId("sticky-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-equity")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-made-hands")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-log")).not.toBeInTheDocument();
    expect(screen.getByTestId("replay-stage")).toBeInTheDocument();
    expect(screen.getByTestId("replay-controls")).toBeInTheDocument();
    expect(screen.getByTestId("replay-controls-extra")).toContainElement(
      screen.getByTestId("stack-display-toggle"),
    );

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("sticky-header")).toBeInTheDocument();
    expect(screen.getByTestId("replay-result")).toBeInTheDocument();
  });
});

describe("HandReplayPage stacks and result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchOpponentNames.mockResolvedValue([]);
    updateCurrentUser.mockImplementation(
      async (body: { stack_display?: "chips" | "bb"; hide_holes_until_showdown?: boolean }) => ({
        ...userFixture,
        ...body,
      }),
    );
    fetchHand.mockResolvedValue(handFixture());
  });

  it("shows stacks on every step and restores them on rewind", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(seatStackText(1)).toContain("4");
    expect(seatStackText(2)).toContain("147");

    await goToLastStep(user);
    expect(seatStackText(1)).toContain("4");
    expect(seatStackText(2)).toContain("148");

    await user.click(
      within(screen.getByTestId("replay-controls")).getByRole("button", { name: "Назад" }),
    );
    expect(seatStackText(2)).toContain("147");
    expect(seatStackText(2)).not.toContain("148");
  });

  it("shows the winner, the pot and hero profit on the last step", async () => {
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    expect(screen.queryByTestId("replay-result")).not.toBeInTheDocument();

    await goToLastStep(user);
    expect(screen.getByTestId("replay-result-winners")).toHaveTextContent("Вилл забирает банк");
    expect(screen.getByTestId("replay-result-pot")).toHaveTextContent(/Банк/);
    expect(screen.getByTestId("replay-result-hero")).toHaveTextContent("−500");
    expect(screen.getByTestId("table-seat-2")).toHaveAttribute("data-winner", "1");
    expect(screen.getByTestId("pot-to-seat-2")).toBeInTheDocument();
  });

  it("splits the pot between winners", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 100_000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "BB", name: "Villain", stack: 80_000, cards: ["Qh", "Jh"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "allin", amount: 100_000 },
              { seat: 2, action: "allin", amount: 80_000 },
            ],
          },
          { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
          { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
          { street: "river", board: ["Ks", "9h", "4d", "7d", "2c"], actions: [] },
        ],
        result: {
          winner_seats: [1, 2],
          pot: 160_000,
          hero_invested: 80_000,
          hero_profit: 0,
          side_pots: null,
        },
      }),
    );
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await goToLastStep(user);
    expect(screen.getByTestId("replay-result-winners")).toHaveTextContent(
      "Вы и Villain делят банк",
    );
    expect(screen.getByTestId("replay-result-pot")).toHaveTextContent(/каждому/);
    expect(screen.getByTestId("replay-result-hero")).toHaveTextContent("0");
    expect(screen.getByTestId("table-seat-1")).toHaveAttribute("data-winner", "1");
    expect(screen.getByTestId("table-seat-2")).toHaveAttribute("data-winner", "1");
  });

  it("shows the all-in result and remaining stacks", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 100_000,
            is_hero: true,
            cards: ["As", "Kc"],
          },
          { seat: 2, position: "BB", name: "Villain", stack: 80_000, cards: ["Qh", "Jh"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "allin", amount: 100_000 },
              { seat: 2, action: "allin", amount: 80_000 },
            ],
          },
          { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
          { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
          { street: "river", board: ["Ks", "9h", "4d", "7d", "2c"], actions: [] },
        ],
        result: {
          winner_seats: [2],
          pot: 160_000,
          hero_invested: 80_000,
          hero_profit: -80_000,
          side_pots: null,
        },
      }),
    );
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await goToLastStep(user);
    expect(screen.getByTestId("replay-result-winners")).toHaveTextContent("Villain забирает банк");
    expect(screen.getByTestId("replay-result-hero")).toHaveTextContent("−80");
    expect(seatStackText(1)).toContain("20");
    expect(seatStackText(2)).toContain("160");
  });

  it("shows made hands instead of equity on the last step of a 4-way all-in", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        table_size: 4,
        blinds: { sb: 500, bb: 1000, ante: 0 },
        seats: [
          {
            seat: 1,
            position: "BTN",
            name: "Вы",
            stack: 50_000,
            is_hero: true,
            cards: ["Ah", "Ad"],
          },
          { seat: 2, position: "SB", name: "Игрок 2", stack: 50_000, cards: ["Kh", "Kd"] },
          { seat: 3, position: "BB", name: "Игрок 3", stack: 50_000, cards: ["Qh", "Qd"] },
          { seat: 4, position: "UTG", name: "Игрок 4", stack: 50_000, cards: ["7h", "7d"] },
        ],
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 4, action: "allin", amount: 50_000 },
              { seat: 1, action: "allin", amount: 50_000 },
              { seat: 2, action: "allin", amount: 50_000 },
              { seat: 3, action: "allin", amount: 50_000 },
            ],
          },
          { street: "flop", board: ["As", "Kc", "2d"], actions: [] },
          { street: "turn", board: ["As", "Kc", "2d", "3h"], actions: [] },
          { street: "river", board: ["As", "Kc", "2d", "3h", "9c"], actions: [] },
        ],
        result: {
          winner_seats: [1],
          pot: 200_000,
          hero_invested: 50_000,
          hero_profit: 150_000,
          side_pots: null,
        },
      }),
    );
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    const pinAt = (seat: number) => ({
      left: screen.getByTestId(`table-seat-${seat}`).dataset.slotLeft,
      top: screen.getByTestId(`table-seat-${seat}`).dataset.slotTop,
    });
    const firstPins = [1, 2, 3, 4].map(pinAt);
    const lefts = firstPins.map((pin) => Number(pin.left));
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeGreaterThan(30);
    const slotClass = screen.getByTestId("replay-table-slot").className;
    await goToLastStep(user);
    expect([1, 2, 3, 4].map(pinAt)).toEqual(firstPins);
    expect(screen.getByTestId("replay-table-slot").className).toBe(slotClass);
    expect(screen.queryByTestId("replay-equity")).not.toBeInTheDocument();
    expect(screen.getByTestId("replay-made-hand-1")).toHaveTextContent("сет");
    expect(screen.getByTestId("replay-made-hand-2")).toHaveTextContent("сет");
    expect(screen.getByTestId("replay-made-hand-3")).toHaveTextContent("пара");
    expect(screen.getByTestId("replay-made-hand-4")).toHaveTextContent("пара");
    expect(screen.getByTestId("replay-result-winners")).toHaveTextContent("Вы забираете банк");
    expect(screen.getByTestId("replay-result-hero")).toHaveTextContent("+150");
    expect(screen.queryAllByText("ОЛЛ-ИН")).toHaveLength(0);
    const controls = screen.getByTestId("replay-controls");
    const result = screen.getByTestId("replay-result");
    const hands = screen.getByTestId("replay-made-hands");
    const showdown = screen.getByTestId("replay-showdown");
    expect(
      controls.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(result.compareDocumentPosition(hands) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hands.compareDocumentPosition(showdown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(showdown).not.toHaveAttribute("open");
  });

  it("recomputes hero profit from invested chips, not a stale stored value", async () => {
    fetchHand.mockResolvedValue(
      handFixture({
        result: {
          winner_seats: [2],
          pot: 1500,
          hero_invested: 0,
          hero_profit: 0,
          side_pots: null,
        },
      }),
    );
    const user = userEvent.setup();
    renderReplay();
    await waitFor(() => screen.getByTestId("hand-replay"));
    await goToLastStep(user);
    expect(screen.getByTestId("replay-result-hero")).toHaveTextContent("−500");
  });
});
