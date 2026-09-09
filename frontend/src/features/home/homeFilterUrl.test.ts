import { describe, expect, it } from "vitest";

import {
  emptyHomeFilters,
  homeFiltersFromSearchParams,
  homeFiltersToSearchParams,
  homeFiltersToSeriesParams,
  homePeriodToDateRange,
  homeStatusToApiFilter,
  homeFilterValues,
  applyHomeFilterValues,
  homePeriodOptionsForStatus,
} from "@/features/home/homeFilterUrl";

describe("home filter URL helpers", () => {
  it("round-trips multi filters through search params", () => {
    const filters = {
      status: "running" as const,
      countries: ["RU", "BY"],
      buyin: ["10-50k"],
      organizers: ["org-1"],
      venues: [],
      period: "month" as const,
      date_from: "",
      date_to: "",
    };
    const params = homeFiltersToSearchParams(filters);
    expect(params.toString()).toBe(
      "status=running&countries=RU%2CBY&buyin=10-50k&organizers=org-1&period=month",
    );
    expect(homeFiltersFromSearchParams(params)).toEqual(filters);
  });

  it("maps legacy live_soon URL to running segment", () => {
    const params = new URLSearchParams("status=live_soon");
    expect(homeFiltersFromSearchParams(params).status).toBe("running");
  });

  it("maps legacy announced URL to all segment", () => {
    expect(homeFiltersFromSearchParams(new URLSearchParams("status=announced")).status).toBe("all");
  });

  it("maps archive segment and finished alias", () => {
    expect(homeFiltersFromSearchParams(new URLSearchParams("status=archive")).status).toBe(
      "archive",
    );
    expect(homeFiltersFromSearchParams(new URLSearchParams("status=finished")).status).toBe(
      "archive",
    );
    expect(
      homeFiltersToSearchParams({ ...emptyHomeFilters(), status: "archive" }).get("status"),
    ).toBe("archive");
  });

  it("maps segments to series API status", () => {
    expect(homeStatusToApiFilter("all")).toBe("actual");
    expect(homeStatusToApiFilter("running")).toBe("running");
    expect(homeStatusToApiFilter("archive")).toBe("finished");
  });

  it("keeps custom date range only for custom period", () => {
    const filters = {
      ...emptyHomeFilters(),
      period: "custom" as const,
      date_from: "2026-07-01",
      date_to: "2026-07-31",
    };
    const params = homeFiltersToSearchParams(filters);
    expect(params.get("date_from")).toBe("2026-07-01");
    expect(params.get("date_to")).toBe("2026-07-31");
    expect(homeFiltersFromSearchParams(params)).toEqual(filters);
  });

  it("maps to series API params", () => {
    const params = homeFiltersToSeriesParams({
      status: "all",
      countries: ["RU"],
      buyin: ["lt10k", "gte50k"],
      organizers: ["org-1", "org-2"],
      venues: ["venue-1"],
      period: "",
      date_from: "",
      date_to: "",
    });
    expect(params).toMatchObject({
      status: "actual",
      countries: "RU",
      buyin: "lt10k,gte50k",
      organizers: "org-1,org-2",
      venues: "venue-1",
      limit: 100,
    });
  });

  it("uses smaller page size for archive", () => {
    const params = homeFiltersToSeriesParams({
      ...emptyHomeFilters(),
      status: "archive",
    });
    expect(params).toMatchObject({ status: "finished", limit: 20, offset: 0 });
  });

  it("passes subject filters together with archive status", () => {
    const params = homeFiltersToSeriesParams({
      ...emptyHomeFilters(),
      status: "archive",
      countries: ["BY"],
      organizers: ["org-1"],
      buyin: ["10-50k"],
    });
    expect(params).toMatchObject({
      status: "finished",
      countries: "BY",
      organizers: "org-1",
      buyin: "10-50k",
    });
    expect(params.starts_from).toBeUndefined();
    expect(params.starts_to).toBeUndefined();
  });

  it("maps archive period presets to past date ranges", () => {
    const now = new Date(2026, 6, 30);
    expect(homePeriodToDateRange("month", "", "", { mode: "past", now })).toEqual({
      starts_from: "2026-06-30",
      starts_to: "2026-07-30",
    });
    expect(homePeriodToDateRange("3m", "", "", { mode: "past", now })).toEqual({
      starts_from: "2026-04-30",
      starts_to: "2026-07-30",
    });
    expect(homePeriodToDateRange("year", "", "", { mode: "past", now })).toEqual({
      starts_from: "2025-07-30",
      starts_to: "2026-07-30",
    });
    expect(homePeriodToDateRange("all", "", "", { mode: "past", now })).toEqual({});
    expect(homePeriodToDateRange("", "", "", { mode: "past", now })).toEqual({});
  });

  it("maps future period presets forward", () => {
    const now = new Date(2026, 6, 30);
    expect(homePeriodToDateRange("month", "", "", { mode: "future", now })).toEqual({
      starts_from: "2026-07-30",
      starts_to: "2026-08-29",
    });
  });

  it("applies past date range when building archive series params", () => {
    const params = homeFiltersToSeriesParams({
      ...emptyHomeFilters(),
      status: "archive",
      period: "month",
    });
    expect(params.status).toBe("finished");
    expect(params.starts_from).toBeDefined();
    expect(params.starts_to).toBeDefined();
    expect(params.starts_from! < params.starts_to!).toBe(true);
  });

  it("exposes archive period options and keeps весь архив as empty period", () => {
    const labels = homePeriodOptionsForStatus("archive").map((item) => item.label);
    expect(labels).toEqual([
      "За последний месяц",
      "За 3 месяца",
      "За год",
      "Весь архив",
      "Свой период",
    ]);
    expect(homePeriodOptionsForStatus("all")[0]?.label).toBe("Ближайший месяц");

    const withAll = applyHomeFilterValues(emptyHomeFilters("archive"), {
      ...homeFilterValues(emptyHomeFilters("archive")),
      period: ["all"],
    });
    expect(withAll.period).toBe("");
    expect(homeFiltersToSearchParams(withAll).get("period")).toBeNull();
    expect(homeFilterValues(withAll).period).toEqual(["all"]);
  });

  it("emptyHomeFilters keeps current segment", () => {
    expect(emptyHomeFilters("archive").status).toBe("archive");
    expect(emptyHomeFilters("archive").countries).toEqual([]);
  });
});
