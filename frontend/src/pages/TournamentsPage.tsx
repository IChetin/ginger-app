import { useMemo, type ReactNode } from "react";

import type { DayPeriod, PokerApp, ScheduleView, Tournament } from "@/api/types/tournaments";
import { useMe } from "@/features/auth/hooks";
import {
  AppIcon,
  LateRegCountdown,
  TournamentCard,
} from "@/features/tournaments/components/TournamentCard";
import {
  BUYIN_STEPS_RUB,
  useNow,
  useTournamentFilters,
  useTournaments,
  type RangeKey,
} from "@/features/tournaments/hooks";
import {
  APP_LABELS,
  displayName,
  formatDayLabel,
  formatMoney,
  formatTimeMsk,
  groupByDay,
  tournamentPhase,
} from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "day", label: "24 часа" },
  { value: "3days", label: "3 дня" },
  { value: "week", label: "Неделя" },
];

const APP_OPTIONS: PokerApp[] = ["pppoker", "xpoker", "poker21"];

const PERIOD_OPTIONS: { value: DayPeriod; label: string }[] = [
  { value: "day", label: "День" },
  { value: "evening", label: "Вечер" },
  { value: "night", label: "Ночь" },
];

const rubFormat = new Intl.NumberFormat("ru-RU");

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-bold whitespace-nowrap",
        active ? "border-line-gold bg-gold-soft text-gold" : "border-line bg-surface text-ink-2",
      )}
    >
      {children}
    </button>
  );
}

function BuyinSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border pr-1.5 pl-2.5 text-[12px] font-bold",
        value === null
          ? "border-line bg-surface text-ink-2"
          : "border-line-gold bg-gold-soft text-gold",
      )}
    >
      {label}
      <select
        aria-label={`Бай-ин ${label}`}
        className="bg-transparent font-bold outline-none"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">—</option>
        {BUYIN_STEPS_RUB.map((step) => (
          <option key={step} value={step}>
            {rubFormat.format(step)} ₽
          </option>
        ))}
      </select>
    </label>
  );
}

function DayHeader({ day, now }: { day: string; now: Date }) {
  return (
    <h2 className="text-ink-3 px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.04em] uppercase">
      {formatDayLabel(day, now)} · МСК
    </h2>
  );
}

