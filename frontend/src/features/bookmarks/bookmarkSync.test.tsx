import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bookmark } from "@/api/types/bookmarks";
import { BookmarkButton } from "@/components/series/BookmarkButton";
import { useBookmarkTarget, useCreateBookmark } from "@/features/bookmarks/hooks";
import { bookmarkKeys } from "@/features/bookmarks/queryKeys";

const meState: { data: { id: string } | undefined; isLoading: boolean } = {
  data: { id: "user-1" },
  isLoading: false,
};

const fetchBookmarks = vi.fn<() => Promise<Bookmark[]>>();
const createBookmark = vi.fn();
const deleteBookmark = vi.fn();

vi.mock("@/features/auth/hooks", () => ({
  useMe: () => meState,
}));

vi.mock("@/features/bookmarks/api", () => ({
  fetchBookmarks: () => fetchBookmarks(),
  fetchBookmarksOverview: () => Promise.resolve([]),
  fetchNotificationHistory: () => Promise.resolve([]),
  resolveBookmarkTargets: () => Promise.resolve({ items: [] }),
  createBookmark: (payload: unknown) => createBookmark(payload),
  updateBookmark: () => Promise.resolve({}),
  deleteBookmark: (id: string) => deleteBookmark(id),
}));

const serverRow: Bookmark = {
  id: "bookmark-1",
  target_type: "series",
  target_id: "series-1",
  reminder_offsets: [],
  created_at: "2026-01-01T00:00:00Z",
};

function renderTwoButtons() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <div data-testid="series-card">
        <BookmarkButton targetType="series" targetId="series-1" />
      </div>
      <div data-testid="bookmarks-list">
        <BookmarkButton targetType="series" targetId="series-1" />
      </div>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("bookmark state is shared across cards (BUG-2)", () => {
  beforeEach(() => {
    meState.data = { id: "user-1" };
    meState.isLoading = false;
    fetchBookmarks.mockReset().mockResolvedValue([serverRow]);
    createBookmark.mockReset().mockResolvedValue(serverRow);
    deleteBookmark.mockReset().mockResolvedValue(undefined);
  });

  it("removing a bookmark in one place clears it everywhere at once", async () => {
    const user = userEvent.setup();
    renderTwoButtons();

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: "Убрать из закладок" });
      expect(found).toHaveLength(2);
      return found;
    });

    fetchBookmarks.mockResolvedValue([]);
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В закладки" })).toHaveLength(2);
    });
    expect(deleteBookmark).toHaveBeenCalledWith("bookmark-1");
  });

  it("adding a bookmark shows up on both cards before the refetch lands", async () => {
    fetchBookmarks.mockResolvedValue([]);
    const user = userEvent.setup();
    renderTwoButtons();

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: "В закладки" });
      expect(found).toHaveLength(2);
      return found;
    });

    // The refetch triggered by invalidation never resolves: the UI must still
    // flip immediately from the optimistic cache write.
    fetchBookmarks.mockImplementation(() => new Promise<Bookmark[]>(() => {}));
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Убрать из закладок" })).toHaveLength(2);
    });
  });

  // BUG-2: onSuccess awaited invalidateQueries, so the button stayed disabled
  // until every dependent refetch finished — 15–20s on a slow connection.
  it("re-enables the button without waiting for the invalidation refetch", async () => {
    fetchBookmarks.mockResolvedValue([]);
    const user = userEvent.setup();
    renderTwoButtons();

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: "В закладки" });
      expect(found).toHaveLength(2);
      return found;
    });

    let releaseRefetch: (rows: Bookmark[]) => void = () => {};
    fetchBookmarks.mockImplementation(
      () =>
        new Promise<Bookmark[]>((resolve) => {
          releaseRefetch = resolve;
        }),
    );
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Убрать из закладок" })[0]).toBeEnabled();
    });
    releaseRefetch([serverRow]);
  });

  it("rolls the optimistic add back when the server rejects", async () => {
    fetchBookmarks.mockResolvedValue([]);
    createBookmark.mockRejectedValue(new Error("boom"));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(
      () => ({
        target: useBookmarkTarget("series", "series-1"),
        create: useCreateBookmark(),
      }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.target.isLoading).toBe(false));
    await act(async () => {
      await result.current.create
        .mutateAsync({ target_type: "series", target_id: "series-1", reminder_offsets: [] })
        .catch(() => undefined);
    });

    expect(result.current.target.isBookmarked).toBe(false);
  });

  it("cancels an in-flight list refetch before writing the optimistic state", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderTwoButtons();

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: "Убрать из закладок" });
      expect(found).toHaveLength(2);
      return found;
    });

    // A refetch that is already running when the tap happens must not land
    // afterwards and resurrect the row.
    let releaseStale: (rows: Bookmark[]) => void = () => {};
    fetchBookmarks.mockImplementation(
      () =>
        new Promise<Bookmark[]>((resolve) => {
          releaseStale = resolve;
        }),
    );
    void queryClient.refetchQueries({ queryKey: bookmarkKeys.list() });

    await user.click(buttons[0]);
    releaseStale([serverRow]);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В закладки" })).toHaveLength(2);
    });
  });
});
