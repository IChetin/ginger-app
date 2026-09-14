import { useState } from "react";

import { ApiError } from "@/api/client";
import type { ReminderKind, Tournament } from "@/api/types/tournaments";
import { useMe } from "@/features/auth/hooks";
import { isPushSupported, usePushSubscription, useSubscribePush } from "@/features/push/hooks";
import {
  remindersFor,
  useSetReminders,
  useTournamentReminders,
} from "@/features/tournaments/reminders";

export type ReminderHint = "install" | "denied" | null;

/**
 * Включение и выключение напоминаний турнира — общее для колокольчика в карточке и кнопок
 * в «всплывайке». Первое включение просит разрешение на уведомления: нажатие на кнопку и есть
 * тот жест, без которого браузер разрешение не спросит.
 */
export function useReminderToggle(tournament: Tournament) {
  const { data: user } = useMe();
  const reminders = useTournamentReminders(Boolean(user));
  const save = useSetReminders(tournament.id);
  const push = usePushSubscription();
  const subscribe = useSubscribePush();
  const [hint, setHint] = useState<ReminderHint>(null);

  const active = remindersFor(reminders.data, tournament.id);

  const toggle = async (kind: ReminderKind) => {
    setHint(null);
    const next = new Set(active);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
      if (!isPushSupported()) {
        setHint("install");
      } else if (!push.data) {
        try {
          await subscribe.mutateAsync();
        } catch {
          setHint("denied");
        }
      }
    }
    save.mutate([...next]);
  };

  return {
    isGuest: !user,
    active,
    toggle,
    hint,
    pending: save.isPending || subscribe.isPending,
    error: save.isError
      ? save.error instanceof ApiError
        ? save.error.message
        : "Не удалось сохранить"
      : null,
  };
}
