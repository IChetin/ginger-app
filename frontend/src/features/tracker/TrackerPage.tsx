import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { BaseCurrencyCode } from "@/api/types/auth";
import {
  FilterBar,
  FilterSheet,
  SegmentedControl,
  useIsDesktop,
  type FilterGroupConfig,
  type FilterValues,
} from "@/components/filters";
import { HeaderProfileButton } from "@/components/layout/HeaderProfileButton";
import { CurrencySheet } from "@/components/profile/ProfileEditSheets";
import { ProfitChart } from "@/components/tracker/ProfitChart";
import { ResultsList } from "@/components/tracker/ResultsList";
import { StatsGrid } from "@/components/tracker/StatsGrid";
import { DemoBanner } from "@/demo/DemoBanner";
import { useDemo } from "@/demo/DemoContext";
import { AuthGate } from "@/features/auth/AuthGate";
import { useMe } from "@/features/auth/hooks";
import { BUYIN_PRESETS } from "@/features/filters/buyinPresets";
import { useDebouncedValue } from "@/features/filters/useFilterPreviewCount";
import {
  useInfiniteResults,
  useResultCurrencies,
  useStats,
  useStatsChart,
  useStatsFilterCounts,
  useStatsFilters,
} from "@/features/tracker/hooks";
import {
  applyTrackerFilterValues,
  emptyTrackerFilters,
  trackerActiveCount,
  trackerAppliedChips,
  trackerFiltersFromSearchParams,
  trackerFiltersToApiParams,
  trackerFiltersToSearchParams,
  trackerFilterValues,
  TRACKER_RESULT_OPTIONS,
  TRACKER_SEGMENTS,
  type TrackerFiltersState,
} from "@/features/tracker/lib/trackerFilterUrl";
import type { TrackerPeriod } from "@/features/tracker/lib/trackerFilters";
import { shareOrDownloadCard } from "@/features/tracker/lib/shareCard";
import { currencySymbol } from "@/lib/money";

const PAGE_SIZE = 20;

function TrackerFiltersSlot({
  filters,
  onCommit,
}: {
  filters: TrackerFiltersState;
  onCommit: (next: TrackerFiltersState) => void;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const optionsQuery = useStatsFilters({ enabled: true });
  const previewSource = isDesktop ? filters : draft;
  const previewForCounts = useDebouncedValue(previewSource, 300);
  const countsQuery = useStatsFilterCounts(trackerFiltersToApiParams(open ? previewForCounts : filters), {
    enabled: true,
  });

  const seriesLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of optionsQuery.data?.series ?? []) {
      map[item.id] = item.name;
    }
    return map;
  }, [optionsQuery.data?.series]);

  const venueLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of optionsQuery.data?.venues ?? []) {
      map[item.id] = item.name;
    }
    return map;
  }, [optionsQuery.data?.venues]);

  const countMap = useMemo(() => {
    return {
      series: Object.fromEntries(
        (countsQuery.data?.series ?? []).map((item) => [item.value, item.count]),
      ),
      venues: Object.fromEntries(
        (countsQuery.data?.venues ?? []).map((item) => [item.value, item.count]),
      ),
      buyin: Object.fromEntries(
        (countsQuery.data?.buyin ?? []).map((item) => [item.value, item.count]),
      ),
      result: Object.fromEntries(
        (countsQuery.data?.result ?? []).map((item) => [item.value, item.count]),
      ),
    };
  }, [countsQuery.data]);

  const groups: FilterGroupConfig[] = useMemo(() => {
    const seriesOptions = (optionsQuery.data?.series ?? []).map((item) => ({
      value: item.id,
      label: item.name,
      count: countMap.series[item.id],
    }));
    if ((optionsQuery.data?.unlinked_count ?? 0) > 0) {
      seriesOptions.push({
        value: "none",
        label: "Без серии",
        count: countMap.series.none,
      });
    }
    return [
      { id: "series", title: "Серия", options: seriesOptions },
      {
        id: "buyin",
        title: "Бай-ин",
        options: BUYIN_PRESETS.map((preset) => ({
          value: preset.value,
          label: preset.label,
          count: countMap.buyin[preset.value],
        })),
      },
      {
        id: "venues",
        title: "Площадка",
        options: (optionsQuery.data?.venues ?? []).map((item) => ({
          value: item.id,
          label: item.name,
          count: countMap.venues[item.id],
        })),
      },
      {
        id: "result",
        title: "Результат",
        options: TRACKER_RESULT_OPTIONS.map((item) => ({
          value: item.value,
          label: item.label,
          count: countMap.result[item.value],
        })),
      },
    ];
  }, [countMap, optionsQuery.data]);

  const chips = trackerAppliedChips(filters, {
    series: seriesLabels,
    venues: venueLabels,
  });

  const editor = isDesktop ? filters : draft;

  return (
    <>
      <SegmentedControl
        options={TRACKER_SEGMENTS}
        value={filters.period}
        onChange={(value) => onCommit({ ...filters, period: value as TrackerPeriod })}
      />
      <FilterBar
        activeCount={trackerActiveCount(filters)}
        chips={chips}
        onOpen={() => {
          if (!isDesktop) setDraft(filters);
          setOpen(true);
        }}
        onRemoveChip={(chip) => {
          const values = trackerFilterValues(filters);
          onCommit(
            applyTrackerFilterValues(filters, {
              ...values,
              [chip.groupId]: (values[chip.groupId] ?? []).filter((item) => item !== chip.value),
            }),
          );
        }}
        onClear={() => onCommit(emptyTrackerFilters(filters.period))}
      />
      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        title="Фильтры результатов"
        groups={groups}
        values={trackerFilterValues(editor)}
        onChange={(values: FilterValues) => {
          if (isDesktop) {
            onCommit(applyTrackerFilterValues(filters, values));
          } else {
            setDraft(applyTrackerFilterValues(draft, values));
          }
        }}
        resultCount={countsQuery.data?.total ?? null}
        resultWords={["результат", "результата", "результатов"]}
        onApply={() => {
          onCommit(draft);
          setOpen(false);
        }}
        onReset={() => {
          if (isDesktop) onCommit(emptyTrackerFilters(filters.period));
          else setDraft(emptyTrackerFilters(filters.period));
        }}
      />
    </>
  );
}

