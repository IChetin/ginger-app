import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BookmarkButton } from "@/components/series/BookmarkButton";
import { PAST_SERIES_HINT } from "@/components/series/seriesDisplay";

const createBookmark = vi.fn();

vi.mock("@/features/auth/hooks", () => ({
  useMe: () => ({ data: { id: "user-1" }, isLoading: false }),
}));

vi.mock("@/features/bookmarks/api", () => ({
  fetchBookmarks: () => Promise.resolve([]),
  fetchBookmarksOverview: () => Promise.resolve([]),
  fetchNotificationHistory: () => Promise.resolve([]),
  resolveBookmarkTargets: () => Promise.resolve({ items: [] }),
  createBookmark: (payload: unknown) => createBookmark(payload),
  updateBookmark: () => Promise.resolve({}),
  deleteBookmark: () => Promise.resolve(undefined),
}));

function renderButton(props: Partial<Parameters<typeof BookmarkButton>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookmarkButton targetType="series" targetId="series-1" {...props} />
    </QueryClientProvider>,
  );
}

// BUG-3: a finished series could be bookmarked and landed in «Предстоящие».
describe("BookmarkButton for a past target", () => {
  beforeEach(() => {
    createBookmark.mockReset().mockResolvedValue({});
  });

  it("is disabled and explains why", async () => {
    const user = userEvent.setup();
    renderButton({ disabledReason: PAST_SERIES_HINT });

    const button = await screen.findByRole("button", { name: PAST_SERIES_HINT });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", PAST_SERIES_HINT);

    await user.click(button);
    expect(createBookmark).not.toHaveBeenCalled();
  });

  it("stays clickable without a reason", async () => {
    const user = userEvent.setup();
    renderButton();

    const button = await screen.findByRole("button", { name: "В закладки" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(createBookmark).toHaveBeenCalled());
  });

  it("cta variant shows the finished label", async () => {
    renderButton({ variant: "cta", disabledReason: PAST_SERIES_HINT });
    const button = await screen.findByRole("button", { name: "Серия завершена" });
    expect(button).toBeDisabled();
  });

  it("cta variant labels the action as «В закладки»", async () => {
    renderButton({ variant: "cta" });
    expect(await screen.findByRole("button", { name: "В закладки" })).toBeInTheDocument();
  });
});
