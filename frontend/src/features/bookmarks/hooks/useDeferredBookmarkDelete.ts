import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BookmarkListItem, BookmarkOverviewItem } from "@/api/types/bookmarks";
import { deleteBookmark } from "@/features/bookmarks/api";
import { deleteGuestBookmark } from "@/features/bookmarks/lib/guestBookmarksIdb";
import { bookmarkKeys, guestBookmarkKeys } from "@/features/bookmarks/queryKeys";

const UNDO_MS = 5_000;

type PendingDelete = {
  item: BookmarkListItem;
  timer: ReturnType<typeof setTimeout>;
};

export function useDeferredBookmarkDelete() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<BookmarkListItem | null>(null);
  // Written synchronously on every schedule/undo: an effect-synced ref is stale
  // for taps that land in the same render commit, which orphans timers.
  const pendingRef = useRef<PendingDelete | null>(null);

  const keysFor = useCallback(
    (item: BookmarkListItem) =>
      item.source === "server" ? bookmarkKeys.all : guestBookmarkKeys.all,
    [],
  );

  const commitDelete = useCallback(
    async (item: BookmarkListItem) => {
      try {
        if (item.source === "server" && item.bookmarkId) {
          await deleteBookmark(item.bookmarkId);
        } else {
          await deleteGuestBookmark(item.target_type, item.target_id);
        }
      } catch {
        // Roll back the optimistic removal: refetch tells the truth.
      } finally {
        if (pendingRef.current?.item.key === item.key) {
          pendingRef.current = null;
        }
        setPending((current) => (current?.key === item.key ? null : current));
        void queryClient.invalidateQueries({ queryKey: keysFor(item) });
      }
    },
    [keysFor, queryClient],
  );

  const removeOptimistic = useCallback(
    async (item: BookmarkListItem) => {
      // Cancel in-flight refetches first, otherwise an earlier response lands
      // after the optimistic removal and brings the row back.
      await queryClient.cancelQueries({ queryKey: keysFor(item) });
      if (item.source === "server") {
        queryClient.setQueryData<BookmarkOverviewItem[]>(bookmarkKeys.overview(), (prev) =>
          (prev ?? []).filter((row) => row.id !== item.bookmarkId),
        );
        queryClient.setQueryData(bookmarkKeys.list(), (prev: unknown) => {
          if (!Array.isArray(prev)) {
            return prev;
          }
          return prev.filter(
            (row) => !(row && typeof row === "object" && "id" in row && row.id === item.bookmarkId),
          );
        });
      } else {
        queryClient.setQueryData<BookmarkListItem[]>(guestBookmarkKeys.overview(), (prev) =>
          (prev ?? []).filter((row) => row.key !== item.key),
        );
        queryClient.setQueryData(guestBookmarkKeys.list(), (prev: unknown) => {
          if (!Array.isArray(prev)) {
            return prev;
          }
          return prev.filter(
            (row) =>
              !(
                row &&
                typeof row === "object" &&
                "target_type" in row &&
                "target_id" in row &&
                row.target_type === item.target_type &&
                row.target_id === item.target_id
              ),
          );
        });
      }
    },
    [keysFor, queryClient],
  );

  const scheduleDelete = useCallback(
    (item: BookmarkListItem) => {
      const existing = pendingRef.current;
      if (existing) {
        clearTimeout(existing.timer);
        pendingRef.current = null;
        if (existing.item.key !== item.key) {
          void commitDelete(existing.item);
        }
      }

      void removeOptimistic(item);
      const timer = setTimeout(() => {
        void commitDelete(item);
      }, UNDO_MS);

      pendingRef.current = { item, timer };
      setPending(item);
    },
    [commitDelete, removeOptimistic],
  );

  const undo = useCallback(() => {
    const current = pendingRef.current;
    if (!current) {
      return;
    }
    clearTimeout(current.timer);
    pendingRef.current = null;
    setPending(null);
    void queryClient.invalidateQueries({ queryKey: keysFor(current.item) });
  }, [keysFor, queryClient]);

  // Leaving the screen ends the undo window: flush the deletion instead of
  // dropping it, otherwise the row is gone from the cache but alive on the
  // server and comes back on the next refetch.
  useEffect(() => {
    return () => {
      const current = pendingRef.current;
      if (!current) {
        return;
      }
      clearTimeout(current.timer);
      pendingRef.current = null;
      void commitDelete(current.item);
    };
  }, [commitDelete]);

  return {
    pendingItem: pending,
    scheduleDelete,
    undo,
  };
}
