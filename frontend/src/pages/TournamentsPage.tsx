import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import type { ScheduleView, Tournament } from "@/api/types/tournaments";
import { useMe } from "@/features/auth/hooks";
import {
  AppIcon,
  LateRegCountdown,
  TournamentCard,
} from "@/features/tournaments/components/TournamentCard";
import { TournamentSheet } from "@/features/tournaments/components/TournamentSheet";
import {
  PRICE_TIERS,
  applyTournamentFilters,
  useNow,
  useTournamentFilters,
  useTournaments,
  type RangeKey,
} from "@/features/tournaments/hooks";
import {
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

function DayHeader({ day, now }: { day: string; now: Date }) {
  return (
    <h2 className="text-ink-3 px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.04em] uppercase">
      {formatDayLabel(day, now)} · МСК
    </h2>
  );
}

type ViewProps = {
  groups: [string, Tournament[]][];
  now: Date;
  onSelect: (tournament: Tournament) => void;
};

/** Тап по турниру открывает карточку; колокольчик и другие кнопки внутри живут своей жизнью. */
function selectUnlessButton(event: MouseEvent, select: () => void) {
  if ((event.target as HTMLElement).closest("button, a")) return;
  select();
}

function selectOnEnter(event: KeyboardEvent, select: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select();
  }
}

