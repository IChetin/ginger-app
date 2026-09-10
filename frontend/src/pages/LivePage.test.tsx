import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import type { LiveCandidateRead } from "@/api/types/live";
import type { LocalLiveSession } from "@/features/live/hooks";
import { LivePage } from "@/pages/LivePage";
import { eventDetailFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const { liveSessionRef, startLinked, candidatesRef } = vi.hoisted(() => ({
  liveSessionRef: { current: null as import("@/features/live/lib/liveIdb").LocalLiveSession | null },
  startLinked: vi.fn().mockResolvedValue({}),
  candidatesRef: { current: [] as import("@/api/types/live").LiveCandidateRead[] },
}));

vi.mock("@/features/auth/hooks", () => ({
  useMe: () => ({
    data: {
      id: "user-1",
      email: "player@example.com",
      phone: null,
      nickname: "ace",
      base_currency: "RUB",
      timezone: null,
      stack_display: "chips",
      hide_holes_until_showdown: true,
      results_visibility: "private",
      role: "user",
      default_reminder_offsets: [1440, 120],
      email_verified: true,
      has_password: false,
      created_at: "2026-01-01T00:00:00Z",
    } satisfies UserMe,
    isLoading: false,
  }),
}));

vi.mock("@/api/series", () => ({
  useEvent: () => ({ data: eventDetailFixture, isLoading: false, isError: false }),
}));

vi.mock("@/features/live/hooks", () => ({
  useActiveLiveSession: () => ({
    data: liveSessionRef.current,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useLiveCandidates: () => ({ data: candidatesRef.current, isLoading: false, isError: false }),
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

function session(eventId: string): LocalLiveSession {
  return {
    id: "live-1",
    event_id: eventId,
    flight_id: "flight-1",
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
    display_name: "#1 Main Event",
    display_series: "RPT Demo",
    buyin: "55000.00",
    currency: { code: "RUB", symbol: "₽" },
    reentry_allowed: true,
    events: [],
    created_at: "2026-08-31T10:00:00.000Z",
    updated_at: "2026-08-31T10:00:00.000Z",
  };
}

const todayCandidate: LiveCandidateRead = {
  event_id: "event-1",
  flight_id: "flight-1",
  name: "#1 Main Event · A",
  series_name: "RPT Demo",
  buyin: "55000.00",
  currency: { code: "RUB", symbol: "₽" },
  start_at: "2026-08-31T11:00:00.000Z",
  reentry_count: 1,
  reentry_unlimited: false,
};

describe("LivePage", () => {
  beforeEach(() => {
    liveSessionRef.current = null;
    candidatesRef.current = [todayCandidate];
    startLinked.mockClear();
  });

  it("shows the tournament picker when opened without context", async () => {
    renderWithProviders(<LivePage />, { route: "/live" });
    expect(await screen.findByTestId("live-start")).toBeInTheDocument();
    expect(screen.getByText("Сегодня на вашей серии")).toBeInTheDocument();
    expect(screen.queryByTestId("live-direct-start")).not.toBeInTheDocument();
    expect(startLinked).not.toHaveBeenCalled();
  });

  it("starts a session from event_id without showing the picker", async () => {
    renderWithProviders(<LivePage />, { route: "/live?event_id=event-1&flight_id=flight-1" });
    expect(await screen.findByTestId("live-direct-start")).toBeInTheDocument();
    expect(screen.queryByTestId("live-start")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(startLinked).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: "event-1", flight_id: "flight-1" }),
      );
    });
  });

  it("opens the existing session for the same event", async () => {
    liveSessionRef.current = session("event-1");
    renderWithProviders(<LivePage />, { route: "/live?event_id=event-1" });
    expect(await screen.findByTestId("live-active")).toBeInTheDocument();
    expect(screen.queryByTestId("live-start")).not.toBeInTheDocument();
    expect(startLinked).not.toHaveBeenCalled();
  });

  it("does not start a second session when another tournament is active", async () => {
    liveSessionRef.current = session("other-event");
    const user = userEvent.setup();
    renderWithProviders(<LivePage />, { route: "/live?event_id=event-1" });
    expect(await screen.findByTestId("live-other-session")).toBeInTheDocument();
    expect(startLinked).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "К текущему турниру" }));
    expect(await screen.findByTestId("live-active")).toBeInTheDocument();
  });
});
