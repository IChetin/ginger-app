import type { PaginatedResponse } from "@/api/types/schedule";
import type { CurrencyBrief } from "@/api/types/schedule";
import type {
  ResultListItem,
  ResultsListParams,
  StatsChartPoint,
  StatsChartResponse,
  StatsFilterCountsResponse,
  StatsFilterParams,
  StatsFiltersResponse,
  StatsSummary,
} from "@/api/types/tracker";
import { BUYIN_PRESETS, type BuyinPreset } from "@/features/filters/buyinPresets";

import fixture from "@/demo/tracker.json";

const UNLINKED_SERIES_VALUE = "none";
const RESULT_ITM = "itm";
const RESULT_NO_ITM = "no_itm";

const BUYIN_BOUNDS: Record<BuyinPreset, { lo: number | null; hi: number | null }> = {
  lt10k: { lo: null, hi: 10_000 },
  "10-50k": { lo: 10_000, hi: 50_000 },
  gte50k: { lo: 50_000, hi: null },
};

export interface DemoResultRow {
  id: string;
  name: string;
  series_id: string | null;
  series_text: string | null;
  venue_id: string | null;
  venue_text: string | null;
  played_on: string;
  buyin: string;
  currency_code: string;
  entries_count: number;
  payout: string;
  place: number | null;
  field_size: number | null;
}

interface ConvertedRow {
  row: DemoResultRow;
  invested: number;
  won: number;
}

function quantize(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return quantize(value).toFixed(2);
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function rateToRub(code: string): number {
  const upper = code.toUpperCase();
  if (upper === "RUB") return 1;
  const raw = (fixture.fx_rates as Record<string, string>)[upper];
  if (raw == null) {
    throw new Error(`demo_fx_rate_missing:${upper}`);
  }
  return Number(raw);
}

export function convertAmount(amount: string, source: string, base: string): number {
  const value = Number(amount);
  if (source.toUpperCase() === base.toUpperCase()) {
    return quantize(value);
  }
  return quantize((value * rateToRub(source)) / rateToRub(base));
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Сдвигает фикстуры так, чтобы последний результат приходился на сегодня. */
export function shiftedDemoResults(now: Date = new Date()): DemoResultRow[] {
  const rows = fixture.results as DemoResultRow[];
  if (rows.length === 0) return [];
  const newest = rows.reduce((max, row) => (row.played_on > max ? row.played_on : max), rows[0].played_on);
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const deltaMs = today.getTime() - parseIsoDate(newest).getTime();
  const deltaDays = Math.round(deltaMs / 86_400_000);
  if (deltaDays === 0) return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    const shifted = new Date(parseIsoDate(row.played_on).getTime() + deltaDays * 86_400_000);
    return { ...row, played_on: toIsoDate(shifted) };
  });
}

function matchesRelational(row: DemoResultRow, filters: StatsFilterParams): boolean {
  const seriesParts = parseCsv(filters.series);
  const includeUnlinked = seriesParts.includes(UNLINKED_SERIES_VALUE);
  const seriesIds = seriesParts.filter((id) => id !== UNLINKED_SERIES_VALUE);
  const hasSeriesFilter = seriesIds.length > 0 || includeUnlinked;
  const venueIds = parseCsv(filters.venues);
  if (filters.venue_id) venueIds.push(filters.venue_id);
  const hasVenueFilter = venueIds.length > 0;
  const hasCountryFilter = Boolean(filters.country_code);
  const isUnlinked = row.series_id == null;

  if (hasSeriesFilter) {
    if (isUnlinked) {
      if (!includeUnlinked) return false;
    } else if (seriesIds.length === 0 || !seriesIds.includes(row.series_id ?? "")) {
      return false;
    }
  }

  if (isUnlinked) {
    return !hasVenueFilter && !hasCountryFilter;
  }

  if (hasVenueFilter && (row.venue_id == null || !venueIds.includes(row.venue_id))) {
    return false;
  }
  if (hasCountryFilter) {
    const venue = fixture.venues.find((item) => item.id === row.venue_id);
    if (!venue || venue.country_code !== filters.country_code) return false;
  }
  return true;
}

