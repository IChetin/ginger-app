import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkListItem } from "@/api/types/bookmarks";
import { listDemoBookmarks } from "@/demo/bookmarks";
import { BookmarksPage } from "@/features/bookmarks/BookmarksPage";
import { renderWithProviders } from "@/test/render";

const flightItem: BookmarkListItem = {
  key: "bookmark-flight-1",
  source: "server",
  bookmarkId: "bookmark-flight-1",
  target_type: "flight",
  target_id: "flight-1",
  reminder_offsets: [1440, 120],
  created_at: "2026-01-01T00:00:00Z",
  series_id: "series-1",
  event_id: "event-1",
  series_name: "RPT Kaliningrad",
  series_status: "running",
  series_starts_on: "2027-08-01",
  series_ends_on: "2027-08-11",
  organizer_name: "RPT",
  organizer_slug: "rpt",
  venue_name: "Sobranie",
  venue_city: "Калининград",
  event_number: 5,
  event_name: "Main Event",
  flight_label: "Day 1A",
  nearest_start_at: {
    utc: "2027-08-02T17:00:00.000Z",
    venue_local: "2027-08-02T19:00:00+02:00",
    venue_timezone: "Europe/Kaliningrad",
  },
  url: "/events/rpt-demo-1-main-event",
};

const seriesItem: BookmarkListItem = {
  key: "bookmark-series-1",
  source: "server",
  bookmarkId: "bookmark-series-1",
  target_type: "series",
  target_id: "series-1",
  reminder_offsets: [],
  created_at: "2026-01-01T00:00:00Z",
  series_id: "series-1",
  event_id: null,
  series_name: "RPT Kaliningrad",
  series_status: "running",
  series_starts_on: "2027-08-01",
  series_ends_on: "2027-08-11",
  organizer_name: "RPT",
  organizer_slug: "rpt",
  venue_name: "Sobranie",
  venue_city: "Калининград",
  event_number: null,
  event_name: null,
  flight_label: null,
  nearest_start_at: null,
  url: "/series/rpt-demo",
};

const pastFlightItem: BookmarkListItem = {
  ...flightItem,
  key: "bookmark-flight-past",
  bookmarkId: "bookmark-flight-past",
  target_id: "flight-past",
  series_name: "RPT Sochi 2020",
  series_status: "finished",
  series_starts_on: "2020-01-01",
  series_ends_on: "2020-01-05",
  event_number: 1,
  event_name: "Old Event",
  nearest_start_at: {
    utc: "2020-01-02T17:00:00.000Z",
    venue_local: "2020-01-02T20:00:00+03:00",
    venue_timezone: "Europe/Moscow",
  },
};

const pastSeriesItem: BookmarkListItem = {
  ...seriesItem,
  key: "bookmark-series-past",
  bookmarkId: "bookmark-series-past",
  target_id: "series-past",
  series_name: "EAPT Minsk 2020",
  series_status: "running",
  series_starts_on: "2020-02-01",
  series_ends_on: "2020-02-10",
  nearest_start_at: null,
};

const listState = {
  items: [flightItem, seriesItem] as BookmarkListItem[],
  isLoading: false,
  isError: false,
  isGuest: false,
  refetch: vi.fn(),
  source: "server" as "server" | "guest" | "demo",
};

const meState = {
  data: { id: "user-1" } as { id: string } | undefined,
  isLoading: false,
};

const scheduleDelete = vi.fn();
const undo = vi.fn();
const mutateAsync = vi.fn();

vi.mock("@/features/auth/hooks", () => ({
  useMe: () => meState,
}));

vi.mock("@/features/bookmarks/hooks", () => ({
  useBookmarkListItems: () => listState,
  useUpdateBookmark: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/features/bookmarks/hooks/useDeferredBookmarkDelete", () => ({
  useDeferredBookmarkDelete: () => ({
    pendingItem: null,
    scheduleDelete,
    undo,
  }),
}));

