import { Drawer } from "@base-ui/react/drawer";
import { Link } from "react-router-dom";

import type { ReminderKind, Tournament } from "@/api/types/tournaments";
import { BellIcon, ReminderHints } from "@/features/tournaments/components/ReminderBell";
import { useNow } from "@/features/tournaments/hooks";
import { useReminderToggle } from "@/features/tournaments/useReminderToggle";
import { cn } from "@/lib/utils";
import {
  APP_LABELS,
  displayName,
  formatMoney,
  formatTags,
  formatTimeMsk,
} from "@/features/tournaments/lib/format";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  weekday: "short",
  day: "numeric",
  month: "long",
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md px-3 py-2">
      <p className="text-ink-3 text-[11px] font-semibold">{label}</p>
      <p className="num text-ink text-[16px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="border-line flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <dt className="text-ink-2 text-[13px]">{label}</dt>
      <dd className="num text-ink m-0 text-right text-[13.5px] font-semibold">{value}</dd>
    </div>
  );
}

/**
 * Две кнопки с колокольчиком: пуш за 5 минут до старта и за 5 минут до конца поздней
 * регистрации, то есть про аддон. У турниров без аддона второй кнопки нет.
 */
function SheetReminders({ tournament }: { tournament: Tournament }) {
  const now = useNow(30_000);
  const reminder = useReminderToggle(tournament);
  const options: { kind: ReminderKind; label: string; at: string | null }[] = [
    { kind: "start", label: "Уведомить о старте", at: tournament.starts_at },
    {
      kind: "late_reg",
      label: "Напомнить про аддон",
      // Без аддона конец реги даёт 5–15 бб — напоминать смысла нет (Иван, 14.09).
      at: tournament.has_addon ? tournament.late_reg_closes_at : null,
    },
  ];
  const available = options.filter(
    (option) =>
      option.at !== null && (new Date(option.at) > now || reminder.active.has(option.kind)),
  );
  if (available.length === 0) return null;

  if (reminder.isGuest) {
    return (
      <p className="text-ink-2 mt-4 text-center text-[12.5px]">
        Напоминания о турнирах — для игроков клуба.{" "}
        <Link to="/login" className="text-gold font-bold">
          Войти
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-1.5">
        {available.map((option) => {
          const on = reminder.active.has(option.kind);
          return (
            <button
              key={option.kind}
              type="button"
              aria-pressed={on}
              disabled={reminder.pending}
              onClick={() => void reminder.toggle(option.kind)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-md border px-2 text-[13px] font-bold disabled:opacity-60",
                available.length === 1 && "col-span-2",
                on ? "border-line-gold bg-gold-soft text-gold" : "border-line-strong text-ink",
              )}
            >
              <BellIcon filled={on} className="h-4 w-4 shrink-0" />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-ink-3 mt-1 text-center text-[11px]">Пуш придёт за 5 минут</p>
      <ReminderHints hint={reminder.hint} error={reminder.error} />
    </div>
  );
}

function withTerms(cost: string | null, terms: string | null, tournament: Tournament) {
  const money = formatMoney(cost, tournament.club);
  if (!money && !terms) return null;
  return [money, terms].filter(Boolean).join(" · ");
}

/**
 * Карточка турнира по тапу: формат и параметры, которых нет в строке таблицы, и переход
 * в клуб. Переход подтверждает родитель — он же знает ссылку клуба.
 */
export function TournamentSheet({
  tournament,
  onOpenChange,
  onOpenApp,
}: {
  tournament: Tournament | null;
  onOpenChange: (open: boolean) => void;
  onOpenApp?: (tournament: Tournament) => void;
}) {
  const open = tournament !== null;
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup
            data-testid="tournament-sheet"
            className="border-line-strong bg-surface max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none"
          >
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            {tournament ? <SheetBody tournament={tournament} onOpenApp={onOpenApp} /> : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SheetBody({
  tournament,
  onOpenApp,
}: {
  tournament: Tournament;
  onOpenApp?: (tournament: Tournament) => void;
}) {
  const { club } = tournament;
  const guarantee = formatMoney(tournament.guarantee, club);
  const lateReg = tournament.late_reg_closes_at
    ? `до ${formatTimeMsk(tournament.late_reg_closes_at)}`
    : null;
  const appLabel = APP_LABELS[club.app];

  return (
    <>
      <Drawer.Title className="text-ink text-[20px] leading-tight font-bold">
        {displayName(tournament)}
      </Drawer.Title>
      <Drawer.Description className="text-ink-2 mt-1 text-[13px]">
        {club.name} · {appLabel} · {dateFormat.format(new Date(tournament.starts_at))},{" "}
        {formatTimeMsk(tournament.starts_at)} МСК
      </Drawer.Description>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {formatTags(tournament).map((tag) => (
          <span
            key={tag}
            className="bg-gold-soft text-gold rounded-[6px] px-2 py-0.5 text-[12px] font-bold"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Бай-ин" value={formatMoney(tournament.buyin, club) ?? "—"} />
        <Stat label="Гарантия" value={guarantee ?? "—"} />
        <Stat label="Старт" value={formatTimeMsk(tournament.starts_at)} />
        <Stat label="Поздняя рег." value={lateReg ?? "—"} />
      </div>

      <dl className="mt-3">
        <Param
          label="Стартовый стек"
          value={tournament.start_stack ? tournament.start_stack.toLocaleString("ru-RU") : null}
        />
        <Param
          label="Уровни"
          value={tournament.level_minutes ? `${tournament.level_minutes} мин` : null}
        />
        <Param
          label="Поздняя регистрация"
          value={tournament.late_reg_levels ? `${tournament.late_reg_levels} уровней` : null}
        />
        <Param label="Структура" value={tournament.structure} />
        <Param
          label="За столом"
          value={tournament.table_size ? `${tournament.table_size}-max` : null}
        />
        <Param
          label="Ребай"
          value={withTerms(tournament.rebuy_cost, tournament.rebuy_terms, tournament)}
        />
        <Param
          label="Аддон"
          value={withTerms(tournament.addon_cost, tournament.addon_terms, tournament)}
        />
        <Param label="Заметка" value={tournament.notes} />
      </dl>

      <SheetReminders tournament={tournament} />

      {onOpenApp ? (
        <button
          type="button"
          onClick={() => onOpenApp(tournament)}
          className="bg-gold-grad text-ink-ongold shadow-sheen-glow mt-4 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-bold"
        >
          Открыть клуб в {appLabel}
        </button>
      ) : (
        <p className="text-ink-3 mt-4 text-center text-[12.5px]">
          Ссылка на клуб в {appLabel} скоро появится
        </p>
      )}
    </>
  );
}
