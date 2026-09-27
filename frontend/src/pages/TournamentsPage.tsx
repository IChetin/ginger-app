import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ScheduleView, Tournament } from "@/api/types/tournaments";
import { ScheduleTabs } from "@/components/layout/ScheduleTabs";
import { useMe } from "@/features/auth/hooks";
import { rateLimitMessage, useGuestGate } from "@/features/auth/useGuestGate";
import { EditorsPickChip } from "@/features/picks/EditorsPick";
import { TournamentCard } from "@/features/tournaments/components/TournamentCard";
import { LiveEvents } from "@/features/tournaments/components/LiveEvents";
import {
  DayHeader,
  TableView,
  selectOnEnter,
  selectUnlessButton,
  useScheduleNow,
  type ViewProps,
} from "@/features/tournaments/components/ScheduleTable";
import { TournamentSheet } from "@/features/tournaments/components/TournamentSheet";
import {
  applyTournamentFilters,
  useTournamentFilters,
  useTournaments,
  type ListMode,
  type RangeKey,
} from "@/features/tournaments/hooks";
import { displayName, groupByDay, tournamentPhase } from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

// Коротко на кнопке: рядом с «Турниры | Кэш» полные «24 часа / Неделя» съедают счётчик турниров.
const RANGE_OPTIONS: { value: RangeKey; label: string; title: string }[] = [
  { value: "day", label: "24ч", title: "24 часа" },
  { value: "3days", label: "3д", title: "3 дня" },
  { value: "week", label: "7д", title: "Неделя" },
];

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
        "font-display inline-flex h-8 shrink-0 items-center gap-1 border px-3 text-[10.5px] font-semibold tracking-[0.1em] whitespace-nowrap uppercase",
        active
          ? "border-line-gold bg-gold-soft text-gold"
          : "text-ink-2 border-[var(--frame-inner)]",
      )}
    >
      {children}
    </button>
  );
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

/** Высота липкой шапки страницы — под ней прилипает шапка таблицы. */
function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

export function TournamentsPage() {
  const { data: user } = useMe();
  const { filters, update } = useTournamentFilters();
  const gate = useGuestGate();
  // Гостю сервер отдаёт только ближайшие сутки — и переключатель показывает сутки.
  const range: RangeKey = gate.isGuest ? "day" : filters.range;
  const query = useTournaments({ range }, gate.ready);
  const now = useScheduleNow(query.data);
  const view: ScheduleView = user?.schedule_view ?? "table";
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();

  // Сохранённый с прошлого входа Editor's Pick гостю не применяем: флагов сервер ему не отдаёт.
  const mode: ListMode = filters.mode === "picked" && gate.isGuest ? "all" : filters.mode;
  const visible = useMemo(
    () =>
      applyTournamentFilters(query.data ?? [], { mode }).filter(
        (item) => tournamentPhase(item, now).kind !== "closed",
      ),
    [query.data, mode, now],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const hasFilters = mode !== "all";
  const choose = (next: ListMode) => update({ mode: mode === next ? "all" : next });
  const [selected, setSelected] = useState<Tournament | null>(null);

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="tournaments-page">
      {/* Телефон первым: заголовок, счётчик и период — одна строка, фильтр цены — вторая. */}
      <header
        ref={headerRef}
        className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]"
      >
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
          <ScheduleTabs active="tournaments" />
          <span
            aria-live="polite"
            className="text-ink-3 num min-w-0 flex-1 truncate text-[11.5px] font-semibold"
          >
            {query.isSuccess
              ? `${visible.length} ${pluralRu(visible.length, "турнир", "турнира", "турниров")}`
              : ""}
          </span>
          <div role="tablist" aria-label="Период" className="deco-frame-sm flex shrink-0 p-[5px]">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-label={option.title}
                title={option.title}
                aria-selected={range === option.value}
                onClick={() =>
                  gate.isGuest && option.value !== "day"
                    ? void gate.requireLogin("Расписание на 3 и 7 дней")
                    : update({ range: option.value })
                }
                className={cn(
                  "h-6 px-2.5 text-[11.5px] font-bold",
                  range === option.value ? "text-ink-ongold bg-[var(--gold-fill)]" : "text-ink-2",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pb-2 [&::-webkit-scrollbar]:hidden">
          {/* Один выбор из четырёх (Иван, 27.09): Все · Editor's Pick · Free · Major. */}
          <Chip active={mode === "all"} onClick={() => update({ mode: "all" })}>
            Все
          </Chip>
          <EditorsPickChip
            kind="mtt"
            active={mode === "picked"}
            locked={gate.isGuest}
            onToggle={() =>
              gate.isGuest ? void gate.requireLogin("Editor's Pick") : choose("picked")
            }
          />
          <Chip active={mode === "free"} onClick={() => choose("free")}>
            Free
          </Chip>
          <Chip active={mode === "major"} onClick={() => choose("major")}>
            Major
          </Chip>
        </div>
      </header>

      <LiveEvents onSelect={setSelected} />

      {query.isPending ? (
        <div className="space-y-1.5 px-3 pt-3" data-testid="tournaments-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-surface h-[52px] rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="border-line bg-surface mx-3 mt-3 rounded-md border px-4 py-6 text-center">
          <p className="text-ink text-[14px] font-semibold">
            {rateLimitMessage(query.error) ?? "Не удалось загрузить турниры"}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="bg-gold-soft text-gold mt-3 h-10 rounded-none px-5 text-[13px] font-bold"
          >
            Повторить
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="border-line-gold bg-surface mx-3 mt-3 rounded-md border border-dashed px-4 py-6 text-center">
          <p className="text-ink text-[15px] font-bold">
            {mode === "picked" ? "Подборка этой недели ещё не готова" : "Турниров не найдено"}
          </p>
          <p className="text-ink-2 mt-1 text-[13px]">
            {hasFilters ? "Попробуйте ослабить фильтры" : "Расписание ещё не загружено"}
          </p>
        </div>
      ) : view === "table" ? (
        <TableView groups={groups} now={now} onSelect={setSelected} stickyTop={headerHeight} />
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