function matchesBuyinPreset(buyinBase: number, presets: string[]): boolean {
  if (presets.length === 0) return true;
  return presets.some((preset) => {
    const bounds = BUYIN_BOUNDS[preset as BuyinPreset];
    if (!bounds) return false;
    if (bounds.lo != null && buyinBase < bounds.lo) return false;
    if (bounds.hi != null && buyinBase >= bounds.hi) return false;
    return true;
  });
}

export function selectDemoConverted(
  filters: StatsFilterParams = {},
  baseCurrency: string,
  now: Date = new Date(),
): ConvertedRow[] {
  const rows = shiftedDemoResults(now).filter((row) => {
    if (filters.date_from && row.played_on < filters.date_from) return false;
    if (filters.date_to && row.played_on > filters.date_to) return false;
    return matchesRelational(row, filters);
  });

  const presets = parseCsv(filters.buyin);
  const kinds = new Set(parseCsv(filters.result));
  const selected: ConvertedRow[] = [];

  for (const row of rows) {
    const buyinBase = convertAmount(row.buyin, row.currency_code, baseCurrency);
    if (presets.length) {
      if (!matchesBuyinPreset(buyinBase, presets)) continue;
    } else {
      if (filters.buyin_min != null && buyinBase < Number(filters.buyin_min)) continue;
      if (filters.buyin_max != null && buyinBase > Number(filters.buyin_max)) continue;
    }
    const invested = quantize(buyinBase * row.entries_count);
    const won = convertAmount(row.payout, row.currency_code, baseCurrency);
    if (kinds.size > 0) {
      const isItm = won > 0;
      if (kinds.has(RESULT_ITM) && isItm) {
        // keep
      } else if (kinds.has(RESULT_NO_ITM) && !isItm) {
        // keep
      } else {
        continue;
      }
    }
    selected.push({ row, invested, won });
  }

  selected.sort((a, b) => {
    if (a.row.played_on !== b.row.played_on) return a.row.played_on.localeCompare(b.row.played_on);
    return a.row.id.localeCompare(b.row.id);
  });
  return selected;
}

function toListItem(item: ConvertedRow, baseCurrency: string): ResultListItem {
  const { row, invested, won } = item;
  const nowIso = `${row.played_on}T12:00:00Z`;
  return {
    id: row.id,
    entry_type: "live_mtt",
    event_id: null,
    name: row.name,
    venue_text: row.venue_text,
    series_text: row.series_text,
    played_on: row.played_on,
    buyin: row.buyin,
    currency_code: row.currency_code,
    entries_count: row.entries_count,
    payout: row.payout,
    place: row.place,
    field_size: row.field_size,
    note: null,
    events: [],
    created_at: nowIso,
    updated_at: nowIso,
    profit_base: money(won - invested),
    base_currency: baseCurrency,
  };
}

export function computeDemoStats(
  filters: StatsFilterParams = {},
  baseCurrency = "RUB",
  now: Date = new Date(),
): StatsSummary {
  const selected = selectDemoConverted(filters, baseCurrency, now);
  const tournaments = selected.length;
  const entries = selected.reduce((sum, item) => sum + item.row.entries_count, 0);
  const invested = quantize(selected.reduce((sum, item) => sum + item.invested, 0));
  const won = quantize(selected.reduce((sum, item) => sum + item.won, 0));
  const profit = quantize(won - invested);
  const itmCount = selected.filter((item) => item.won > 0).length;
  const roi = invested > 0 ? quantize((profit / invested) * 100) : null;
  const abi = entries > 0 ? quantize(invested / entries) : null;
  const itm = tournaments > 0 ? quantize((itmCount / tournaments) * 100) : 0;
  return {
    base_currency: baseCurrency,
    tournaments,
    entries,
    invested: money(invested),
    won: money(won),
    profit: money(profit),
    roi: roi == null ? null : money(roi),
    abi: abi == null ? null : money(abi),
    itm: money(itm),
  };
}

