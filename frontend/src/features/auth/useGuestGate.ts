import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMe } from "@/features/auth/hooks";

/**
 * Гость без входа видит ближайшие сутки MTT и строку турнира; неделя, Editor's Pick и детали —
 * для игроков клуба (защита базы, решение 15.09). Здесь — предложение войти вместо действия.
 */
export function useGuestGate() {
  const me = useMe();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isGuest = me.isFetched && !me.data;

  const requireLogin = useCallback(
    async (what: string) => {
      const ok = await confirm({
        title: "Нужен вход",
        description: `${what} — для игроков клуба. Войти?`,
        confirmLabel: "Войти",
        cancelLabel: "Не сейчас",
      });
      if (ok) navigate("/login");
    },
    [confirm, navigate],
  );

  // ready — уже известно, гость это или игрок: до этого не запрашиваем данные, которые гостю урезаны.
  return { isGuest, ready: me.isFetched, requireLogin };
}

/** Сервер ограничил частоту запросов — сказать игроку, сколько подождать. */
export function rateLimitMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60));
  return `Слишком много запросов. Попробуйте через ${minutes} мин.`;
}
