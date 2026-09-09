import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type {
  Bookmark,
  BookmarkCreatePayload,
  BookmarkListItem,
  BookmarkOverviewItem,
  BookmarkTargetType,
} from "@/api/types/bookmarks";
import { listDemoBookmarks } from "@/demo/bookmarks";
import { useMe } from "@/features/auth/hooks";
import {
  createBookmark,
  deleteBookmark,
  fetchBookmarks,
  fetchBookmarksOverview,
  fetchNotificationHistory,
  resolveBookmarkTargets,
  updateBookmark,
} from "@/features/bookmarks/api";
import {
  guestResolvedToListItem,
  overviewToListItem,
  sortBookmarkListItems,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import {
  deleteGuestBookmark,
  getAllGuestBookmarks,
  putGuestBookmark,
  type GuestBookmarkRecord,
} from "@/features/bookmarks/lib/guestBookmarksIdb";
import { bookmarkKeys, guestBookmarkKeys, notificationKeys } from "@/features/bookmarks/queryKeys";

export function useBookmarks(options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  return useQuery({
    queryKey: bookmarkKeys.list(),
    queryFn: fetchBookmarks,
    enabled: Boolean(user) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useBookmarksOverview(options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  return useQuery({
    queryKey: bookmarkKeys.overview(),
    queryFn: fetchBookmarksOverview,
    enabled: Boolean(user) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useGuestBookmarks(options?: { enabled?: boolean }) {
  const { data: user, isLoading: authLoading } = useMe();
  return useQuery({
    queryKey: guestBookmarkKeys.list(),
    queryFn: getAllGuestBookmarks,
    enabled: !authLoading && !user && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useGuestBookmarksOverview(options?: { enabled?: boolean }) {
  const { data: user, isLoading: authLoading } = useMe();
  return useQuery({
    queryKey: guestBookmarkKeys.overview(),
    queryFn: async (): Promise<BookmarkListItem[]> => {
      const records = await getAllGuestBookmarks();
      if (records.length === 0) {
        return [];
      }
      const resolved = await resolveBookmarkTargets({
        items: records.map((record) => ({
          target_type: record.target_type,
          target_id: record.target_id,
        })),
      });
      const byKey = new Map(
        resolved.items.map((item) => [`${item.target_type}:${item.target_id}`, item]),
      );
      const items: BookmarkListItem[] = [];
      for (const record of records) {
        const match = byKey.get(`${record.target_type}:${record.target_id}`);
        if (!match) {
          continue;
        }
        const row = guestResolvedToListItem(record, match);
        if (row) {
          items.push(row);
        }
      }
      return sortBookmarkListItems(items);
    },
    enabled: !authLoading && !user && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

/** Unified upcoming list for server or guest. */
export function useBookmarkListItems(options?: { enabled?: boolean }) {
  const { data: user, isLoading: authLoading } = useMe();
  const server = useBookmarksOverview({
    enabled: Boolean(user) && (options?.enabled ?? true),
  });
  const guestRecords = useGuestBookmarks({
    enabled: !user && (options?.enabled ?? true),
  });
  const guest = useGuestBookmarksOverview({
    enabled: !user && (options?.enabled ?? true),
  });

  if (authLoading) {
    return {
      items: [] as BookmarkListItem[],
      isLoading: true,
      isError: false,
      isGuest: false,
      refetch: async () => undefined,
      source: "loading" as const,
    };
  }

  if (user) {
    return {
      items: (server.data ?? []).map(overviewToListItem),
      isLoading: server.isLoading,
      isError: server.isError,
      isGuest: false,
      refetch: server.refetch,
      source: "server" as const,
    };
  }

  if (guestRecords.isLoading || guest.isLoading) {
    return {
      items: [] as BookmarkListItem[],
      isLoading: true,
      isError: false,
      isGuest: true,
      refetch: guest.refetch,
      source: "guest" as const,
    };
  }

  if (guestRecords.isError || guest.isError) {
    return {
      items: [] as BookmarkListItem[],
      isLoading: false,
      isError: true,
      isGuest: true,
      refetch: guest.refetch,
      source: "guest" as const,
    };
  }

  // IDB records, not resolved rows: a stale/unresolved bookmark must not flip into demo.
  if ((guestRecords.data ?? []).length > 0) {
    return {
      items: guest.data ?? [],
      isLoading: false,
      isError: false,
      isGuest: true,
      refetch: guest.refetch,
      source: "guest" as const,
    };
  }

  return {
    items: listDemoBookmarks(),
    isLoading: false,
    isError: false,
    isGuest: true,
    refetch: guest.refetch,
    source: "demo" as const,
  };
}

export function useBookmarkCount() {
  const { data: user, isLoading: authLoading } = useMe();
  const server = useBookmarks({ enabled: Boolean(user) });
  const guest = useGuestBookmarks({ enabled: !user });

  if (authLoading) {
    return 0;
  }
  if (user) {
    return server.data?.length ?? 0;
  }
  return guest.data?.length ?? 0;
}

export function useNotificationHistory(days = 30, options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  return useQuery({
    queryKey: notificationKeys.history(days),
    queryFn: () => fetchNotificationHistory(days),
    enabled: Boolean(user) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useBookmarkForTarget(targetType: BookmarkTargetType, targetId: string) {
  const query = useBookmarks();
  const bookmark = query.data?.find(
    (item) => item.target_type === targetType && item.target_id === targetId,
  );
  return {
    ...query,
    bookmark,
    isBookmarked: Boolean(bookmark),
  };
}

export type BookmarkTargetState = {
  isBookmarked: boolean;
  /** Server row; absent for guests and while an optimistic create is in flight. */
  bookmark: Bookmark | undefined;
  reminderOffsets: number[];
  createdAt: string | null;
  isLoading: boolean;
};

/**
 * Single source of truth for "is this target bookmarked": the server list for a
 * logged-in user, the guest IndexedDB list otherwise. Both are TanStack queries,
 * so every mutation that invalidates them updates all controls at once —
 * components must not keep their own copy of this state.
 */
export function useBookmarkTarget(
  targetType: BookmarkTargetType,
  targetId: string,
): BookmarkTargetState {
  const { data: user, isLoading: authLoading } = useMe();
  const server = useBookmarks({ enabled: Boolean(user) });
  const guest = useGuestBookmarks({ enabled: !user });

  if (user) {
    const bookmark = server.data?.find(
      (item) => item.target_type === targetType && item.target_id === targetId,
    );
    return {
      isBookmarked: Boolean(bookmark),
      bookmark,
      reminderOffsets: bookmark?.reminder_offsets ?? [],
      createdAt: bookmark?.created_at ?? null,
      isLoading: authLoading || server.isLoading,
    };
  }

  const record = guest.data?.find(
    (item) => item.target_type === targetType && item.target_id === targetId,
  );
  return {
    isBookmarked: Boolean(record),
    bookmark: undefined,
    reminderOffsets: record?.reminder_offsets ?? [],
    createdAt: record?.created_at ?? null,
    isLoading: authLoading || guest.isLoading,
  };
}

/** First of `flightIds` that is bookmarked, read from the shared cache. */
export function useFirstBookmarkedFlight(flightIds: string[]): string | null {
  const { data: user } = useMe();
  const server = useBookmarks({ enabled: Boolean(user) });
  const guest = useGuestBookmarks({ enabled: !user });
  const rows = user ? server.data : guest.data;
  if (!rows) {
    return null;
  }
  return (
    flightIds.find((flightId) =>
      rows.some((row) => row.target_type === "flight" && row.target_id === flightId),
    ) ?? null
  );
}

/** Marks a cache row that exists only until the server answers. */
const OPTIMISTIC_ID_PREFIX = "optimistic:";

export function isOptimisticBookmarkId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

type ServerSnapshot = {
  list: Bookmark[] | undefined;
  overview: BookmarkOverviewItem[] | undefined;
};

/**
 * Stops in-flight refetches before an optimistic write: otherwise a response
 * that started earlier lands afterwards and resurrects the changed row.
 */
async function takeServerSnapshot(queryClient: QueryClient): Promise<ServerSnapshot> {
  await queryClient.cancelQueries({ queryKey: bookmarkKeys.all });
  return {
    list: queryClient.getQueryData<Bookmark[]>(bookmarkKeys.list()),
    overview: queryClient.getQueryData<BookmarkOverviewItem[]>(bookmarkKeys.overview()),
  };
}

function restoreServerSnapshot(queryClient: QueryClient, snapshot: ServerSnapshot): void {
  queryClient.setQueryData(bookmarkKeys.list(), snapshot.list);
  queryClient.setQueryData(bookmarkKeys.overview(), snapshot.overview);
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBookmark,
    onMutate: async (payload: BookmarkCreatePayload) => {
      const snapshot = await takeServerSnapshot(queryClient);
      const optimistic: Bookmark = {
        id: `${OPTIMISTIC_ID_PREFIX}${payload.target_type}:${payload.target_id}`,
        target_type: payload.target_type,
        target_id: payload.target_id,
        reminder_offsets: payload.reminder_offsets ?? [],
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.list(), (prev) => [
        ...(prev ?? []).filter(
          (row) =>
            !(row.target_type === payload.target_type && row.target_id === payload.target_id),
        ),
        optimistic,
      ]);
      return snapshot;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.list(), (prev) =>
        (prev ?? []).map((row) => (isOptimisticBookmarkId(row.id) ? created : row)),
      );
    },
    onError: (_error, _payload, snapshot) => {
      if (snapshot) {
        restoreServerSnapshot(queryClient, snapshot);
      }
    },
    onSettled: () => {
      // Not awaited: the button must not stay disabled until the refetch lands.
      void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useUpdateBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookmarkId,
      body,
    }: {
      bookmarkId: string;
      body: Parameters<typeof updateBookmark>[1];
    }) => updateBookmark(bookmarkId, body),
    onSuccess: (updated) => {
      const patch = <T extends { id: string; reminder_offsets: number[] }>(rows: T[] | undefined) =>
        (rows ?? []).map((row) =>
          row.id === updated.id ? { ...row, reminder_offsets: updated.reminder_offsets } : row,
        );
      queryClient.setQueryData<BookmarkOverviewItem[]>(bookmarkKeys.overview(), patch);
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.list(), patch);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBookmark,
    onMutate: async (bookmarkId: string) => {
      const snapshot = await takeServerSnapshot(queryClient);
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.list(), (prev) =>
        (prev ?? []).filter((row) => row.id !== bookmarkId),
      );
      queryClient.setQueryData<BookmarkOverviewItem[]>(bookmarkKeys.overview(), (prev) =>
        (prev ?? []).filter((row) => row.id !== bookmarkId),
      );
      return snapshot;
    },
    onError: (_error, _bookmarkId, snapshot) => {
      if (snapshot) {
        restoreServerSnapshot(queryClient, snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useInvalidateGuestBookmarks() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: guestBookmarkKeys.all });
  };
}

async function takeGuestSnapshot(
  queryClient: QueryClient,
): Promise<GuestBookmarkRecord[] | undefined> {
  await queryClient.cancelQueries({ queryKey: guestBookmarkKeys.all });
  return queryClient.getQueryData<GuestBookmarkRecord[]>(guestBookmarkKeys.list());
}

/** Guest writes as mutations so the guest list cache stays the only source of truth. */
export function usePutGuestBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: putGuestBookmark,
    onMutate: async (record: GuestBookmarkRecord) => {
      const snapshot = await takeGuestSnapshot(queryClient);
      queryClient.setQueryData<GuestBookmarkRecord[]>(guestBookmarkKeys.list(), (prev) => [
        ...(prev ?? []).filter(
          (row) => !(row.target_type === record.target_type && row.target_id === record.target_id),
        ),
        record,
      ]);
      return snapshot;
    },
    onError: (_error, _record, snapshot) => {
      queryClient.setQueryData(guestBookmarkKeys.list(), snapshot);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guestBookmarkKeys.all });
    },
  });
}

export function useRemoveGuestBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: BookmarkTargetType; targetId: string }) =>
      deleteGuestBookmark(targetType, targetId),
    onMutate: async ({ targetType, targetId }) => {
      const snapshot = await takeGuestSnapshot(queryClient);
      queryClient.setQueryData<GuestBookmarkRecord[]>(guestBookmarkKeys.list(), (prev) =>
        (prev ?? []).filter(
          (row) => !(row.target_type === targetType && row.target_id === targetId),
        ),
      );
      queryClient.setQueryData<BookmarkListItem[]>(guestBookmarkKeys.overview(), (prev) =>
        (prev ?? []).filter(
          (row) => !(row.target_type === targetType && row.target_id === targetId),
        ),
      );
      return snapshot;
    },
    onError: (_error, _variables, snapshot) => {
      queryClient.setQueryData(guestBookmarkKeys.list(), snapshot);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guestBookmarkKeys.all });
    },
  });
}
