import { useState } from "react";
import { Link } from "react-router-dom";

import type { ReminderKind, Tournament } from "@/api/types/tournaments";
import { useReminderToggle, type ReminderHint } from "@/features/tournaments/useReminderToggle";
import { cn } from "@/lib/utils";

const LEAD_MINUTES = 5;

export function BellIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "h-[18px] w-[18px] stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]",
        filled ? "fill-current" : "fill-none",
        className,
      )}
    >
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** Подсказки под напоминаниями: нет установки на экран, уведомления запрещены, ошибка. */
export function ReminderHints({ hint, error }: { hint: ReminderHint; error: string | null }) {
  return (
    <>
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
      {error ? (
        <p role="alert" className="text-danger px-2 pt-1 pb-1.5 text-[12px] font-semibold">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * Колокольчик на карточке турнира (экраны §3.5, ответ 11.7): за 5 минут до старта и до конца
 * поздней регистрации.
 */
export function ReminderBell({ tournament, now }: { tournament: Tournament; now: Date }) {
  const reminder = useReminderToggle(tournament);
  const [open, setOpen] = useState(false);

  const options: { kind: ReminderKind; label: string; at: string | null }[] = [
    { kind: "start", label: `За ${LEAD_MINUTES} мин до старта`, at: tournament.starts_at },
    {
      kind: "late_reg",
      label: `За ${LEAD_MINUTES} мин до конца регистрации`,
      at: tournament.late_reg_closes_at,
    },
  ];
  const available = options.filter((option) => option.at !== null && new Date(option.at) > now);
  const { active } = reminder;
  if (available.length === 0 && active.size === 0) return null;

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
            {reminder.isGuest ? (
              <p className="text-ink-2 px-2 py-1.5 text-[12.5px]">
                Напоминания о турнирах — для игроков клуба.{" "}
                <Link to="/login" className="text-gold font-bold">
                  Войти
                </Link>
              </p>
            ) : null}
            {(reminder.isGuest ? [] : available).map((option) => (
              <button
                key={option.kind}
                type="button"
                role="switch"
                aria-checked={active.has(option.kind)}
                disabled={reminder.pending}
                onClick={() => void reminder.toggle(option.kind)}
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
            <ReminderHints hint={reminder.hint} error={reminder.error} />
          </div>
        </>
      ) : null}
    </div>
  );
}
