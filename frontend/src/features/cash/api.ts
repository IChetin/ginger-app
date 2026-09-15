import { apiGet } from "@/api/client";
import type { CashTable } from "@/api/types/cash";

// Запросы отдельно от страницы: тесты подменяют модуль целиком.
export const fetchCashTables = (signal?: AbortSignal) =>
  apiGet<CashTable[]>("/api/v1/cash-tables", undefined, signal);
