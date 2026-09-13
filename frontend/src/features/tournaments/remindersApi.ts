import { apiGet, apiPut } from "@/api/client";
import type { ReminderKind, TournamentReminder } from "@/api/types/tournaments";

// Запросы отдельно от хуков: так тесты подменяют их через vi.mock модуля.
export function fetchReminders(): Promise<TournamentReminder[]> {
  return apiGet("/api/v1/me/tournament-reminders");
}

export function putReminders(
  tournamentId: string,
  kinds: ReminderKind[],
): Promise<TournamentReminder[]> {
  return apiPut(`/api/v1/me/tournament-reminders/${tournamentId}`, { kinds });
}