export function computeDemoChart(
  filters: StatsFilterParams = {},
  baseCurrency = "RUB",
  now: Date = new Date(),
): StatsChartResponse {
  const selected = selectDemoConverted(filters, baseCurrency, now);
  const points: StatsChartPoint[] = [];
  let cumulative = 0;
  selected.forEach((item, index) => {
    const profit = quantize(item.won - item.invested);
    cumulative = quantize(cumulative + profit);
    points.push({
      index: index + 1,
      result_id: item.row.id,
      played_on: item.row.played_on,
      label: item.row.name,
      profit: money(profit),
      cumulative_profit: money(cumulative),
    });
  });
  return { base_currency: baseCurrency, points };
}

export function listDemoFilters(now: Date = new Date()): StatsFiltersResponse {
  const rows = shiftedDemoResults(now);
  const seriesIds = new Set<string>();
  const venueIds = new Set<string>();
  const countryCodes = new Set<string>();
  let unlinkedCount = 0;
  for (const row of rows) {
    if (row.series_id == null) {
      unlinkedCount += 1;
      continue;
    }
    seriesIds.add(row.series_id);
    if (row.venue_id) venueIds.add(row.venue_id);
    const venue = fixture.venues.find((item) => item.id === row.venue_id);
    if (venue) countryCodes.add(venue.country_code);
  }
  return {
    series: fixture.series
      .filter((item) => seriesIds.has(item.id))
      .map((item) => ({ id: item.id, name: item.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    venues: fixture.venues
      .filter((item) => venueIds.has(item.id))
      .map((item) => ({ id: item.id, name: item.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    countries: fixture.countries
      .filter((item) => countryCodes.has(item.code))
      .map((item) => ({ code: item.code, name_ru: item.name_ru }))
      .sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru")),
    unlinked_count: unlinkedCount,
  };
}

function withFilters(base: StatsFilterParams, patch: StatsFilterParams): StatsFilterParams {
  return { ...base, ...patch };
}

export function computeDemoFilterCounts(
  filters: StatsFilterParams = {},
  baseCurrency = "RUB",
  now: Date = new Date(),
): StatsFilterCountsResponse {
  const selected = selectDemoConverted(filters, baseCurrency, now);
  const options = listDemoFilters(now);
  const countWith = (patch: StatsFilterParams) =>
    selectDemoConverted(withFilters(filters, patch), baseCurrency, now).length;

  const series = options.series.map((item) => ({
    value: item.id,
    count: countWith({ series: item.id }),
  }));
  if (options.unlinked_count > 0) {
    series.push({
      value: UNLINKED_SERIES_VALUE,
      count: countWith({ series: UNLINKED_SERIES_VALUE }),
    });
  }

  return {
    total: selected.length,
    series,
    venues: options.venues.map((item) => ({
      value: item.id,
      count: countWith({ venues: item.id, venue_id: undefined }),
    })),
    buyin: BUYIN_PRESETS.map((preset) => ({
      value: preset.value,
      count: countWith({ buyin: preset.value, buyin_min: undefined, buyin_max: undefined }),
    })),
    result: [
      { value: RESULT_ITM, count: countWith({ result: RESULT_ITM }) },
      { value: RESULT_NO_ITM, count: countWith({ result: RESULT_NO_ITM }) },
    ],
  };
}

export function listDemoResults(
  params: ResultsListParams = {},
  baseCurrency = "RUB",
  now: Date = new Date(),
): PaginatedResponse<ResultListItem> {
  const selected = selectDemoConverted(params, baseCurrency, now).slice().reverse();
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  const page = selected.slice(offset, offset + limit);
  return {
    items: page.map((item) => toListItem(item, baseCurrency)),
    total: selected.length,
    limit,
    offset,
  };
}

export function listDemoCurrencies(): CurrencyBrief[] {
  return fixture.currencies.map((item) => ({ code: item.code, symbol: item.symbol }));
}

export function getDemoResult(resultId: string, baseCurrency = "RUB", now: Date = new Date()) {
  const selected = selectDemoConverted({}, baseCurrency, now);
  const found = selected.find((item) => item.row.id === resultId);
  if (!found) return null;
  return toListItem(found, baseCurrency);
}