export function TrackerPage() {
  const { data: user, isPending: authPending } = useMe();
  const { isDemo, baseCurrency, setBaseCurrency, requestLogin } = useDemo();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const stateEventId =
    (location.state as { event_id?: string } | null)?.event_id ??
    searchParams.get("event_id") ??
    null;
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currenciesQuery = useResultCurrencies({ enabled: isDemo });

  useEffect(() => {
    if (!stateEventId) return;
    if (isDemo) {
      requestLogin();
      return;
    }
    if (!user) return;
    void navigate(`/tracker/results/new?event_id=${encodeURIComponent(stateEventId)}`, {
      replace: true,
    });
  }, [isDemo, navigate, requestLogin, stateEventId, user]);

  const stateResultId = (location.state as { result_id?: string } | null)?.result_id ?? null;
  useEffect(() => {
    if (!stateResultId) return;
    if (isDemo) {
      requestLogin();
      return;
    }
    if (!user) return;
    void navigate(`/tracker/results/${stateResultId}/edit`, { replace: true });
  }, [isDemo, navigate, requestLogin, stateResultId, user]);

  const filters = useMemo(
    () => trackerFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const apiFilters = useMemo(() => trackerFiltersToApiParams(filters), [filters]);

  const statsQuery = useStats(apiFilters);
  const chartQuery = useStatsChart(apiFilters);
  const resultsQuery = useInfiniteResults(apiFilters, PAGE_SIZE);
  const results = resultsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const fxMissing =
    (statsQuery.error instanceof ApiError && statsQuery.error.code === "fx_rate_missing") ||
    (chartQuery.error instanceof ApiError && chartQuery.error.code === "fx_rate_missing") ||
    (resultsQuery.error instanceof ApiError && resultsQuery.error.code === "fx_rate_missing");

  const commitFilters = (next: TrackerFiltersState) => {
    setSearchParams(trackerFiltersToSearchParams(next), { replace: false });
  };

  if (authPending) {
    return (
      <div className="relative min-h-screen" data-testid="tracker-guest-loading">
        <div className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
          <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
            <h1 className="text-ink text-[23px] font-extrabold tracking-[-0.02em]">Трекер</h1>
            <HeaderProfileButton compact />
          </div>
        </div>
        <p className="text-ink-2 px-4 py-10 text-center text-[13px]">Загрузка…</p>
      </div>
    );
  }

  const displayCurrency = chartQuery.data?.base_currency ?? user?.base_currency ?? baseCurrency;
  const periodLabel =
    filters.period === "year"
      ? `${new Date().getFullYear()} год`
      : filters.period === "month"
        ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date())
        : "Всё время";

  const resultTotal =
    resultsQuery.data?.pages[0]?.total ?? statsQuery.data?.tournaments ?? results.length;
  const hasResults = (statsQuery.data?.tournaments ?? 0) > 0;

  const blockWrite = () => {
    requestLogin();
  };

  return (
    <div
      className="relative min-h-screen pb-8"
      data-testid="tracker-page"
      data-demo={isDemo ? "true" : undefined}
    >
      <div className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
          <h1 className="text-ink text-[23px] font-extrabold tracking-[-0.02em]">Трекер</h1>
          <div className="flex items-center gap-2">
          {isDemo ? (
            <button
              type="button"
              aria-label="Базовая валюта"
              className="bg-surface-2 text-ink inline-flex h-[38px] min-w-[38px] items-center justify-center rounded-md px-2 text-[15px] font-extrabold"
              onClick={() => setCurrencyOpen(true)}
              data-testid="tracker-currency"
            >
              {currencySymbol(baseCurrency)}
            </button>
          ) : null}
          {hasResults ? (
            <button
              type="button"
              aria-label="Поделиться статистикой"
              disabled={!isDemo && (shareBusy || !statsQuery.data || !chartQuery.data)}
              className="bg-surface-2 text-ink-2 inline-flex h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-md px-2 disabled:opacity-40"
              onClick={() => {
                if (isDemo) {
                  blockWrite();
                  return;
                }
                if (shareBusy || !statsQuery.data || !chartQuery.data) return;
                setShareBusy(true);
                setShareStatus("Готовим…");
                void shareOrDownloadCard(apiFilters)
                  .then((outcome) => {
                    setShareStatus(
                      outcome === "shared"
                        ? "Карточка отправлена"
                        : outcome === "downloaded"
                          ? "PNG скачан"
                          : outcome === "cancelled"
                            ? null
                            : "Не удалось создать карточку",
                    );
                  })
                  .finally(() => {
                    setShareBusy(false);
                  });
              }}
            >
              {shareBusy ? (
                <span
                  className="border-ink-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <svg
                  className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
                  <path d="M5 13v6h14v-6" />
                </svg>
              )}
            </button>
          ) : null}
          <HeaderProfileButton compact />
          </div>
        </div>
        <TrackerFiltersSlot filters={filters} onCommit={commitFilters} />
      </div>

      {isDemo ? <DemoBanner /> : null}

      {shareStatus ? (
        <div className="border-line-gold bg-gold-soft text-gold mx-4 mt-3 rounded-md border px-3 py-2 text-[12px]">
          {shareStatus}
        </div>
      ) : null}
      {fxMissing ? (
        <div className="border-warn/40 bg-warn-soft text-warn mx-4 mt-3 rounded-md border px-3 py-2 text-[12px]">
          Не хватает курса на дату турнира. Статистика появится после загрузки курсов.
        </div>
      ) : null}

      <p className="text-ink-3 num px-4 pt-3 text-[12px] tabular-nums">
        {resultTotal} турниров по фильтру
      </p>

      {statsQuery.data ? (
        <StatsGrid summary={statsQuery.data} />
      ) : statsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 px-4 pt-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-surface h-[72px] animate-pulse rounded-md" />
          ))}
        </div>
      ) : null}

      <ProfitChart
        points={chartQuery.data?.points ?? []}
        currency={displayCurrency}
        periodLabel={periodLabel}
      />

      {resultsQuery.isLoading ? (
        <p className="text-ink-2 px-4 py-8 text-center text-[13px]">Загрузка результатов…</p>
      ) : resultsQuery.isError && !fxMissing ? (
        <p className="text-danger px-4 py-8 text-center text-[13px]">
          Не удалось загрузить результаты
        </p>
      ) : results.length === 0 ? (
        <div
          className="border-line-gold bg-surface mx-4 mt-4 rounded-lg border border-dashed px-4 py-10 text-center"
          data-testid="tracker-empty-filters"
        >
          <p className="text-ink text-base font-bold">Ничего не найдено</p>
          <p className="text-ink-2 mt-2 text-sm">Попробуйте сбросить фильтры</p>
          <button
            type="button"
            className="bg-gold-grad text-ink-ongold mt-4 inline-flex h-11 items-center rounded-full px-5 text-[13px] font-bold"
            onClick={() => commitFilters(emptyTrackerFilters(filters.period))}
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <ResultsList
          items={results}
          hasNextPage={Boolean(resultsQuery.hasNextPage)}
          isFetchingNextPage={resultsQuery.isFetchingNextPage}
          onLoadMore={() => void resultsQuery.fetchNextPage()}
          onEdit={(item) => {
            if (isDemo) {
              blockWrite();
              return;
            }
            void navigate(`/tracker/results/${item.id}/edit`);
          }}
        />
      )}

      {isDemo ? (
        <AuthGate
          icon={
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path d="M4 19h16M6 16l4-5 3 3 5-7" />
            </svg>
          }
          title="Ваша статистика турниров"
          description="ROI, ABI, ITM и график накопительного профита — приватно и в вашей базовой валюте."
          returnTo={returnTo}
        />
      ) : null}

      <button
        type="button"
        aria-label="Добавить результат"
        className="bg-gold-grad text-ink-ongold shadow-sheen-glow-lg fixed right-[max(16px,calc(50%-194px))] bottom-24 z-31 flex h-14 w-14 items-center justify-center rounded-lg"
        onClick={() => {
          if (isDemo) {
            blockWrite();
            return;
          }
          void navigate("/tracker/results/new");
        }}
      >
        <svg
          className="h-6 w-6 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {isDemo ? (
        <CurrencySheet
          open={currencyOpen}
          onOpenChange={setCurrencyOpen}
          currencies={currenciesQuery.data ?? []}
          selected={baseCurrency}
          isPending={false}
          error={null}
          onSave={async (next: BaseCurrencyCode) => {
            setBaseCurrency(next);
          }}
        />
      ) : null}
    </div>
  );
}
