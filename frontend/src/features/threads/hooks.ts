import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Thread, ThreadCreatePayload } from "@/api/types/threads";
import {
  createThread,
  fetchThread,
  fetchThreads,
  postThreadImage,
  postThreadMessage,
} from "@/features/threads/api";

export const threadKeys = {
  list: ["threads"] as const,
  thread: (id: string) => ["threads", id] as const,
};

/** Пуша на ответ менеджера в v1 нет (ТЗ §4.2а) — поэтому список опрашивается сам. */
export function useThreads(enabled = true) {
  return useQuery({
    queryKey: threadKeys.list,
    queryFn: () => fetchThreads(),
    enabled,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useUnreadDialogs(enabled = true): number {
  const threads = useThreads(enabled);
  return (threads.data ?? []).filter((thread) => thread.unread).length;
}

export function useThread(id: string) {
  return useQuery({
    queryKey: threadKeys.thread(id),
    queryFn: () => fetchThread(id),
    refetchInterval: 10_000,
  });
}

function useStoreThread() {
  const queryClient = useQueryClient();
  return async (thread: Thread) => {
    queryClient.setQueryData(threadKeys.thread(thread.id), thread);
    await queryClient.invalidateQueries({ queryKey: threadKeys.list, exact: true });
  };
}

export function useCreateThread() {
  const store = useStoreThread();
  return useMutation({
    mutationFn: (body: ThreadCreatePayload) => createThread(body),
    onSuccess: store,
  });
}

export function usePostThreadMessage(id: string) {
  const store = useStoreThread();
  return useMutation({
    mutationFn: (vars: { body: string } | { file: Blob; filename: string; body?: string }) =>
      "file" in vars
        ? postThreadImage(id, vars.file, vars.filename, vars.body)
        : postThreadMessage(id, vars.body),
    onSuccess: store,
  });
}
