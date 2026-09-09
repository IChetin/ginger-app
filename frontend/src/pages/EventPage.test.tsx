import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import { ApiError } from "@/api/client";
import type { EventDetail } from "@/api/types/schedule";
import { AppRoutes } from "@/App";
import { clearGuestBookmarks, putGuestBookmark } from "@/features/bookmarks/lib/guestBookmarksIdb";
import type { LocalLiveSession } from "@/features/live/hooks";
import { eventDetailFixture, seriesItemFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchEventDetail = vi.fn();
const fetchCurrentUser = vi.fn();
const fetchScheduleFilters = vi.fn();
const fetchSeriesList = vi.fn();
const fetchSeriesDetail = vi.fn();

const { liveSessionRef, startLinked } = vi.hoisted(() => ({
  liveSessionRef: { current: null as import("@/features/live/lib/liveIdb").LocalLiveSession | null },
  startLinked: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchEventDetail: (...args: unknown[]) => fetchEventDetail(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    fetchScheduleFilters: (...args: unknown[]) => fetchScheduleFilters(...args),
    fetchSeriesList: (...args: unknown[]) => fetchSeriesList(...args),
    fetchSeriesDetail: (...args: unknown[]) => fetchSeriesDetail(...args),
  };
});

vi.mock("@/features/live/hooks", () => ({
  useActiveLiveSession: () => ({
    data: liveSessionRef.current,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useLiveCandidates: () => ({ data: [], isLoading: false, isError: false }),
  useLivePendingCount: () => ({ count: 0, refresh: vi.fn() }),
  visibleEvents: (session: { events: { deleted_at?: string | null }[] }) =>
    session.events.filter((item) => !item.deleted_at),
  useLiveActions: () => ({
    startLinked: { mutateAsync: startLinked, isPending: false, reset: vi.fn(), isError: false },
    startManual: { mutateAsync: vi.fn(), isPending: false },
    addReentry: { mutateAsync: vi.fn() },
    addNote: { mutateAsync: vi.fn() },
    patchEvent: { mutateAsync: vi.fn() },
    removeEvent: { mutateAsync: vi.fn() },
    finish: {
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
      error: null,
    },
    cancel: { mutateAsync: vi.fn() },
    dismissConflict: { mutateAsync: vi.fn() },
  }),
}));

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "ace",
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

function liveSessionFixture(eventId: string): LocalLiveSession {
  return {
    id: "live-1",
    event_id: eventId,
    flight_id: "flight-1a",
    manual_name: null,
    manual_venue: null,
    manual_buyin: null,
    manual_currency: null,
    started_at: "2026-08-31T10:00:00.000Z",
    finished_at: null,
    status: "active",
    place: null,
    field_size: null,
    payout: null,
    result_id: null,
    display_name: "#5 Main Event",
    display_series: "RPT Kaliningrad",
    buyin: "44000.00",
    currency: { code: "RUB", symbol: "₽" },
    reentry_allowed: true,
    events: [],
    created_at: "2026-08-31T10:00:00.000Z",
    updated_at: "2026-08-31T10:00:00.000Z",
  };
}

const seriesSlug = "rpt-kaliningrad-2026-08";
const eventSlug = "5-main-event";
const eventPublicPath = `/events/${seriesSlug}-${eventSlug}`;

const baseEvent: EventDetail = {
  ...eventDetailFixture,
  id: "event-me",
  slug: eventSlug,
  number: 5,
  name: "Main Event",
  buyin: "44000.00",
  guarantee: "20000000.00",
  start_stack: 50000,
  reentry_count: 1,
  late_reg_level: 10,
  venue: {
    ...seriesItemFixture.venue,
    name: "Sobranie Casino",
    city: "Калининград",
    zone: "Янтарная",
    timezone: "Europe/Kaliningrad",
    address: "Калининградская обл., пос. Куликово",
  },
  series: {
    ...seriesItemFixture,
    id: "series-kaliningrad",
    slug: seriesSlug,
    name: "RPT Kaliningrad",
    venue: {
      ...seriesItemFixture.venue,
      timezone: "Europe/Kaliningrad",
      address: null,
    },
  },
  flights: [
    {
      id: "flight-1a",
      label: "Day 1A",
      start_at: {
        utc: "2026-08-02T17:00:00+00:00",
        venue_local: "2026-08-02T19:00:00+02:00",
        venue_timezone: "Europe/Kaliningrad",
      },
    },
    {
      id: "flight-1b",
      label: "Day 1B",
      start_at: {
        utc: "2026-08-03T17:00:00+00:00",
        venue_local: "2026-08-03T19:00:00+02:00",
        venue_timezone: "Europe/Kaliningrad",
      },
    },
  ],
  blind_levels: [
    {
      level_no: 1,
      structure_set_label: "default",
      sb: 100,
      bb: 200,
      ante: 200,
      minutes: 40,
      is_break: false,
      is_late_reg_end: false,
    },
    {
      level_no: 2,
      structure_set_label: "default",
      sb: 200,
      bb: 400,
      ante: 400,
      minutes: 40,
      is_break: false,
      is_late_reg_end: false,
    },
    {
      level_no: 3,
      structure_set_label: "default",
      sb: null,
      bb: null,
      ante: null,
      minutes: 15,
      is_break: true,
      is_late_reg_end: false,
    },
    ...Array.from({ length: 9 }, (_, index) => ({
      level_no: index + 4,
      structure_set_label: "default",
      sb: 100 * (index + 3),
      bb: 200 * (index + 3),
      ante: 200 * (index + 3),
      minutes: 40,
      is_break: false,
      is_late_reg_end: index + 4 === 10,
    })),
  ],
};

describe("EventPage", () => {
  beforeEach(async () => {
    await clearGuestBookmarks();
    liveSessionRef.current = null;
    startLinked.mockClear();
    fetchEventDetail.mockResolvedValue(baseEvent);
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    fetchScheduleFilters.mockResolvedValue({
      countries: [],
      zones: [],
      organizers: [],
      statuses: [],
      game_types: [],
      tags: [],
    });
    fetchSeriesList.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    fetchSeriesDetail.mockResolvedValue({
      ...seriesItemFixture,
      id: "series-kaliningrad",
      slug: seriesSlug,
      name: "RPT Kaliningrad",
      events_by_day: [],
      description: null,
      links: {},
    });
  });

  it("shows loading skeleton then data", async () => {
    let resolveEvent: (value: EventDetail) => void = () => undefined;
    fetchEventDetail.mockReturnValue(
      new Promise<EventDetail>((resolve) => {
        resolveEvent = resolve;
      }),
    );
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(screen.getByTestId("event-skeleton")).toBeInTheDocument();
    resolveEvent(baseEvent);
    expect(await screen.findByTestId("event-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /#5\s*Main Event/ })).toBeInTheDocument();
    expect(screen.getByTestId("fact-buyin")).toHaveTextContent("44 000");
    expect(screen.getByTestId("venue-card")).toHaveTextContent("Sobranie Casino");
    expect(screen.getByTestId("venue-card")).toHaveTextContent("Куликово");
  });

  it("shows nearest start meta and hides BottomNav", async () => {
    fetchEventDetail.mockResolvedValue({
      ...baseEvent,
      flights: [
        {
          ...baseEvent.flights[0],
          start_at: {
            utc: "2026-09-02T17:00:00+00:00",
            venue_local: "2026-09-02T19:00:00+02:00",
            venue_timezone: "Europe/Kaliningrad",
          },
        },
        {
          ...baseEvent.flights[1],
          start_at: {
            utc: "2026-09-03T17:00:00+00:00",
            venue_local: "2026-09-03T19:00:00+02:00",
            venue_timezone: "Europe/Kaliningrad",
          },
        },
      ],
    });
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(await screen.findByTestId("event-start-meta")).toHaveTextContent("Ближайший старт");
    expect(screen.getByTestId("event-start-meta")).toHaveTextContent("Day 1A");
    expect(
      screen.queryByRole("navigation", { name: "Основная навигация" }),
    ).not.toBeInTheDocument();
  });

  it("shows last start meta and CTA when all flights are past", async () => {
    const pastEvent: EventDetail = {
      ...baseEvent,
      flights: [
        {
          id: "flight-past",
          label: "Day 1A",
          start_at: {
            utc: "2026-07-01T10:00:00+00:00",
            venue_local: "2026-07-01T12:00:00+02:00",
            venue_timezone: "Europe/Kaliningrad",
          },
        },
      ],
    };
    fetchEventDetail.mockResolvedValue(pastEvent);
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(await screen.findByTestId("event-start-meta")).toHaveTextContent("Последний старт");
    const cta = await screen.findByTestId("add-result-cta");
    expect(cta).toHaveAttribute("href", "/login");
  });

  it("hides CTA for cancelled events even without future flights", async () => {
    fetchEventDetail.mockResolvedValue({
      ...baseEvent,
      status: "cancelled",
      flights: [
        {
          id: "flight-past",
          label: null,
          start_at: {
            utc: "2026-07-01T10:00:00+00:00",
            venue_local: "2026-07-01T12:00:00+02:00",
            venue_timezone: "Europe/Kaliningrad",
          },
        },
      ],
    });
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    await screen.findByTestId("event-page");
    expect(screen.queryByTestId("add-result-cta")).not.toBeInTheDocument();
    expect(screen.getByText("Отменён")).toBeInTheDocument();
  });

  it("hides optional facts and structure when absent", async () => {
    fetchEventDetail.mockResolvedValue({
      ...baseEvent,
      guarantee: null,
      start_stack: null,
      start_blinds: null,
      reentry_count: null,
      reentry_unlimited: false,
      late_reg_level: null,
      blind_levels: [],
    });
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    await screen.findByTestId("event-page");
    expect(screen.queryByTestId("fact-guarantee")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fact-stack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fact-blinds")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fact-reentry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fact-late")).not.toBeInTheDocument();
    expect(screen.queryByTestId("blind-structure")).not.toBeInTheDocument();
  });

  it("shows starting blinds from the schedule grid", async () => {
    fetchEventDetail.mockResolvedValue({
      ...baseEvent,
      start_blinds: "100/200/200",
    });
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    await screen.findByTestId("event-page");
    expect(screen.getByTestId("fact-blinds")).toHaveTextContent("100/200/200");
  });

  it("renders unlabeled single flight as Старт without chip", async () => {
    fetchEventDetail.mockResolvedValue({
      ...baseEvent,
      flights: [
        {
          id: "flight-only",
          label: null,
          start_at: {
            utc: "2026-08-02T17:00:00+00:00",
            venue_local: "2026-08-02T19:00:00+02:00",
            venue_timezone: "Europe/Kaliningrad",
          },
        },
      ],
    });
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(await screen.findByRole("heading", { name: /Старт/ })).toBeInTheDocument();
    expect(screen.queryByText("Flight")).not.toBeInTheDocument();
    expect(screen.getByTestId("event-start-meta").textContent).not.toContain("null");
  });

  it("uses seriesDay from route state in breadcrumb", async () => {
    renderWithProviders(<AppRoutes />, {
      routerProps: {
        initialEntries: [
          {
            pathname: eventPublicPath,
            state: { seriesDay: "2026-08-02" },
          },
        ],
      },
    });
    const crumb = await screen.findByTestId("event-breadcrumb");
    expect(crumb).toHaveAttribute("href", `/series/${seriesSlug}?day=2026-08-02`);
  });

  it("falls back to series link without day", async () => {
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    const crumb = await screen.findByTestId("event-breadcrumb");
    expect(crumb).toHaveAttribute("href", `/series/${seriesSlug}`);
  });

  it("shows real guest reminder offsets and keeps at least one", async () => {
    await putGuestBookmark({
      target_type: "flight",
      target_id: "flight-1a",
      reminder_offsets: [120, 1440],
      created_at: "2026-07-01T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    const settings = await screen.findByTestId("reminder-settings");
    expect(settings).toHaveTextContent("Напомним о Day 1A");
    expect(within(settings).getByRole("button", { name: "За 2 ч" }).className).toMatch(
      /bg-gold-grad/,
    );
    await user.click(within(settings).getByRole("button", { name: "За 24 ч" }));
    await user.click(within(settings).getByRole("button", { name: "За 2 ч" }));
    // last remaining chip must stay selected
    expect(within(settings).getByRole("button", { name: "За 2 ч" }).className).toMatch(
      /bg-gold-grad/,
    );
  });

  it("expands blind structure", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    const expand = await screen.findByTestId("blinds-expand");
    expect(expand).toHaveTextContent(/Показать все/);
    await user.click(expand);
    await waitFor(() => {
      expect(screen.queryByTestId("blinds-expand")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/конец поздней рег/)).toBeInTheDocument();
    expect(screen.getByText(/Перерыв · 15 минут/)).toBeInTheDocument();
  });

  it("shows 404 state", async () => {
    fetchEventDetail.mockRejectedValue(new ApiError(404, "not_found", "missing"));
    renderWithProviders(<AppRoutes />, { route: "/events/missing" });
    expect(await screen.findByTestId("event-not-found")).toBeInTheDocument();
  });

  it("opens live session from the card without the picker", async () => {
    const liveEvent: EventDetail = {
      ...baseEvent,
      series: { ...baseEvent.series, status: "running" },
    };
    fetchEventDetail.mockResolvedValue(liveEvent);
    fetchCurrentUser.mockResolvedValue(userFixture);
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    await user.click(await screen.findByTestId("live-session-cta"));
    const direct = await screen.findByTestId("live-direct-start");
    expect(direct).toHaveAttribute("data-event-id", "event-me");
    expect(direct).toHaveAttribute("data-flight-id", "flight-1b");
    expect(screen.queryByTestId("live-start")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(startLinked).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: "event-me", flight_id: "flight-1b" }),
      );
    });
  });

  it("binds the flight the user opened from the series row", async () => {
    const liveEvent: EventDetail = {
      ...baseEvent,
      series: { ...baseEvent.series, status: "running" },
    };
    fetchEventDetail.mockResolvedValue(liveEvent);
    fetchCurrentUser.mockResolvedValue(userFixture);
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, {
      routerProps: {
        initialEntries: [
          {
            pathname: eventPublicPath,
            state: { seriesDay: "2026-08-02", flightId: "flight-1a" },
          },
        ],
      },
    });
    await user.click(await screen.findByTestId("live-session-cta"));
    const direct = await screen.findByTestId("live-direct-start");
    expect(direct).toHaveAttribute("data-flight-id", "flight-1a");
    await waitFor(() => {
      expect(startLinked).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: "event-me", flight_id: "flight-1a" }),
      );
    });
  });

  it("resumes the existing session for the same event", async () => {
    const liveEvent: EventDetail = {
      ...baseEvent,
      series: { ...baseEvent.series, status: "running" },
    };
    fetchEventDetail.mockResolvedValue(liveEvent);
    fetchCurrentUser.mockResolvedValue(userFixture);
    liveSessionRef.current = liveSessionFixture("event-me");
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(await screen.findByTestId("live-session-cta")).toHaveTextContent("Продолжить турнир");
    await user.click(screen.getByTestId("live-session-cta"));
    expect(await screen.findByTestId("live-active")).toBeInTheDocument();
    expect(startLinked).not.toHaveBeenCalled();
    expect(screen.queryByTestId("live-start")).not.toBeInTheDocument();
  });

  it("asks to finish another tournament's session", async () => {
    const liveEvent: EventDetail = {
      ...baseEvent,
      series: { ...baseEvent.series, status: "running" },
    };
    fetchEventDetail.mockResolvedValue(liveEvent);
    fetchCurrentUser.mockResolvedValue(userFixture);
    liveSessionRef.current = liveSessionFixture("other-event");
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    await user.click(await screen.findByTestId("live-session-cta"));
    expect(await screen.findByText("Уже есть активная сессия")).toBeInTheDocument();
    expect(screen.getByTestId("event-page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "К текущему турниру" }));
    expect(await screen.findByTestId("live-active")).toBeInTheDocument();
    expect(startLinked).not.toHaveBeenCalled();
  });

  it("shows error and retries", async () => {
    fetchEventDetail.mockRejectedValue(new ApiError(500, "server", "boom"));
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: eventPublicPath });
    expect(await screen.findByTestId("event-error")).toBeInTheDocument();
    fetchEventDetail.mockResolvedValue(baseEvent);
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByTestId("event-page")).toBeInTheDocument();
  });
});
