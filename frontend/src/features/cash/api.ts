import { apiGet } from "@/api/client";
import type { CashGame } from "@/api/types/cash";

// Запросы отдельно от страницы: тесты подменяют модуль целиком.
export const fetchCashGames = (signal?: AbortSignal) =>
  apiGet<CashGame[]>("/api/v1/cash-games", undefined, signal);
