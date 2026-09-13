import { useMemo, type ReactNode } from "react";

import type { DayPeriod, PokerApp, ScheduleView, Tournament } from "@/api/types/tournaments";
import { SegmentedControl } from "@/components/filters";
import { useMe } from "@/features/auth/hooks";
import {
  BUYIN_STEPS_RUB,
  useNow,
  useTournamentFilters,
  useTournaments,
  type RangeKey,
} from "@/features/tournaments/hooks";
import {
  APP_LABELS,
  formatCountdown,
  formatDayLabel,
  formatMoney,
  formatTags,
  formatTimeMsk,
  groupByDay,
  lateRegLabel,
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
        "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold whitespace-nowrap",
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
    <label className="border-line bg-surface text-ink-2 flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold">
      {label}
      <select
        aria-label={`Бай-ин ${label}`}
        className="text-ink min-w-0 flex-1 bg-transparent font-bold outline-none"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">любой</option>
        {BUYIN_STEPS_RUB.map((step) => (
          <option key={step} value={step}>
            {rubFormat.format(step)} ₽
          </option>
        ))}
      </select>
    </label>
  );
}

/** Живой отсчёт поздней регистрации — свой тик, чтобы не перерисовывать весь список. */
function LateRegCountdown({ closesAt, compact }: { closesAt: Date; compact?: boolean }) {
  const now = useNow(1000);
  const left = formatCountdown(closesAt.getTime() - now.getTime());
  if (compact) {
    // В узкой колонке «Старт» подпись над отсчётом: «1:25:39» в одну строку с ней не влезает.
    return (
      <span className="text-warn num block leading-tight font-bold tabular-nums">
        <span className="block text-[10px] font-semibold">рег. ещё</span>
        {left}
      </span>
    );
  }
  return <span className="text-warn num font-bold tabular-nums">Регистрация ещё {left}</span>;
}

