import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  useSeriesArchiveList,
  useSeriesFilterCounts,
  useSeriesFilterOptions,
  useSeriesList,
} from "@/api/series";
import type { SeriesListItem, SeriesTabCounts } from "@/api/types/schedule";
import {
  FilterChips,
  FilterSheet,
  FilterTrigger,
  SegmentedControl,
  useIsDesktop,
  type FilterGroupConfig,
  type FilterValues,
} from "@/components/filters";
import { TopBar } from "@/components/layout/TopBar";
import { SeriesCard } from "@/components/series/SeriesCard";
import { effectiveSeriesPhase } from "@/components/series/seriesDisplay";
import { LiveActiveBanner } from "@/features/live/components/LiveActiveBanner";
import { useActiveLiveSession } from "@/features/live/hooks";
import { BUYIN_HINT, BUYIN_PRESETS } from "@/features/filters/buyinPresets";
import { useDebouncedValue } from "@/features/filters/useFilterPreviewCount";
import {
  applyHomeFilterValues,
  emptyHomeFilters,
  homeActiveCount,
  homeAppliedChips,
  homeFilterValues,
  homeFiltersFromSearchParams,
  homeFiltersToSearchParams,
  homePeriodOptionsForStatus,
  HOME_SEGMENTS,
  type HomeFiltersState,
  type HomeStatusSegment,
} from "@/features/home/homeFilterUrl";
import { cn } from "@/lib/utils";

const COUNTRY_EMOJI: Record<string, string> = {
  RU: "🇷🇺",
  BY: "🇧🇾",
  CY: "🇨🇾",
};

function countryLabel(code: string, nameRu: string): string {
  const emoji = COUNTRY_EMOJI[code];
  return emoji ? `${emoji} ${nameRu}` : nameRu;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="px-4 pt-5 pb-1">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[19px] font-extrabold tracking-tight">{title}</h2>
        {action ? (
          <Link
            to={action.to}
            className="text-gold px-1 py-1 text-[13px] font-bold hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-5" data-testid="feed-skeleton">
      <div className="space-y-3">
        <div className="bg-surface-2 h-5 w-32 rounded-sm" />
        <div className="bg-surface h-[92px] rounded-lg" />
        <div className="bg-surface h-[92px] rounded-lg" />
      </div>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="border-line bg-surface mx-4 mt-5 rounded-lg border px-4 py-8 text-center"
      data-testid="error-state"
    >
      <p className="text-ink text-[15px] font-semibold">Не удалось загрузить расписание</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "mt-4 inline-flex h-11 min-h-11 items-center justify-center rounded-full px-5",
          "bg-gold-soft text-gold text-[13px] font-bold",
        )}
      >
        Повторить
      </button>
    </div>
  );
}

function EmptyCard({
  onReset,
  message,
  hint,
}: {
  onReset: () => void;
  message: string;
  hint: string;
}) {
  return (
    <div
      className="border-line-gold bg-surface mx-4 mt-5 rounded-lg border border-dashed px-4 py-10 text-center"
      data-testid="empty-state"
    >
      <p className="text-ink text-base font-bold">{message}</p>
      <p className="text-ink-2 mt-2 text-sm">{hint}</p>
      <button
        type="button"
        onClick={onReset}
        className={cn(
          "mt-4 inline-flex h-11 min-h-11 items-center justify-center rounded-full px-5",
          "bg-gold-grad text-ink-ongold text-[13px] font-bold",
        )}
      >
        Сбросить фильтры
      </button>
    </div>
  );
}

function ArchiveFeed({
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  items: SeriesListItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || !sentinel.current || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) onLoadMore();
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <section className="flex flex-col gap-2 px-4 pt-2 pb-4" data-testid="archive-feed">
      {items.map((series) => (
        <SeriesCard key={series.id} series={series} />
      ))}
      <div ref={sentinel} className="h-1" />
      {isFetchingNextPage ? (
        <p className="text-ink-3 py-3 text-center text-[12px]">Загрузка…</p>
      ) : null}
      {hasNextPage && typeof IntersectionObserver === "undefined" ? (
        <button
          type="button"
          className="text-gold mx-auto mt-2 block text-[13px] font-bold"
          onClick={onLoadMore}
        >
          Показать ещё
        </button>
      ) : null}
    </section>
  );
}

function groupSeries(items: SeriesListItem[]) {
  const visible = items.filter((item) => {
    const phase = effectiveSeriesPhase(item);
    return phase === "running" || phase === "soon" || phase === "announced";
  });
  return {
    running: visible.filter((item) => effectiveSeriesPhase(item) === "running"),
    soon: visible.filter((item) => effectiveSeriesPhase(item) === "soon"),
    announced: visible.filter((item) => effectiveSeriesPhase(item) === "announced"),
  };
}

