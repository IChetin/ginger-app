import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import type { CashTable } from "@/api/types/cash";
import { ScheduleTabs } from "@/components/layout/ScheduleTabs";
import { fetchCashTables } from "@/features/cash/api";
import { CashTableSheet } from "@/features/cash/CashTableSheet";
import {
  CASH_GAMES,
  EMPTY_CASH_FILTERS,
  GAME_LABELS,
  STAKE_TIERS,
  applyCashFilters,
  formatBlinds,
  groupByGame,
  latestSeen,
  minutesAgo,
  type CashFilters,
} from "@/features/cash/lib";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { useNow } from "@/features/tournaments/hooks";
import { formatMoney } from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ginger.cash.filters.v1";

function readStoredFilters(): CashFilters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CASH_FILTERS;
    const stored = JSON.parse(raw) as Partial<CashFilters>;
    return {
      games: Array.isArray(stored.games)
        ? stored.games.filter((game) => CASH_GAMES.includes(game))
        : [],
      stakes: Array.isArray(stored.stakes)
        ? stored.stakes.filter((tier) => STAKE_TIERS.some((option) => option.value === tier))
        : [],
    };
  } catch {
    return EMPTY_CASH_FILTERS;
  }
}

/** Фильтр запоминается между заходами, как у турниров. */
function useCashFilters() {
  const [filters, setFilters] = useState<CashFilters>(readStoredFilters);
  const update = useCallback((patch: Partial<CashFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // приватный режим / запрет хранилища — фильтр просто не запомнится
      }
      return next;
    });
  }, []);
  return { filters, update, reset: () => update(EMPTY_CASH_FILTERS) };
}

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
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-bold whitespace-nowrap",
        active ? "border-line-gold bg-gold-soft text-gold" : "border-line bg-surface text-ink-2",
      )}
    >
      {children}
    </button>
  );
}

