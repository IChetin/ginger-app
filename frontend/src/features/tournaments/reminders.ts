import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ReminderKind, TournamentReminder } from "@/api/types/tournaments";
import { fetchReminders, putReminders } from "@/features/tournaments/remindersApi";

const KEY = ["tournament-reminders"] as const;

/** Колокольчики игрока — один запрос на весь список турниров. */
export function useTournamentReminders() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchReminders,
    staleTime: 60_000,
    retry: false,
  });
}

export function remindersFor(
  reminders: TournamentReminder[] | undefined,
  tournamentId: string,
): Set<ReminderKind> {
  return new Set(
    (reminders ?? [])
      .filter((item) => item.tournament_id === tournamentId)
      .map((item) => item.kind),
  );
}

export function useSetReminders(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kinds: ReminderKind[]) => putReminders(tournamentId, kinds),
    onSuccess: (saved) => {
      queryClient.setQueryData<TournamentReminder[]>(KEY, (current) => [
        ...(current ?? []).filter((item) => item.tournament_id !== tournamentId),
        ...saved,
      ]);
    },
  });
}
