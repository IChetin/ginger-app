import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchBroadcasts,
  fetchCrmSummary,
  fetchPlayerCard,
  previewBroadcast,
  sendBroadcast,
} from "@/features/admin/crm/crmApi";

export const crmKeys = {
  card: (id: string) => ["admin", "player-card", id] as const,
  summary: ["admin", "crm-summary"] as const,
  broadcasts: ["admin", "broadcasts"] as const,
};

export function usePlayerCard(id: string) {
  return useQuery({ queryKey: crmKeys.card(id), queryFn: () => fetchPlayerCard(id) });
}

export function useCrmSummary() {
  return useQuery({ queryKey: crmKeys.summary, queryFn: fetchCrmSummary });
}

export function useBroadcasts(enabled = true) {
  return useQuery({ queryKey: crmKeys.broadcasts, queryFn: fetchBroadcasts, enabled });
}

export function usePreviewBroadcast() {
  return useMutation({ mutationFn: previewBroadcast });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendBroadcast,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.broadcasts });
    },
  });
}

/** «Сегодня», «вчера», «5 дн. назад» или дата — сколько человек не появлялся. */
export function formatAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "не заходил";
  const moment = new Date(iso);
  const days = Math.floor((now.getTime() - moment.getTime()) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return moment.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  });
}

/** «через 3 дн.», «завтра», «сегодня 🎂» — для бейджа дня рождения. */
export function formatBirthdaySoon(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "ДР сегодня";
  if (days === 1) return "ДР завтра";
  return `ДР через ${days} дн.`;
}