describe("BookmarksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listState.items = [flightItem, seriesItem];
    listState.isGuest = false;
    listState.source = "server";
    listState.isLoading = false;
    listState.isError = false;
    meState.data = { id: "user-1" };
    meState.isLoading = false;
  });

  it("renders upcoming flights and series for authenticated user", () => {
    renderWithProviders(<BookmarksPage />);

    expect(screen.getByRole("heading", { name: "Закладки" })).toBeInTheDocument();
    expect(screen.getByText("#5 Main Event · Day 1A")).toBeInTheDocument();
    expect(screen.getByText("RPT Kaliningrad")).toBeInTheDocument();
    expect(screen.getByText(/за 24 ч и 2 ч/)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-gate")).not.toBeInTheDocument();
  });

  it("links to notifications inbox instead of history tab", () => {
    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    expect(screen.queryByRole("button", { name: "История" })).not.toBeInTheDocument();
    const link = screen.getByTestId("bookmarks-all-notifications");
    expect(link).toHaveAttribute("href", "/notifications");
  });

  it("guest notifications link goes through login", () => {
    meState.data = undefined;
    listState.isGuest = true;
    renderWithProviders(<BookmarksPage />);

    const link = screen.getByTestId("bookmarks-all-notifications");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows auth gate and hides interval pills for guest", () => {
    meState.data = undefined;
    listState.isGuest = true;
    listState.source = "guest";

    renderWithProviders(<BookmarksPage />);

    expect(screen.getByTestId("auth-gate")).toHaveTextContent("Напоминания о турнирах");
    expect(screen.getByTestId("guest-bookmarks-banner")).toHaveTextContent(
      "Войдите, чтобы получать напоминания на всех устройствах",
    );
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Закладки" })).toBeInTheDocument();
    const loginLinks = screen.getAllByRole("link", { name: "Войти" });
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
    expect(loginLinks.every((link) => link.getAttribute("href") === "/login")).toBe(true);
    expect(screen.getByRole("link", { name: "Зарегистрироваться" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.queryByText(/за 24 ч и 2 ч/)).not.toBeInTheDocument();
  });

  it("renders demo bookmarks for a guest without own items", async () => {
    meState.data = undefined;
    listState.isGuest = true;
    listState.source = "demo";
    listState.items = listDemoBookmarks();
    const user = userEvent.setup();

    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    const page = screen.getByTestId("bookmarks-page");
    expect(page).toHaveAttribute("data-demo", "true");
    expect(screen.getByTestId("demo-banner")).toHaveTextContent("Пример данных");
    expect(screen.queryByTestId("guest-bookmarks-banner")).not.toBeInTheDocument();
    expect(screen.getByText("#5 Main Event · Day 1A")).toBeInTheDocument();
    expect(screen.getByText("5 ч")).toBeInTheDocument();
    expect(screen.getByText(/за 24 ч и 2 ч/)).toBeInTheDocument();
    expect(screen.getByText(/за 48 ч, 24 ч и 6 ч/)).toBeInTheDocument();
    expect(screen.getByText("сообщим, когда выйдет сетка")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#5 Main Event · Day 1A" })).toHaveAttribute(
      "href",
      "/events/eapt-batumi-2026-10-5-main-event",
    );
    expect(screen.getByRole("link", { name: "Russian Poker Tour Минск" })).toHaveAttribute(
      "href",
      "/series/rpt-minsk-2026-09",
    );
    expect(screen.getByTestId("auth-gate")).toHaveTextContent("Напоминания о турнирах");

    await user.click(screen.getAllByLabelText("Отключить напоминание")[0]);
    expect(scheduleDelete).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Войдите, чтобы управлять закладками" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-login-sheet")).toBeInTheDocument();
  });

  it("blocks reminder interval edits in demo mode", async () => {
    meState.data = undefined;
    listState.isGuest = true;
    listState.source = "demo";
    listState.items = listDemoBookmarks();
    const user = userEvent.setup();

    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    await user.click(screen.getByText(/за 24 ч и 2 ч/));
    expect(screen.queryByTestId("interval-sheet")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Войдите, чтобы управлять закладками" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-login-sheet")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("schedules deferred delete from flight row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookmarksPage />);

    await user.click(screen.getByLabelText("Отключить напоминание"));
    expect(scheduleDelete).toHaveBeenCalledWith(
      expect.objectContaining({ key: "bookmark-flight-1" }),
    );
  });

  it("opens interval sheet and PATCHes offsets", async () => {
    mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<BookmarksPage />);

    await user.click(screen.getByText(/за 24 ч и 2 ч/));
    expect(await screen.findByTestId("interval-sheet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        bookmarkId: "bookmark-flight-1",
        body: { reminder_offsets: [1440, 120] },
      });
    });
  });

  // BUG-3: past series and flights used to sit in the upcoming sections.
  it("moves past bookmarks into the «Прошедшие» section", () => {
    listState.items = [flightItem, seriesItem, pastFlightItem, pastSeriesItem];
    renderWithProviders(<BookmarksPage />);

    const pastSection = screen.getByTestId("bookmarks-past");
    expect(within(pastSection).getByText("#1 Old Event · Day 1A")).toBeInTheDocument();
    expect(within(pastSection).getByText("EAPT Minsk 2020")).toBeInTheDocument();

    const upcomingFlights = screen.getAllByTestId("bookmark-flight-row");
    expect(upcomingFlights).toHaveLength(2);
    expect(within(pastSection).getAllByTestId("bookmark-flight-row")).toHaveLength(1);
    // Reminder intervals are meaningless for a finished flight.
    expect(within(pastSection).queryByText(/за 24 ч и 2 ч/)).not.toBeInTheDocument();
  });

  it("keeps the past section out of the page when everything is upcoming", () => {
    renderWithProviders(<BookmarksPage />);
    expect(screen.queryByTestId("bookmarks-past")).not.toBeInTheDocument();
  });

  it("shows empty state", () => {
    listState.items = [];
    renderWithProviders(<BookmarksPage />);
    expect(screen.getByTestId("bookmarks-empty")).toBeInTheDocument();
  });

  it("hides the empty-list card when guest sees the auth gate", () => {
    meState.data = undefined;
    listState.isGuest = true;
    listState.items = [];
    renderWithProviders(<BookmarksPage />);
    expect(screen.getByTestId("auth-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("bookmarks-empty")).not.toBeInTheDocument();
  });

  it("does not show a settings gear that duplicates bottom-nav profile", () => {
    renderWithProviders(<BookmarksPage />);
    expect(screen.queryByLabelText("Настройки напоминаний")).not.toBeInTheDocument();
  });
});