function TournamentCard({ tournament, now }: { tournament: Tournament; now: Date }) {
  const phase = tournamentPhase(tournament, now);
  const buyin = formatMoney(tournament.buyin, tournament.club);
  const guarantee = formatMoney(tournament.guarantee, tournament.club);
  const tags = formatTags(tournament);
  const closes = lateRegLabel(tournament);

  return (
    <article
      data-testid="tournament-card"
      className={cn(
        "bg-surface rounded-lg border p-3",
        tournament.is_promoted ? "border-line-gold" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="num w-[52px] shrink-0 text-[17px] font-extrabold tabular-nums">
          {formatTimeMsk(tournament.starts_at)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-ink line-clamp-2 text-[15px] leading-tight font-bold">
            {tournament.name}
          </h3>
          <p className="text-ink-3 mt-0.5 text-[12px]">
            {tournament.club.name} · {APP_LABELS[tournament.club.app]}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-ink text-[16px] font-extrabold">{buyin}</div>
          {guarantee ? (
            <div className="num text-ink-2 text-[12px] font-semibold">GTD {guarantee}</div>
          ) : null}
        </div>
      </div>
      {tags.length > 0 || closes || phase.kind === "late_reg" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[64px] text-[12px]">
          {tags.map((tag) => (
            <span key={tag} className="bg-surface-3 text-ink-2 rounded-sm px-1.5 py-0.5 font-bold">
              {tag}
            </span>
          ))}
          {phase.kind === "late_reg" ? (
            <LateRegCountdown closesAt={phase.closesAt} />
          ) : closes ? (
            <span className="text-ink-3 font-semibold">{closes}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CardsView({ groups, now }: { groups: [string, Tournament[]][]; now: Date }) {
  return (
    <div className="px-4">
      {groups.map(([day, items]) => (
        <section key={day} className="pt-4">
          <h2 className="text-ink-3 mb-2 text-[13px] font-bold tracking-[0.04em] uppercase">
            {formatDayLabel(day, now)}
          </h2>
          <div className="flex flex-col gap-2">
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
    <div className="mt-3 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[76px]" />
          <col />
          <col className="w-[62px]" />
          <col className="w-[72px]" />
        </colgroup>
        <thead>
          <tr className="text-ink-3 border-line border-b text-[11px] font-bold uppercase">
            <th className="py-2 pl-4 text-left">Старт</th>
            <th className="py-2 text-left">Турнир</th>
            <th className="py-2 text-right">Бай-ин</th>
            <th className="py-2 pr-4 text-right">GTD</th>
          </tr>
        </thead>
        {groups.map(([day, items]) => (
          <tbody key={day}>
            <tr>
              <th
                colSpan={4}
                scope="colgroup"
                className="bg-surface-2 text-ink-2 px-4 py-1.5 text-left text-[12px] font-bold"
              >
                {formatDayLabel(day, now)}
              </th>
            </tr>
            {items.map((item) => {
              const phase = tournamentPhase(item, now);
              return (
                <tr key={item.id} className="border-line border-b" data-testid="tournament-row">
                  <td className="num py-2 pl-4 whitespace-nowrap tabular-nums">
                    {phase.kind === "late_reg" ? (
                      <LateRegCountdown closesAt={phase.closesAt} compact />
                    ) : (
                      <span className="text-ink font-bold">{formatTimeMsk(item.starts_at)}</span>
                    )}
                  </td>
                  <td className="min-w-0 py-2 pr-2">
                    <div
                      className={cn(
                        "truncate",
                        item.is_promoted &&
                          "bg-gold-soft text-gold -mx-1.5 rounded-sm px-1.5 font-bold",
                      )}
                    >
                      <span className={item.is_promoted ? undefined : "text-ink font-semibold"}>
                        {item.name}
                      </span>
                      <span className="text-ink-3 ml-1.5 text-[11px] font-normal">
                        {item.club.name}
                      </span>
                    </div>
                  </td>
                  <td className="num text-ink py-2 text-right font-bold whitespace-nowrap">
                    {formatMoney(item.buyin, item.club)}
                  </td>
                  <td className="num text-ink-2 py-2 pr-4 text-right whitespace-nowrap">
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
    <div className="bg-bg min-h-full pb-5" data-testid="tournaments-page">
      <header className="border-line bg-bg/88 sticky top-0 z-20 border-b pt-3.5 backdrop-blur-[14px]">
        <div className="flex items-baseline justify-between px-4 pb-2.5">
          <h1 className="text-[19px] font-extrabold tracking-tight">Турниры</h1>
          <span className="text-ink-3 text-[12px] font-semibold">Время московское</span>
        </div>
        <SegmentedControl
          options={RANGE_OPTIONS}
          value={filters.range}
          onChange={(value) => update({ range: value as RangeKey })}
        />
        <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden">
          {APP_OPTIONS.map((app) => (
            <Chip
              key={app}
              active={filters.apps.includes(app)}
              onClick={() => update({ apps: toggle(filters.apps, app) })}
            >
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
        </div>
        <div className="flex gap-1.5 px-4 pb-2.5">
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

      <div className="text-ink-3 flex items-center justify-between px-4 pt-3 text-[12px] font-semibold">
        <span aria-live="polite">
          {query.isSuccess
            ? `${visible.length} ${pluralRu(visible.length, "турнир", "турнира", "турниров")}`
            : " "}
          {filters.buyinMin !== null || filters.buyinMax !== null ? " · бай-ин примерно в ₽" : ""}
        </span>
        {hasFilters ? (
          <button type="button" className="text-gold font-bold" onClick={reset}>
            Сбросить
          </button>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="space-y-2 px-4 pt-4" data-testid="tournaments-loading">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-surface h-[72px] rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="border-line bg-surface mx-4 mt-4 rounded-lg border px-4 py-8 text-center">
          <p className="text-ink text-[15px] font-semibold">Не удалось загрузить турниры</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="bg-gold-soft text-gold mt-4 h-11 rounded-full px-5 text-[13px] font-bold"
          >
            Повторить
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="border-line-gold bg-surface mx-4 mt-4 rounded-lg border border-dashed px-4 py-10 text-center">
          <p className="text-ink text-base font-bold">Турниров не найдено</p>
          <p className="text-ink-2 mt-2 text-sm">
            {hasFilters ? "Попробуйте ослабить фильтры" : "Расписание ещё не загружено"}
          </p>
        </div>
      ) : view === "table" ? (
        <TableView groups={groups} now={now} />
      ) : (
        <CardsView groups={groups} now={now} />
      )}

      <p className="text-ink-3 px-4 pt-5 text-center text-[12px]">
        Расписание ориентировочное: клубы могут менять сетку
      </p>
    </div>
  );
}