function CardsView({ groups, now, onSelect }: ViewProps) {
  return (
    <div>
      {groups.map(([day, items]) => (
        <section key={day}>
          <DayHeader day={day} now={now} />
          <div className="flex flex-col gap-1.5 px-3">
            {items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`Подробнее: ${displayName(item)}`}
                className="cursor-pointer"
                onClick={(event) => selectUnlessButton(event, () => onSelect(item))}
                onKeyDown={(event) => selectOnEnter(event, () => onSelect(item))}
              >
                <TournamentCard tournament={item} now={now} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** «Золото по ценности»: пороги в рублях, общие для всех клубов (гарантия ~$2 000 и ~$500). */
const GUARANTEE_HI_RUB = 180_000;
const GUARANTEE_MID_RUB = 45_000;
const BUYIN_HI_RUB = 2_700;
const SOON_MINUTES = 60;

type ValueTier = "hi" | "mid" | null;

function valueTier(rub: string | null, hi: number, mid = Number.POSITIVE_INFINITY): ValueTier {
  if (rub === null) return null;
  const value = Number(rub);
  if (value >= hi) return "hi";
  if (value >= mid) return "mid";
  return null;
}

/** Короткие метки формата для строки таблицы: длинные «Early Bird» и «Билет» — в карточках. */
function rowTags(tournament: Tournament): string[] {
  const tags: string[] = [];
  if (tournament.game_type === "plo") tags.push("PLO");
  if (tournament.game_type === "plo5") tags.push("PLO5");
  if (tournament.bounty_kind === "pko") tags.push("PKO");
  if (tournament.bounty_kind === "ko") tags.push("KO");
  if (tournament.bounty_kind === "mystery") tags.push("MYST");
  if (tournament.bounty_kind !== "pko" && tournament.bounty_kind !== "mystery") tags.push("R+A");
  return tags;
}

function StartCell({ tournament, now }: { tournament: Tournament; now: Date }) {
  const phase = tournamentPhase(tournament, now);
  if (phase.kind === "late_reg") {
    return <LateRegCountdown closesAt={phase.closesAt} compact />;
  }
  const minutes = Math.ceil((new Date(tournament.starts_at).getTime() - now.getTime()) / 60_000);
  if (minutes <= SOON_MINUTES) {
    return (
      <span className="text-live block text-[11.5px] leading-tight font-bold">
        через {minutes} мин
      </span>
    );
  }
  return <span className="text-ink font-bold">{formatTimeMsk(tournament.starts_at)}</span>;
}

/**
 * Плотный вид по образцу лобби GG: одна строка — один турнир. Цвет несут только время
 * (поздняя регистрация, скорый старт) и деньги: крупная гарантия и дорогой бай-ин — золотом.
 * Форматы — серыми метками, сателлиты уходят в тень.
 */
function TableView({ groups, now, onSelect }: ViewProps) {
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[60px]" />
          <col />
          <col className="w-[56px]" />
          <col className="w-[74px]" />
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
              const satellite = Boolean(item.satellite_target);
              const guaranteeTier = satellite
                ? null
                : valueTier(item.guarantee_rub, GUARANTEE_HI_RUB, GUARANTEE_MID_RUB);
              const buyinTier = satellite ? null : valueTier(item.buyin_rub, BUYIN_HI_RUB);
              const guarantee = formatMoney(item.guarantee, item.club);
              return (
                <tr
                  key={item.id}
                  className={cn(
                    "border-line hover:bg-surface cursor-pointer border-b",
                    guaranteeTier === "hi" &&
                      "bg-[linear-gradient(90deg,transparent_35%,var(--gold-soft))]",
                  )}
                  data-testid="tournament-row"
                  data-value={guaranteeTier ?? undefined}
                  tabIndex={0}
                  aria-label={`Подробнее: ${displayName(item)}`}
                  onClick={(event) => selectUnlessButton(event, () => onSelect(item))}
                  onKeyDown={(event) => selectOnEnter(event, () => onSelect(item))}
                >
                  <td className="num py-1.5 pl-3 whitespace-nowrap tabular-nums">
                    <StartCell tournament={item} now={now} />
                  </td>
                  <td className="min-w-0 py-1.5 pr-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <AppIcon app={item.club.app} className="h-3.5 w-3.5 shrink-0" />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          satellite
                            ? "text-ink-3 font-medium"
                            : item.is_promoted
                              ? "text-gold font-bold"
                              : guaranteeTier === "hi"
                                ? "text-ink font-bold"
                                : "text-ink font-semibold",
                        )}
                      >
                        {displayName(item)}
                      </span>
                      {rowTags(item).map((tag) => (
                        <span
                          key={tag}
                          className="bg-surface-2 text-ink-3 shrink-0 rounded-[4px] px-1 text-[9.5px] leading-[15px] font-bold tracking-[0.03em]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "num py-1.5 text-right font-bold whitespace-nowrap",
                      satellite ? "text-ink-3" : buyinTier === "hi" ? "text-value-hi" : "text-ink",
                    )}
                  >
                    {formatMoney(item.buyin, item.club)}
                  </td>
                  <td
                    className={cn(
                      "num py-1.5 pr-3 text-right text-[12.5px] whitespace-nowrap",
                      guaranteeTier === "hi"
                        ? "text-value-hi font-bold"
                        : guaranteeTier === "mid"
                          ? "text-value-mid font-semibold"
                          : guarantee
                            ? "text-ink-2"
                            : "text-ink-3",
                    )}
                  >
                    {guarantee ?? "—"}
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
  const view: ScheduleView = user?.schedule_view ?? "table";

  const visible = useMemo(
    () =>
      applyTournamentFilters(query.data ?? [], filters).filter(
        (item) => tournamentPhase(item, now).kind !== "closed",
      ),
    [query.data, filters, now],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const hasFilters = filters.prices.length > 0 || filters.showSatellites;
  const [selected, setSelected] = useState<Tournament | null>(null);

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
          {PRICE_TIERS.map((tier) => (
            <Chip
              key={tier.value}
              active={filters.prices.includes(tier.value)}
              onClick={() => update({ prices: toggle(filters.prices, tier.value) })}
            >
              {tier.label}
            </Chip>
          ))}
          <label
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-bold whitespace-nowrap",
              filters.showSatellites
                ? "border-line-gold bg-gold-soft text-gold"
                : "border-line bg-surface text-ink-2",
            )}
          >
            <input
              type="checkbox"
              className="accent-gold h-3.5 w-3.5"
              checked={filters.showSatellites}
              onChange={(event) => update({ showSatellites: event.target.checked })}
            />
            Сателлиты
          </label>
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
        <TableView groups={groups} now={now} onSelect={setSelected} />
      ) : (
        <CardsView groups={groups} now={now} onSelect={setSelected} />
      )}

      <TournamentSheet
        tournament={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />

      <p className="text-ink-3 px-4 pt-4 text-center text-[11px]">
        Расписание ориентировочное · цена в фильтре — примерный эквивалент в ₽
      </p>
    </div>
  );
}
