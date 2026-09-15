import { apiGet } from "@/api/client";
import type { LiveEvent, Tournament } from "@/api/types/tournaments";

// Запросы отдельно от компонентов: тесты подменяют модуль целиком.
export const fetchLiveEvents = (signal?: AbortSignal) =>
  apiGet<LiveEvent[]>("/api/v1/tournaments/live", undefined, signal);

export const fetchTournamentSatellites = (id: string, signal?: AbortSignal) =>
  apiGet<Tournament[]>(`/api/v1/tournaments/${id}/satellites`, undefined, signal);
