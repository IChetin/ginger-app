function parseFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * Фиче-флаги приложения. Читаются из VITE_* переменных окружения.
 * Пока пусто — каркас оставлен от базы Day2, флаги раздач удалены вместе с реплеером.
 */
export const FEATURE_FLAGS = {
  parseFlag,
} as const;
