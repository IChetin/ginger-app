import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import type { HandListItem } from "@/api/types/hands";
import { isHandSlug } from "@/features/hands/lib/handSlug";
import { HandsListPage } from "@/features/hands/pages/HandsListPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchHands = vi.hoisted(() => vi.fn());
const fetchHandEvents = vi.hoisted(() => vi.fn());
const updateHand = vi.hoisted(() => vi.fn());
const copyText = vi.hoisted(() => vi.fn());
const shareOrCopyUrl = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/lib/share", async () => {
  const actual = await vi.importActual<typeof import("@/lib/share")>("@/lib/share");
  return {
    ...actual,
    copyText: (...args: unknown[]) => copyText(...args),
    shareOrCopyUrl: (...args: unknown[]) => shareOrCopyUrl(...args),
  };
});

vi.mock("@/features/hands/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/hands/api")>("@/features/hands/api");
  return {
    ...actual,
    fetchHands: (...args: unknown[]) => fetchHands(...args),
    fetchHandEvents: (...args: unknown[]) => fetchHandEvents(...args),
    updateHand: (...args: unknown[]) => updateHand(...args),
  };
});

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

function itemFixture(overrides: Partial<HandListItem> = {}): HandListItem {
  return {
    id: "hand-1",
    slug: "abc123slug",
    status: "published",
    current_step: null,
    current_street: null,
    title: "AK на флопе",
    note: null,
    is_public: true,
    views_count: 2,
    created_at: "2026-08-19T12:00:00Z",
    updated_at: "2026-08-19T12:00:00Z",
    preview: {
      hero_cards: ["As", "Kd"],
      board: ["Ah", "Kh", "Qh", "Jh", "Th"],
      hero_profit: 12_000,
      pot: 40_000,
    },
    event: null,
    ...overrides,
  };
}

describe("HandsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyText.mockResolvedValue(true);
    shareOrCopyUrl.mockResolvedValue("copied");
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchHandEvents.mockResolvedValue([]);
    fetchHands.mockResolvedValue({ items: [itemFixture()], total: 1 });
    updateHand.mockImplementation(async (_slug: string, body: { note?: string | null }) =>
      itemFixture({ note: body.note ?? null }),
    );
  });

  it("copies the public link from the caption and shows confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    await screen.findByTestId("hand-card-abc123slug");
    await user.click(screen.getByTestId("hand-copy-link"));
    await waitFor(() => expect(copyText).toHaveBeenCalled());
    expect(copyText.mock.calls[0]?.[0]).toMatch(/\/hand\/abc123slug$/);
    expect(screen.getByTestId("copy-toast")).toHaveTextContent("Ссылка скопирована");
    expect(screen.getByTestId("hand-copy-link")).toHaveTextContent("скопировано");
  });

  it("labels a private hand without a copy action", async () => {
    fetchHands.mockResolvedValue({
      items: [itemFixture({ id: "hand-2", slug: "privatesl", is_public: false })],
      total: 1,
    });
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    await screen.findByTestId("hand-card-privatesl");
    expect(screen.getByTestId("hand-private-label")).toHaveTextContent("приватная");
    expect(screen.queryByTestId("hand-copy-link")).not.toBeInTheDocument();
  });

  it("opens the card menu in a portal and copies from Share on desktop", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    const card = await screen.findByTestId("hand-card-abc123slug");
    await user.click(screen.getByTestId("hand-card-menu-btn"));
    const menu = await screen.findByTestId("portal-menu");
    expect(document.body).toContainElement(menu);
    expect(card).not.toContainElement(menu);
    await user.click(within(menu).getByRole("menuitem", { name: "Поделиться" }));
    await waitFor(() => expect(shareOrCopyUrl).toHaveBeenCalled());
    expect(shareOrCopyUrl.mock.calls[0]?.[0]).toMatchObject({
      url: expect.stringMatching(/\/hand\/abc123slug$/),
    });
    expect(screen.getByTestId("copy-toast")).toHaveTextContent("Ссылка скопирована");
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    await screen.findByTestId("hand-card-abc123slug");
    await user.click(screen.getByTestId("hand-card-menu-btn"));
    expect(screen.getByTestId("portal-menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("portal-menu")).not.toBeInTheDocument();
  });

  it("keeps the board row from overflowing the card", async () => {
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    const board = await screen.findByTestId("hand-card-board");
    expect(board.className).toMatch(/overflow-hidden/);
    expect(board.className).toMatch(/min-w-0/);
  });

  it("shows a draft badge and continue action without share", async () => {
    const user = userEvent.setup();
    fetchHands.mockResolvedValue({
      items: [
        itemFixture({
          id: "draft-1",
          slug: "dR4ftSlugA",
          status: "draft",
          current_step: 2,
          current_street: null,
          is_public: false,
        }),
      ],
      total: 1,
    });
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    const card = await screen.findByTestId("hand-card-dR4ftSlugA");
    expect(card.className).toMatch(/border-dashed/);
    expect(screen.getByTestId("hand-draft-badge")).toHaveTextContent("Черновик");
    expect(screen.queryByTestId("hand-copy-link")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("hand-card-menu-btn"));
    const menu = await screen.findByTestId("portal-menu");
    expect(within(menu).getByRole("menuitem", { name: "Продолжить" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Поделиться" })).not.toBeInTheDocument();
  });

  it("edits a note from the card menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    await screen.findByTestId("hand-card-abc123slug");
    expect(screen.queryByTestId("hand-card-note")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("hand-card-menu-btn"));
    await user.click(screen.getByRole("menuitem", { name: "Заметка" }));
    const input = screen.getByTestId("hand-note-input");
    await user.type(input, "блеф на ривере");
    await user.click(screen.getByTestId("hand-note-save"));
    await waitFor(() => expect(updateHand).toHaveBeenCalled());
    expect(updateHand.mock.calls[0]?.[1]).toMatchObject({ note: "блеф на ривере" });
  });

  it("renders demo hands for a guest with banner and auth gate", async () => {
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <HandsListPage />
        <LocationProbe />
      </>,
      { route: "/hands" },
    );
    const page = await screen.findByTestId("hands-list");
    expect(page).toHaveAttribute("data-demo", "true");
    expect(screen.getByTestId("sticky-header-title")).toHaveTextContent("Раздачи");
    expect(screen.getByTestId("demo-banner")).toHaveTextContent("Пример данных");
    expect(screen.getByTestId("auth-gate")).toHaveTextContent("Ваши раздачи и разборы");
    expect(await screen.findByTestId("hand-card-demo-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Новая раздача" })).toBeInTheDocument();
    const login = screen.getByTestId("auth-gate").querySelector("a[href='/login']");
    expect(login).toBeTruthy();
    await user.click(login!);
    expect(screen.getByTestId("location")).toHaveTextContent('"returnTo":"/hands"');
  });

  it("opens a new draft on a unique final slug", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/hands" element={<HandsListPage />} />
        <Route
          path="/hand/:slug"
          element={<HandDest />}
        />
      </Routes>,
      { route: "/hands" },
    );
    await screen.findByTestId("hand-card-abc123slug");
    await user.click(screen.getByRole("button", { name: "Новая раздача" }));
    const dest = await screen.findByTestId("hand-dest");
    expect(isHandSlug(dest.textContent ?? "")).toBe(true);
  });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify(location)}</output>;
}

function HandDest() {
  const { slug } = useParams<{ slug: string }>();
  return <div data-testid="hand-dest">{slug}</div>;
}
});
