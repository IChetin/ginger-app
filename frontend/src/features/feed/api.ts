import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPost,
  createWin,
  deletePost,
  deletePostImage,
  deleteWin,
  fetchAdminPosts,
  fetchAdminWins,
  fetchFeed,
  fetchWinsHistory,
  importWinsCsv,
  updatePost,
  uploadPostImage,
  type FeedPostPayload,
} from "@/features/feed/feedApi";

export type {
  Feed,
  FeedPost,
  FeedPostAdmin,
  FeedPostPayload,
  WinCreatePayload,
  WinItem,
} from "@/features/feed/feedApi";

const keys = {
  feed: ["feed"] as const,
  winsHistory: ["feed", "wins"] as const,
  adminWins: ["admin", "wins"] as const,
  adminPosts: ["admin", "posts"] as const,
};

export function useFeed() {
  return useQuery({
    queryKey: keys.feed,
    queryFn: fetchFeed,
    // Турниры стартуют, вечер сменяется — лента живая.
    refetchInterval: 5 * 60_000,
  });
}

/** Полная история выигрышей — страница по тапу на баннер. */
export function useWinsHistory() {
  return useQuery({ queryKey: keys.winsHistory, queryFn: fetchWinsHistory });
}

export function useAdminWins() {
  return useQuery({ queryKey: keys.adminWins, queryFn: fetchAdminWins });
}

export function useCreateWin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.adminWins });
      void queryClient.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useImportWins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importWinsCsv(file, file.name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.adminWins });
      void queryClient.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useDeleteWin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.adminWins });
      void queryClient.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

/** Записи в ленте: после любой правки обновляем и админский список, и саму ленту. */
function usePostMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.adminPosts });
      void queryClient.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useAdminPosts() {
  return useQuery({ queryKey: keys.adminPosts, queryFn: fetchAdminPosts });
}

export function useCreatePost() {
  return usePostMutation(createPost);
}

export function useUpdatePost() {
  return usePostMutation(({ id, body }: { id: string; body: FeedPostPayload }) =>
    updatePost(id, body),
  );
}

export function useDeletePost() {
  return usePostMutation(deletePost);
}

export function useUploadPostImage() {
  return usePostMutation(({ id, file }: { id: string; file: File }) =>
    uploadPostImage(id, file, file.name),
  );
}

export function useDeletePostImage() {
  return usePostMutation(deletePostImage);
}