/** «5/6» и шкала мест: полный стол — жёлтым и с очередью, пустой — приглушённо. */
function Seats({ table }: { table: CashTable }) {
  const { seated, table_size: size, waiting } = table;
  if (seated === null) return <span className="text-ink-3">—</span>;
  const full = size !== null && seated >= size;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className={cn(
          "num font-bold tabular-nums",
          full ? "text-warn" : seated === 0 ? "text-ink-3" : "text-ink",
        )}
      >
        {size ? `${seated}/${size}` : seated}
        {waiting ? <span className="text-warn ml-0.5 text-[10px]">+{waiting}</span> : null}
      </span>
      {size ? (
        <span className="mt-0.5 flex gap-[2px]" aria-hidden="true">
          {Array.from({ length: size }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-[3px] w-[4px] rounded-[1px]",
                index < seated ? (full ? "bg-warn" : "bg-gold") : "bg-surface-3",
              )}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}

function selectOnEnter(event: KeyboardEvent, select: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select();
  }
}

function CashTableView({
  groups,
  onSelect,
}: {
  groups: [string, CashTable[]][];
  onSelect: (table: CashTable) => void;
}) {
  const headCell = "bg-bg py-1.5 border-line border-b";
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[12px]">
      <colgroup>
        <col />
        <col className="w-[84px]" />
        <col className="w-[56px]" />
        <col className="w-[62px]" />
      </colgroup>
      <thead>
        <tr className="text-ink-3 text-[9.5px] font-bold uppercase">
          <th className={cn(headCell, "pl-3 text-left")}>Стол</th>
          <th className={cn(headCell, "text-right")}>Блайнды</th>
          <th className={cn(headCell, "text-right")}>Игроки</th>
          <th className={cn(headCell, "pr-3 text-right")}>Вход</th>
        </tr>
      </thead>
      {groups.map(([game, items]) => (
        <tbody key={game}>
          <tr>
            <th
              colSpan={4}
              scope="colgroup"
              className="bg-surface-2 text-ink-2 border-line border-b px-3 py-1 text-left text-[10.5px] font-bold"
            >
              {GAME_LABELS[game as CashTable["game_type"]]} · {items.length}
            </th>
          </tr>
          {items.map((table) => {
            const cell = "border-line border-b py-1.5";
            const select = () => onSelect(table);
            return (
              <tr
                key={table.id}
                data-testid="cash-row"
                tabIndex={0}
                aria-label={`Подробнее: ${table.name}, ${table.club.name}`}
                className="hover:bg-surface cursor-pointer"
                onClick={select}
                onKeyDown={(event) => selectOnEnter(event, select)}
              >
                <td className={cn(cell, "min-w-0 pr-2 pl-3")}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <AppIcon app={table.club.app} className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="text-ink block truncate font-semibold">{table.name}</span>
                      <span className="text-ink-3 block truncate text-[10.5px]">
                        {table.club.name}
                      </span>
                    </span>
                  </div>
                </td>
                <td
                  className={cn(
                    cell,
                    "num text-ink overflow-hidden text-right font-bold whitespace-nowrap",
                  )}
                >
                  {formatBlinds(table)}
                </td>
                <td className={cn(cell, "text-right")}>
                  <Seats table={table} />
                </td>
                <td
                  className={cn(
                    cell,
                    "num text-ink-2 overflow-hidden pr-3 pl-1 text-right font-semibold whitespace-nowrap",
                  )}
                >
                  {formatMoney(table.min_buyin, table.club) ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

/**
 * Кэш-столы по образцу лобби GG: где сейчас идёт игра и за какими ставками. Данные — вечерний
 * сборщик раз в 15–20 минут; столы старше 45 минут сервер не отдаёт.
 */
export function CashPage() {
  const { filters, update, reset } = useCashFilters();
  const now = useNow(30_000);
  const query = useQuery({
    queryKey: ["cash-tables"],
    queryFn: ({ signal }) => fetchCashTables(signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<CashTable | null>(null);

  const visible = useMemo(() => applyCashFilters(query.data ?? [], filters), [query.data, filters]);
  const groups = useMemo(() => groupByGame(visible), [visible]);
  const updated = latestSeen(query.data ?? []);
  const hasFilters = filters.games.length > 0 || filters.stakes.length > 0;

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="cash-page">
      <header className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
          <ScheduleTabs active="cash" />
          <span
            aria-live="polite"
            className="text-ink-3 num min-w-0 flex-1 truncate text-right text-[11.5px] font-semibold"
          >
            {query.isSuccess
              ? `${visible.length} ${pluralRu(visible.length, "стол", "стола", "столов")}${
                  updated ? ` · ${minutesAgo(updated, now)}` : ""
                }`
              : ""}
          </span>
        </div>
        <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pb-2 [&::-webkit-scrollbar]:hidden">
          {hasFilters ? (
            <button
              type="button"
              aria-label="Сбросить фильтры"
              onClick={reset}
              className="text-gold border-line-gold h-7 shrink-0 rounded-full border px-2.5 text-[11.5px] font-bold"
            >
              ✕
            </button>
          ) : null}
          {CASH_GAMES.map((game) => (
            <Chip
              key={game}
              active={filters.games.includes(game)}
              onClick={() => update({ games: toggle(filters.games, game) })}
            >
              {GAME_LABELS[game]}
            </Chip>
          ))}
          <span className="bg-line mx-0.5 w-px shrink-0" aria-hidden="true" />
          {STAKE_TIERS.map((tier) => (
            <Chip
              key={tier.value}
              active={filters.stakes.includes(tier.value)}
              onClick={() => update({ stakes: toggle(filters.stakes, tier.value) })}
            >
              {tier.label}
            </Chip>
          ))}
        </div>
      </header>

      {query.isPending ? (
        <div className="space-y-1.5 px-3 pt-3" data-testid="cash-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-surface h-[40px] rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="border-line bg-surface mx-3 mt-3 rounded-md border px-4 py-6 text-center">
          <p className="text-ink text-[14px] font-semibold">Не удалось загрузить столы</p>
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
          <p className="text-ink text-[15px] font-bold">
            {hasFilters ? "Столов не найдено" : "Сейчас столов нет"}
          </p>
          <p className="text-ink-2 mt-1 text-[13px]">
            {hasFilters
              ? "Попробуйте ослабить фильтры"
              : "Столы собираются вечером, с 18:00 до 02:00 МСК"}
          </p>
        </div>
      ) : (
        <CashTableView groups={groups} onSelect={setSelected} />
      )}

      <CashTableSheet
        table={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />

      <p className="text-ink-3 px-4 pt-4 text-center text-[11px]">
        Столы обновляются раз в 15–20 минут · суммы в деньгах клуба
      </p>
    </div>
  );
}