function CardsView({ groups, now }: { groups: [string, Tournament[]][]; now: Date }) {
  return (
    <div>
      {groups.map(([day, items]) => (
        <section key={day}>
          <DayHeader day={day} now={now} />
          <div className="flex flex-col gap-1.5 px-3">
            {items.map((item) => (
              <TournamentCard key={item.id} tournament={item} now={now} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Плотный вид по образцу лобби Покерка: одна строка — один турнир. */
function TableView({ groups, now }: { groups: [string, Tournament[]][]; now: Date }) {
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[64px]" />
          <col />
          <col className="w-[58px]" />
          <col className="w-[70px]" />
        </colgroup>
        <thead>
          <tr className="text-ink-3 border-line border-b text-[10px] font-bold uppercase">
            <th className="py-1.5 pl-3 text-left">МСК</th>
            <th className="py-1.5 text-left">Турнир</th>
            <th className="py-1.5 text-right">Бай-ин</th>
            <th className="py-1.5 pr-3 text-right">GTD</th>
          </tr>
        </thead>
        {groups.map(([day, items]) => (
          <tbody key={day}>
            <tr>
              <th
                colSpan={4}
                scope="colgroup"
                className="bg-surface-2 text-ink-2 px-3 py-1 text-left text-[11px] font-bold"
              >
                {formatDayLabel(day, now)}
              </th>
            </tr>
            {items.map((item) => {
              const phase = tournamentPhase(item, now);
              return (
                <tr key={item.id} className="border-line border-b" data-testid="tournament-row">
                  <td className="num py-1.5 pl-3 whitespace-nowrap tabular-nums">
                    {phase.kind === "late_reg" ? (
                      <LateRegCountdown closesAt={phase.closesAt} compact />
                    ) : (
                      <span className="text-ink font-bold">{formatTimeMsk(item.starts_at)}</span>
                    )}
                  </td>
                  <td className="min-w-0 py-1.5 pr-2">
                    <div
                      className={cn(
                        "truncate",
                        item.is_promoted &&
                          "bg-gold-soft text-gold -mx-1.5 rounded-sm px-1.5 font-bold",
                      )}
                    >
                      <AppIcon
                        app={item.club.app}
                        className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]"
                      />
                      <span className={item.is_promoted ? undefined : "text-ink font-semibold"}>
                        {displayName(item)}
                      </span>
                    </div>
                  </td>
                  <td className="num text-ink py-1.5 text-right font-bold whitespace-nowrap">
                    {formatMoney(item.buyin, item.club)}
                  </td>
                  <td className="num text-ink-2 py-1.5 pr-3 text-right whitespace-nowrap">
                    {formatMoney(item.guarantee, item.club) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function TournamentsPage() {
  const { data: user } = useMe();
  const { filters, update, reset } = useTournamentFilters();
  const query = useTournaments(filters);
  const now = useNow(30_000);
  const view: ScheduleView = user?.schedule_view ?? "cards";

  const visible = useMemo(
    () => (query.data ?? []).filter((item) => tournamentPhase(item, now).kind !== "closed"),
    [query.data, now],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const hasFilters =
    filters.apps.length > 0 ||
    filters.periods.length > 0 ||
    filters.buyinMin !== null ||
    filters.buyinMax !== null;

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="tournaments-page">
      {/* Телефон первым: заголовок, счётчик и период — одна строка, все фильтры — вторая. */}
      <header className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <h1 className="text-[17px] font-extrabold tracking-tight">Турниры</h1>
          <span
            aria-live="polite"
            className="text-ink-3 num min-w-0 flex-1 truncate text-[12px] font-semibold"
          >
            {query.isSuccess
              ? `${visible.length} ${pluralRu(visible.length, "турнир", "турнира", "турниров")}`
              : ""}
          </span>
          <div
            role="tablist"
            aria-label="Период"
            className="bg-surface border-line flex shrink-0 rounded-full border p-0.5"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filters.range === option.value}
                onClick={() => update({ range: option.value })}
                className={cn(
                  "h-7 rounded-full px-2.5 text-[12px] font-bold",
                  filters.range === option.value ? "bg-surface-3 text-ink" : "text-ink-3",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pb-2 [&::-webkit-scrollbar]:hidden">
          {hasFilters ? (
            <button
              type="button"
              aria-label="Сбросить фильтры"
              onClick={reset}
              className="text-gold border-line-gold h-8 shrink-0 rounded-full border px-2.5 text-[12px] font-bold"
            >
              ✕
            </button>
          ) : null}
          {APP_OPTIONS.map((app) => (
            <Chip
              key={app}
              active={filters.apps.includes(app)}
              onClick={() => update({ apps: toggle(filters.apps, app) })}
            >
              <AppIcon app={app} className="h-4 w-4" />
              {APP_LABELS[app]}
            </Chip>
          ))}
          {PERIOD_OPTIONS.map((period) => (
            <Chip
              key={period.value}
              active={filters.periods.includes(period.value)}
              onClick={() => update({ periods: toggle(filters.periods, period.value) })}
            >
              {period.label}
            </Chip>
          ))}
          <BuyinSelect
            label="от"
            value={filters.buyinMin}
            onChange={(buyinMin) => update({ buyinMin })}
          />
          <BuyinSelect
            label="до"
            value={filters.buyinMax}
            onChange={(buyinMax) => update({ buyinMax })}
          />
        </div>
      </header>

      {query.isPending ? (
        <div className="space-y-1.5 px-3 pt-3" data-testid="tournaments-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-surface h-[52px] rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="border-line bg-surface mx-3 mt-3 rounded-md border px-4 py-6 text-center">
          <p className="text-ink text-[14px] font-semibold">Не удалось загрузить турниры</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="bg-gold-soft text-gold mt-3 h-10 rounded-full px-5 text-[13px] font-bold"
          >
            Повторить
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="border-line-gold bg-surface mx-3 mt-3 rounded-md border border-dashed px-4 py-6 text-center">
          <p className="text-ink text-[15px] font-bold">Турниров не найдено</p>
          <p className="text-ink-2 mt-1 text-[13px]">
            {hasFilters ? "Попробуйте ослабить фильтры" : "Расписание ещё не загружено"}
          </p>
        </div>
      ) : view === "table" ? (
        <TableView groups={groups} now={now} />
      ) : (
        <CardsView groups={groups} now={now} />
      )}

      <p className="text-ink-3 px-4 pt-4 text-center text-[11px]">
        Расписание ориентировочное · бай-ин в ₽ в фильтре — примерно
      </p>
    </div>
  );
}
