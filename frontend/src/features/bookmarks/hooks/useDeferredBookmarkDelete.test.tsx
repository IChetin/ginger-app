import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkListItem } from "@/api/types/bookmarks";
import { useDeferredBookmarkDelete } from "@/features/bookmarks/hooks/useDeferredBookmarkDelete";
import { bookmarkKeys } from "@/features/bookmarks/queryKeys";

const deleteBookmark = vi.fn<(id: string) => Promise<void>>();
const deleteGuestBookmark = vi.fn<(type: string, id: string) => Promise<void>>();

vi.mock("@/features/bookmarks/api", () => ({
  deleteBookmark: (id: string) => deleteBookmark(id),
}));

vi.mock("@/features/bookmarks/lib/guestBookmarksIdb", () => ({
  deleteGuestBookmark: (type: string, id: string) => deleteGuestBookmark(type, id),
}));

function serverItem(overrides: Partial<BookmarkListItem> = {}): BookmarkListItem {
  return {
    key: "bookmark-1",
    source: "server",
    bookmarkId: "bookmark-1",
    target_type: "flight",
    target_id: "flight-1",
    reminder_offsets: [120],
    created_at: "2026-01-01T00:00:00Z",
    series_id: "series-1",
    event_id: "event-1",
    series_name: "RPT",
    series_status: "running",
    series_starts_on: "2026-08-01",
    series_ends_on: "2026-08-11",
    organizer_name: "RPT",
    organizer_slug: "rpt",
    venue_name: "Sobranie",
    venue_city: "Калининград",
    event_number: 1,
    event_name: "Main Event",
    flight_label: "Day 1A",
    nearest_start_at: null,
    url: "/events/rpt-demo-1-main-event",
    ...overrides,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useDeferredBookmarkDelete(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

describe("useDeferredBookmarkDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteBookmark.mockReset().mockResolvedValue(undefined);
    deleteGuestBookmark.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes the row from the cache before the server call", async () => {
    const { result, queryClient } = setup();
    queryClient.setQueryData(bookmarkKeys.overview(), [{ id: "bookmark-1" }, { id: "other" }]);

    await act(async () => {
      result.current.scheduleDelete(serverItem());
    });

    expect(queryClient.getQueryData(bookmarkKeys.overview())).toEqual([{ id: "other" }]);
    expect(deleteBookmark).not.toHaveBeenCalled();
  });

  it("commits the delete after the 5s undo window", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.scheduleDelete(serverItem());
    });
    await act(async () => {
      vi.advanceTimersByTime(4_999);
    });
    expect(deleteBookmark).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(deleteBookmark).toHaveBeenCalledWith("bookmark-1");
  });

  it("undo cancels the timer and never calls the server", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.scheduleDelete(serverItem());
    });
    await act(async () => {
      result.current.undo();
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(deleteBookmark).not.toHaveBeenCalled();
    expect(result.current.pendingItem).toBeNull();
  });

  // BUG-2: the timer used to be dropped on unmount, so the row stayed alive on
  // the server and came back on the next refetch.
  it("flushes the pending delete when the screen unmounts", async () => {
    const { result, unmount } = setup();

    await act(async () => {
      result.current.scheduleDelete(serverItem());
    });
    await act(async () => {
      unmount();
    });

    expect(deleteBookmark).toHaveBeenCalledWith("bookmark-1");
  });

  it("does not resurrect a deleted row after unmount when undo was pressed", async () => {
    const { result, unmount } = setup();

    await act(async () => {
      result.current.scheduleDelete(serverItem());
    });
    await act(async () => {
      result.current.undo();
    });
    await act(async () => {
      unmount();
    });

    expect(deleteBookmark).not.toHaveBeenCalled();
  });

  // BUG-2: rapid taps orphaned the previous timer, so only the last row was deleted.
  it("commits every row when several are deleted in a row", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.scheduleDelete(serverItem({ key: "a", bookmarkId: "a" }));
      result.current.scheduleDelete(serverItem({ key: "b", bookmarkId: "b" }));
      result.current.scheduleDelete(serverItem({ key: "c", bookmarkId: "c" }));
    });

    expect(deleteBookmark.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(deleteBookmark.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
  });

  it("deletes guest rows through IndexedDB", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.scheduleDelete(
        serverItem({ source: "guest", bookmarkId: null, key: "guest:flight:flight-1" }),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(deleteGuestBookmark).toHaveBeenCalledWith("flight", "flight-1");
    expect(deleteBookmark).not.toHaveBeenCalled();
  });
});
