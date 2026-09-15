import { apiDelete, apiGet, apiPost } from "@/api/client";

export interface TelegramStatus {
  /** Бот настроен на сервере; иначе блок в профиле не показываем. */
  available: boolean;
  linked: boolean;
  username: string | null;
  bot_username: string | null;
}

export interface TelegramLinkStart {
  url: string;
  expires_at: string;
}

// Запросы отдельно от компонента: тесты подменяют модуль целиком.
export const fetchTelegramStatus = () => apiGet<TelegramStatus>("/api/v1/me/telegram");
export const startTelegramLink = () => apiPost<TelegramLinkStart>("/api/v1/me/telegram/link");
export const unlinkTelegram = () => apiDelete("/api/v1/me/telegram");
