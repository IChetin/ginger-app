import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { CalendarParams } from "@/api/types/schedule";
import {
  applyRangeTap,
  formatPeriodBarLabel,
  monthTitle,
  readCalendarFilterParams,
  readMonthFromSearchParams,
  readRangeFromSearchParams,
  shiftMonthKey,
  sortCalendarSeries,
} from "@/components/calendar/calendarDisplay";
import { MonthGrid, MonthGridSkeleton } from "@/components/calendar/MonthGrid";
import { MonthSeriesList, MonthSeriesListSkeleton } from "@/components/calendar/MonthSeriesList";
import { useMonthSwipe } from "@/components/calendar/useMonthSwipe";
import { HeaderProfileButton } from "@/components/layout/HeaderProfileButton";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { isSeriesOver } from "@/components/series/seriesDisplay";
import { calendarQueryOptions } from "@/features/schedule/api/queries";
import { getUserTimezone, todayInTimezone } from "@/lib/time";
import { cn } from "@/lib/utils";

const monthNavBtnClass =
  "bg-surface-2 text-ink-2 inline-flex h-[38px] min-h-11 w-[38px] min-w-11 items-center justify-center rounded-md";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="h-[15px] w-[15px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function CalendarErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="border-line bg-surface mx-4 mt-5 rounded-lg border px-4 py-8 text-center"
      data-testid="calendar-error"
    >
      <p className="text-ink text-[15px] font-semibold">{message}</p>
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

export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listRef = useRef<HTMLElement>(null);
  const [periodTip, setPeriodTip] = useState<string | null>(null);
  const monthParts = useMemo(() => readMonthFromSearchParams(searchParams), [searchParams]);
  const range = useMemo(() => readRangeFromSearchParams(searchParams), [searchParams]);
  const filters = useMemo(() => readCalendarFilterParams(searchParams), [searchParams]);
  const userTimezone = getUserTimezone();
  const todayIso = useMemo(() => todayInTimezone(userTimezone), [userTimezone]);

  const periodComplete = Boolean(range.from && range.to);
  const pickingEnd = Boolean(range.from && !range.to);

  const queryParams = useMemo((): CalendarParams => {
    const params: CalendarParams = {
      month: monthParts.monthKey,
      ...filters,
    };
    if (periodComplete && range.from && range.to) {
      params.from = range.from;
      params.to = range.to;
    }
    return params;
  }, [filters, monthParts.monthKey, periodComplete, range.from, range.to]);

  const calendarQuery = useQuery(calendarQueryOptions(queryParams));

  const visibleSeries = useMemo(() => {
    if (!calendarQuery.data) {
      return [];
    }
    return sortCalendarSeries(calendarQuery.data.series);
  }, [calendarQuery.data]);

  const showBookmarkDots = useMemo(() => {
    return (
      calendarQuery.data?.series.some((item) => item.is_bookmarked && !isSeriesOver(item)) ?? false
    );
  }, [calendarQuery.data?.series]);

  const writeParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    next.delete("day");
    setSearchParams(next);
  };

  const setMonth = (monthKey: string) => {
    writeParams((next) => {
      next.set("month", monthKey);
    });
  };

  const goPrevMonth = () => setMonth(shiftMonthKey(monthParts.monthKey, -1).monthKey);
  const goNextMonth = () => setMonth(shiftMonthKey(monthParts.monthKey, 1).monthKey);
  const swipeHandlers = useMonthSwipe({
    onPrevMonth: goPrevMonth,
    onNextMonth: goNextMonth,
  });

  const clearPeriod = () => {
    setPeriodTip(null);
    writeParams((next) => {
      next.delete("from");
      next.delete("to");
    });
  };

  const onSelectDay = (dayIso: string) => {
    const result = applyRangeTap(range, dayIso);
    if (result.kind === "too_long") {
      setPeriodTip("Период не больше 6 месяцев — выберите более близкую дату");
      return;
    }
    setPeriodTip(null);
    writeParams((next) => {
      next.set("month", monthParts.monthKey);
      if (result.from) {
        next.set("from", result.from);
      } else {
        next.delete("from");
      }
      if (result.to) {
        next.set("to", result.to);
      } else {
        next.delete("to");
      }
    });
    if (result.to || result.from) {
      requestAnimationFrame(() => {
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const listMode = periodComplete ? "period" : pickingEnd ? "picking" : "month";
  const showPeriodBar = Boolean(range.from);
  const tipText = periodTip ?? (pickingEnd ? "Отметьте вторую дату. Месяцы можно листать" : null);

  const monthNav = (
    <>
      <button
        type="button"
        aria-label="Прошлый месяц"
        data-testid="calendar-prev-month"
        onClick={goPrevMonth}
        className={monthNavBtnClass}
      >
        <ChevronIcon direction="left" />
      </button>
      <button
        type="button"
        aria-label="Следующий месяц"
        data-testid="calendar-next-month"
        onClick={goNextMonth}
        className={monthNavBtnClass}
      >
        <ChevronIcon direction="right" />
      </button>
    </>
  );

  const periodFooter =
    showPeriodBar || tipText ? (
      <div>
        {showPeriodBar && range.from ? (
          <div className="flex items-center gap-[9px] px-4 pb-3" data-testid="calendar-period-bar">
            <button
              type="button"
              className={cn(
                "border-line-gold bg-gold-soft text-gold flex h-[42px] flex-1 items-center gap-[9px] rounded-md border px-[13px]",
                "text-left text-[14px] font-semibold",
              )}
              data-testid="calendar-period-label"
            >
              <CalendarIcon />
              <span>
                <b className="num font-bold">{formatPeriodBarLabel(range.from, range.to)}</b>
              </span>
            </button>
            {periodComplete ? (
              <button
                type="button"
                aria-label="Сбросить период"
                data-testid="calendar-clear-period"
                onClick={clearPeriod}
                className="border-line-strong text-ink-3 inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border bg-transparent"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
        ) : null}
        {tipText ? (
          <div
            className="border-line-gold bg-gold-soft text-gold mx-4 mb-3 flex items-center gap-2 rounded-md border px-3 py-[9px] text-[12.5px]"
            data-testid="calendar-period-tip"
          >
            <InfoIcon />
            {tipText}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div data-testid="calendar-page" className="touch-pan-y" {...swipeHandlers}>
      <StickyHeader
        title={monthTitle(monthParts.year, monthParts.month)}
        backFallback="/"
        compactible={false}
        actions={
          <>
            {monthNav}
            <HeaderProfileButton compact />
          </>
        }
        footer={periodFooter}
      />

      {calendarQuery.isLoading ? (
        <>
          <MonthGridSkeleton />
          <MonthSeriesListSkeleton />
        </>
      ) : null}

      {calendarQuery.isError ? (
        <CalendarErrorState
          message={
            calendarQuery.error instanceof ApiError
              ? calendarQuery.error.message
              : "Не удалось загрузить календарь"
          }
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : null}

      {calendarQuery.data ? (
        <>
          <MonthGrid
            year={monthParts.year}
            month={monthParts.month}
            series={calendarQuery.data.series}
            range={range}
            todayIso={todayIso}
            showBookmarkDots={showBookmarkDots}
            onSelectDay={onSelectDay}
          />
          <MonthSeriesList
            series={visibleSeries}
            viewYear={monthParts.year}
            viewMonth={monthParts.month}
            mode={listMode}
            todayIso={todayIso}
            onClearPeriod={clearPeriod}
            listRef={listRef}
          />
        </>
      ) : null}
    </div>
  );
}
