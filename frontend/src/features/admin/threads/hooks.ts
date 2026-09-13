import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Thread } from "@/api/types/threads";
import {
  closeAdminThread,
  fetchAdminThread,
  fetchAdminThreads,
  postAdminImage,
  postAdminMessage,
  type InboxScope,
} from "@/features/admin/threads/api";

const keys = {
  list: (scope: InboxScope) => ["admin", "threads", scope] as const,
  thread: (id: string) => ["admin", "thread", id] as const,
};

export function useAdminThreads(scope: InboxScope) {
  return useQuery({
    queryKey: keys.list(scope),
    queryFn: () => fetchAdminThreads(scope),
    refetchInterval: 20_000,
  });
}

export function useAdminThread(id: string) {
  return useQuery({
    queryKey: keys.thread(id),
    queryFn: () => fetchAdminThread(id),
    refetchInterval: 10_000,
  });
}

export function useAdminThreadAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "message"; body: string }
        | { type: "image"; file: Blob; filename: string; body?: string }
        | { type: "close" },
    ): Promise<Thread> => {
      switch (action.type) {
        case "message":
          return postAdminMessage(id, action.body);
        case "image":
          return postAdminImage(id, action.file, action.filename, action.body);
        case "close":
          return closeAdminThread(id);
      }
    },
    onSuccess: async (thread) => {
      queryClient.setQueryData(keys.thread(id), thread);
      await queryClient.invalidateQueries({ queryKey: ["admin", "threads"] });
    },
  });
}
