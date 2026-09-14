import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ReminderKind, Tournament } from "@/api/types/tournaments";
import { useMe } from "@/features/auth/hooks";
import { isPushSupported, usePushSubscription, useSubscribePush } from "@/features/push/hooks";
import {
  remindersFor,
  useSetReminders,
  useTournamentReminders,
} from "@/features/tournaments/reminders";
import { cn } from "@/lib/utils";

const LEAD_MINUTES = 5;

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "h-[18px] w-[18px] stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]",
        filled ? "fill-current" : "fill-none",
      )}
    >
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Колокольчик на карточке турнира (экраны §3.5, ответ 11.7): за 5 минут до старта и до конца
 * поздней регистрации. Первое включение просит разрешение на уведомления — нажатие на кнопку
 * и есть тот жест, без которого браузер разрешение не спросит.
 */
export function ReminderBell({ tournament, now }: { tournament: Tournament; now: Date }) {
  const { data: user } = useMe();
  const reminders = useTournamentReminders(Boolean(user));
  const save = useSetReminders(tournament.id);
  const push = usePushSubscription();
  const subscribe = useSubscribePush();
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const active = remindersFor(reminders.data, tournament.id);
  const options: { kind: ReminderKind; label: string; at: string | null }[] = [
    { kind: "start", label: `За ${LEAD_MINUTES} мин до старта`, at: tournament.starts_at },
    {
      kind: "late_reg",
      label: `За ${LEAD_MINUTES} мин до конца регистрации`,
      at: tournament.late_reg_closes_at,
    },
  ];
  const available = options.filter((option) => option.at !== null && new Date(option.at) > now);
  if (available.length === 0 && active.size === 0) return null;

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

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={active.size > 0 ? "Напоминания включены" : "Напомнить о турнире"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          active.size > 0 ? "text-gold bg-gold-soft" : "text-ink-3",
        )}
      >
        <BellIcon filled={active.size > 0} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Закрыть"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Напоминания"
            className="border-line-strong bg-surface shadow-elevated absolute top-9 right-0 z-50 w-[236px] rounded-md border p-1.5"
          >
            {!user ? (
              <p className="text-ink-2 px-2 py-1.5 text-[12.5px]">
                Напоминания о турнирах — для игроков клуба.{" "}
                <Link to="/login" className="text-gold font-bold">
                  Войти
                </Link>
              </p>
            ) : null}
            {(user ? available : []).map((option) => (
              <button
                key={option.kind}
                type="button"
                role="switch"
                aria-checked={active.has(option.kind)}
                disabled={save.isPending || subscribe.isPending}
                onClick={() => void toggle(option.kind)}
                className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] font-semibold disabled:opacity-60"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[11px]",
                    active.has(option.kind)
                      ? "border-line-gold bg-gold-grad text-ink-ongold"
                      : "border-line-strong",
                  )}
                  aria-hidden="true"
                >
                  {active.has(option.kind) ? "✓" : ""}
                </span>
                {option.label}
              </button>
            ))}
            {hint === "install" ? (
              <p className="text-ink-2 px-2 pt-1 pb-1.5 text-[12px]">
                Чтобы напоминание пришло,{" "}
                <Link to="/install" className="text-gold font-bold">
                  установите приложение на экран
                </Link>
                .
              </p>
            ) : null}
            {hint === "denied" ? (
              <p className="text-warn px-2 pt-1 pb-1.5 text-[12px]">
                Уведомления выключены в браузере — напоминание не придёт, пока их не разрешить.
              </p>
            ) : null}
            {save.isError ? (
              <p role="alert" className="text-danger px-2 pt-1 pb-1.5 text-[12px] font-semibold">
                {save.error instanceof ApiError ? save.error.message : "Не удалось сохранить"}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
