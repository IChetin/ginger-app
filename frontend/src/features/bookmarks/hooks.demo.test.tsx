import "fake-indexeddb/auto";

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkTargetResolveResponse } from "@/api/types/bookmarks";
import { BookmarksPage } from "@/features/bookmarks/BookmarksPage";
import {
  clearGuestBookmarks,
  putGuestBookmark,
} from "@/features/bookmarks/lib/guestBookmarksIdb";
import { renderWithProviders } from "@/test/render";

const meState = vi.hoisted(() => ({
  data: undefined as { id: string } | undefined,
  isLoading: false,
  isPending: false,
}));

const resolveBookmarkTargets = vi.hoisted(() =>
  vi.fn(async (): Promise<BookmarkTargetResolveResponse> => ({ items: [] })),
);

vi.mock("@/features/auth/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/hooks")>();
  return {
    ...actual,
    useMe: () => meState,
  };
});

vi.mock("@/features/bookmarks/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/bookmarks/api")>();
  return {
    ...actual,
    resolveBookmarkTargets: () => resolveBookmarkTargets(),
    fetchBookmarks: () => Promise.resolve([]),
    fetchBookmarksOverview: () => Promise.resolve([]),
  };
});

describe("guest vs demo bookmarks", () => {
  beforeEach(async () => {
    meState.data = undefined;
    meState.isLoading = false;
    meState.isPending = false;
    resolveBookmarkTargets.mockReset().mockResolvedValue({ items: [] });
    await clearGuestBookmarks();
  });

  it("shows demo fixtures when the guest has no local bookmarks", async () => {
    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    expect(await screen.findByTestId("demo-banner")).toHaveTextContent("Пример данных");
    expect(screen.getByTestId("bookmarks-page")).toHaveAttribute("data-demo", "true");
    expect(await screen.findByText("#5 Main Event · Day 1A")).toBeInTheDocument();
    expect(screen.getByText("сообщим, когда выйдет сетка")).toBeInTheDocument();
    expect(screen.queryByTestId("guest-bookmarks-banner")).not.toBeInTheDocument();
    expect(resolveBookmarkTargets).not.toHaveBeenCalled();
  });

  it("shows the guest's own bookmarks and does not mix in demo rows", async () => {
    await putGuestBookmark({
      target_type: "series",
      target_id: "guest-series-1",
      reminder_offsets: [],
      created_at: "2026-09-01T00:00:00.000Z",
    });
    resolveBookmarkTargets.mockResolvedValue({
      items: [
        {
          target_type: "series",
          target_id: "guest-series-1",
          found: true,
          display: {
            series_id: "guest-series-1",
            event_id: null,
            series_name: "Моя серия гостя",
            series_status: "running",
            series_starts_on: "2026-09-01",
            series_ends_on: "2026-09-20",
            organizer_name: "RPT",
            organizer_slug: "rpt",
            venue_name: "Минск",
            venue_city: "Минск",
            event_number: null,
            event_name: null,
            flight_label: null,
            nearest_start_at: null,
            url: "/series/rpt-minsk-2026-09",
          },
        },
      ],
    });

    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    expect(await screen.findByText("Моя серия гостя")).toBeInTheDocument();
    expect(screen.getByTestId("guest-bookmarks-banner")).toHaveTextContent(
      "Войдите, чтобы получать напоминания на всех устройствах",
    );
    expect(screen.getByTestId("bookmarks-page")).not.toHaveAttribute("data-demo");
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    expect(screen.queryByText("#5 Main Event · Day 1A")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(resolveBookmarkTargets).toHaveBeenCalled();
    });
  });

  it("does not fall back to demo when guest records fail to resolve", async () => {
    await putGuestBookmark({
      target_type: "flight",
      target_id: "stale-flight",
      reminder_offsets: [120],
      created_at: "2026-09-01T00:00:00.000Z",
    });
    resolveBookmarkTargets.mockResolvedValue({
      items: [
        {
          target_type: "flight",
          target_id: "stale-flight",
          found: false,
          display: null,
        },
      ],
    });

    renderWithProviders(<BookmarksPage />, { route: "/bookmarks" });

    expect(await screen.findByTestId("guest-bookmarks-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("bookmarks-page")).not.toHaveAttribute("data-demo");
    expect(screen.queryByText("#5 Main Event · Day 1A")).not.toBeInTheDocument();
  });
});