function HomeFiltersSlot({
  filters,
  onCommit,
  tabCounts,
}: {
  filters: HomeFiltersState;
  onCommit: (next: HomeFiltersState) => void;
  tabCounts?: SeriesTabCounts;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HomeFiltersState>(filters);
  const filtersQuery = useSeriesFilterOptions();
  // Desktop: commit сразу в URL — считаем по filters. Mobile: preview по draft.
  const previewSource = isDesktop ? filters : draft;
  const previewForCounts = useDebouncedValue(previewSource, 300);
  const countsQuery = useSeriesFilterCounts(open ? previewForCounts : filters, true);

  const countryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const country of filtersQuery.data?.countries ?? []) {
      map[country.code] = countryLabel(country.code, country.name_ru);
    }
    return map;
  }, [filtersQuery.data?.countries]);

  const organizerLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const org of filtersQuery.data?.organizers ?? []) {
      map[org.id] = org.name;
    }
    return map;
  }, [filtersQuery.data?.organizers]);

  const countMap = useMemo(() => {
    const countries = Object.fromEntries(
      (countsQuery.data?.countries ?? []).map((item) => [item.value, item.count]),
    );
    const organizers = Object.fromEntries(
      (countsQuery.data?.organizers ?? []).map((item) => [item.value, item.count]),
    );
    const buyin = Object.fromEntries(
      (countsQuery.data?.buyin ?? []).map((item) => [item.value, item.count]),
    );
    return { countries, organizers, buyin };
  }, [countsQuery.data]);

  const editor = open ? (isDesktop ? filters : draft) : filters;

  const patchEditor = (patch: Partial<HomeFiltersState>) => {
    if (isDesktop) {
      onCommit({ ...filters, ...patch });
    } else {
      setDraft((prev) => ({ ...prev, ...patch }));
    }
  };

  const groups: FilterGroupConfig[] = useMemo(() => {
    const periodFooter =
      editor.period === "custom" ? (
        <div className="mt-2 flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-ink-3 text-[11px]">От</span>
            <input
              type="date"
              value={editor.date_from}
              onChange={(event) => patchEditor({ date_from: event.target.value, period: "custom" })}
              className="border-line-strong bg-surface-2 text-ink h-10 rounded-sm border px-3 text-[13px]"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-ink-3 text-[11px]">До</span>
            <input
              type="date"
              value={editor.date_to}
              onChange={(event) => patchEditor({ date_to: event.target.value, period: "custom" })}
              className="border-line-strong bg-surface-2 text-ink h-10 rounded-sm border px-3 text-[13px]"
            />
          </label>
        </div>
      ) : null;

    const periodOptions = homePeriodOptionsForStatus(editor.status);

    return [
      {
        id: "countries",
        title: "Страна",
        options: (filtersQuery.data?.countries ?? []).map((country) => ({
          value: country.code,
          label: countryLabel(country.code, country.name_ru),
          count: countMap.countries[country.code],
        })),
      },
      {
        id: "buyin",
        title: "Бай-ин",
        options: BUYIN_PRESETS.map((preset) => ({
          value: preset.value,
          label: preset.label,
          count: countMap.buyin[preset.value],
        })),
        hint: BUYIN_HINT,
      },
      {
        id: "organizers",
        title: "Организатор",
        options: (filtersQuery.data?.organizers ?? []).map((org) => ({
          value: org.id,
          label: org.name,
          count: countMap.organizers[org.id],
        })),
      },
      {
        id: "period",
        title: "Период",
        mode: "single",
        options: periodOptions.map((item) => ({
          value: item.value,
          label: item.label,
        })),
        footer: periodFooter,
      },
    ];
  }, [countMap, editor.date_from, editor.date_to, editor.period, editor.status, filtersQuery.data]);

  const sheetValues = homeFilterValues(editor);
  const chips = homeAppliedChips(filters, {
    countries: countryLabels,
    organizers: organizerLabels,
  });

  const openSheet = () => {
    if (!isDesktop) setDraft(filters);
    setOpen(true);
  };

  const onSheetChange = (values: FilterValues) => {
    if (isDesktop) {
      onCommit(applyHomeFilterValues(filters, values));
    } else {
      setDraft((prev) => applyHomeFilterValues(prev, values));
    }
  };

  const applyDraft = () => {
    onCommit(draft);
    setOpen(false);
  };

  const resetFilters = () => {
    const empty = emptyHomeFilters(filters.status);
    setDraft(empty);
    onCommit(empty);
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-2.5" data-testid="home-feed-toolbar">
        <SegmentedControl
          className="mx-0 mb-0 min-w-0 flex-1"
          options={HOME_SEGMENTS.map((segment) => ({
            ...segment,
            count: tabCounts?.[segment.value as keyof SeriesTabCounts],
          }))}
          value={filters.status}
          onChange={(value) => onCommit({ ...filters, status: value as HomeStatusSegment })}
        />
        <FilterTrigger compact activeCount={homeActiveCount(filters)} onOpen={openSheet} />
      </div>
      <FilterChips
        chips={chips}
        onRemoveChip={(chip) => {
          const values = homeFilterValues(filters);
          const nextValues = {
            ...values,
            [chip.groupId]: (values[chip.groupId] ?? []).filter((item) => item !== chip.value),
          };
          onCommit(applyHomeFilterValues(filters, nextValues));
        }}
        onClear={resetFilters}
      />
      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        title="Фильтры"
        groups={groups}
        values={sheetValues}
        onChange={onSheetChange}
        resultCount={countsQuery.data?.total ?? null}
        resultWords={["серию", "серии", "серий"]}
        onApply={applyDraft}
        onReset={() => {
          if (isDesktop) onCommit(emptyHomeFilters(filters.status));
          else setDraft(emptyHomeFilters(filters.status));
        }}
      />
    </>
  );
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => homeFiltersFromSearchParams(searchParams), [searchParams]);
  const isArchive = filters.status === "archive";

  useEffect(() => {
    if (searchParams.get("status") !== "announced") return;
    const next = new URLSearchParams(searchParams);
    next.delete("status");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const liveQuery = useActiveLiveSession();
  const liveSession = liveQuery.data && liveQuery.data.status === "active" ? liveQuery.data : null;

  const feedQuery = useSeriesList(filters);
  const archiveQuery = useSeriesArchiveList(filters);

  const archiveItems = useMemo(
    () => archiveQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [archiveQuery.data?.pages],
  );

  const groups = useMemo(() => groupSeries(feedQuery.data?.items ?? []), [feedQuery.data?.items]);
  const feedItems = feedQuery.data?.items ?? [];

  const items = isArchive ? archiveItems : feedItems;
  const tabCounts = isArchive ? archiveQuery.data?.pages[0]?.counts : feedQuery.data?.counts;

  const isLoading = isArchive ? archiveQuery.isLoading : feedQuery.isLoading;
  const isError = isArchive ? archiveQuery.isError : feedQuery.isError;
  const isEmpty = isArchive
    ? archiveQuery.isSuccess && archiveItems.length === 0
    : feedQuery.isSuccess && feedItems.length === 0;

  const commitFilters = (next: HomeFiltersState) => {
    setSearchParams(homeFiltersToSearchParams(next), { replace: false });
  };

  const showGrouped = filters.status === "all";
  const refetch = () => {
    if (isArchive) void archiveQuery.refetch();
    else void feedQuery.refetch();
  };

  const hasSubjectFilters = homeActiveCount(filters) > 0;
  const emptyMessage =
    isArchive && hasSubjectFilters
      ? "В архиве нет серий по выбранным фильтрам"
      : "Ничего не найдено";
  const emptyHint = hasSubjectFilters
    ? "Сбросьте фильтры или смените сегмент"
    : "Попробуйте сбросить фильтры";

  return (
    <div data-testid="home-page">
      <TopBar
        filters={
          <HomeFiltersSlot filters={filters} onCommit={commitFilters} tabCounts={tabCounts} />
        }
      />
      {liveSession ? <LiveActiveBanner session={liveSession} /> : null}

      {isLoading ? <FeedSkeleton /> : null}

      {isError ? <ErrorCard onRetry={refetch} /> : null}

      {isEmpty ? (
        <EmptyCard
          message={emptyMessage}
          hint={emptyHint}
          onReset={() => commitFilters(emptyHomeFilters(filters.status))}
        />
      ) : null}

      {!isLoading && !isError && !isEmpty ? (
        <>
          {isArchive ? (
            <ArchiveFeed
              items={archiveItems}
              hasNextPage={Boolean(archiveQuery.hasNextPage)}
              isFetchingNextPage={archiveQuery.isFetchingNextPage}
              onLoadMore={() => void archiveQuery.fetchNextPage()}
            />
          ) : showGrouped ? (
            <>
              {groups.running.length > 0 ? (
                <Section title="Идут сейчас">
                  {groups.running.map((series) => (
                    <SeriesCard key={series.id} series={series} />
                  ))}
                </Section>
              ) : null}

              {groups.soon.length > 0 ? (
                <Section title="Скоро" action={{ to: "/calendar", label: "Календарь" }}>
                  {groups.soon.map((series) => (
                    <SeriesCard key={series.id} series={series} />
                  ))}
                </Section>
              ) : null}

              {groups.announced.length > 0 ? (
                <Section title="Анонсы">
                  {groups.announced.map((series) => (
                    <SeriesCard key={series.id} series={series} />
                  ))}
                </Section>
              ) : null}
            </>
          ) : (
            <section className="flex flex-col gap-2 px-4 pt-2 pb-4">
              {items.map((series) => (
                <SeriesCard key={series.id} series={series} />
              ))}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
