import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NotificationListParams } from "@/api/types/notifications";
import { useMe } from "@/features/auth/hooks";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
} from "@/features/notifications/api";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params: Omit<NotificationListParams, "offset" | "limit">) =>
    [...notificationKeys.all, "list", params] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(user) && (options?.enabled ?? true),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useInfiniteNotifications(
  filters: { type?: "reminders" | "changes"; unread_only?: boolean },
  pageSize = 20,
  options?: { enabled?: boolean },
) {
  const { data: user } = useMe();
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchNotifications({
        ...filters,
        limit: pageSize,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.limit : undefined),
    enabled: Boolean(user) && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
