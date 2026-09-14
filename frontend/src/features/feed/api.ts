import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createWin, deleteWin, fetchAdminWins, fetchFeed } from "@/features/feed/feedApi";

export type { Feed, WinCreatePayload, WinItem } from "@/features/feed/feedApi";

const keys = {
  feed: ["feed"] as const,
  adminWins: ["admin", "wins"] as const,
};

export function useFeed() {
  return useQuery({
    queryKey: keys.feed,
    queryFn: fetchFeed,
    // Турниры стартуют, вечер сменяется — лента живая.
    refetchInterval: 5 * 60_000,
  });
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
