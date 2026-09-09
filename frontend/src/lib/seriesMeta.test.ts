import { describe, expect, it } from "vitest";

import { formatSeriesMeta, formatSeriesVenuePlace, joinMetaParts } from "@/lib/seriesMeta";

describe("formatSeriesVenuePlace", () => {
  it("dedups when venue name equals city", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Калининград",
        venueCity: "Калининград",
        countryCode: "RU",
      }),
    ).toEqual(["🇷🇺 Калининград"]);
  });

  it("dedups when city is a substring of venue name (Casino Sochi)", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Casino Sochi",
        venueCity: "Сочи",
        countryCode: "RU",
      }),
    ).toEqual(["Casino Sochi 🇷🇺"]);
  });

  it("keeps name and city for Sobranie Casino / Калининград", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Sobranie Casino",
        venueCity: "Калининград",
        countryCode: "RU",
      }),
    ).toEqual(["Sobranie Casino", "🇷🇺 Калининград"]);
  });

  it("keeps name and city for Casino Royal / Минск", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Casino Royal",
        venueCity: "Минск",
        countryCode: "BY",
      }),
    ).toEqual(["Casino Royal", "🇧🇾 Минск"]);
  });

  it("keeps name and city for Merit Royal / Кирения", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Merit Royal",
        venueCity: "Кирения",
        countryCode: "CY",
      }),
    ).toEqual(["Merit Royal", "🇨🇾 Кирения"]);
  });

  it("keeps name and city for Altai Palace / Алтайский край", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Altai Palace",
        venueCity: "Алтайский край",
        countryCode: "RU",
      }),
    ).toEqual(["Altai Palace", "🇷🇺 Алтайский край"]);
  });

  it("keeps Красная Поляна and Сочи (city not in name)", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "Красная Поляна",
        venueCity: "Сочи",
        countryCode: "RU",
      }),
    ).toEqual(["Красная Поляна", "🇷🇺 Сочи"]);
  });

  it("ignores case and extra spaces when comparing", () => {
    expect(
      formatSeriesVenuePlace({
        venueName: "  калининград  ",
        venueCity: "Калининград",
        countryCode: "RU",
      }),
    ).toEqual(["🇷🇺 Калининград"]);
  });
});

describe("formatSeriesMeta", () => {
  it("builds full line without city duplicate", () => {
    expect(
      formatSeriesMeta({
        dateLabel: "17–30 августа",
        venueName: "Калининград",
        venueCity: "Калининград",
        countryCode: "RU",
      }),
    ).toBe("17–30 августа · 🇷🇺 Калининград");
  });

  it("includes year in date label when provided by caller", () => {
    expect(
      formatSeriesMeta({
        dateLabel: "17–30 августа 2026",
        venueName: "Sobranie Casino",
        venueCity: "Калининград",
        countryCode: "RU",
      }),
    ).toBe("17–30 августа 2026 · Sobranie Casino · 🇷🇺 Калининград");
  });

  it("omits dangling separators for empty venue fields", () => {
    expect(
      formatSeriesMeta({
        dateLabel: "1–11 августа",
        venueName: "",
        venueCity: "",
        countryCode: "RU",
      }),
    ).toBe("1–11 августа");
  });
});

describe("joinMetaParts", () => {
  it("skips empty parts", () => {
    expect(joinMetaParts(["a", "", "  ", null, "b"])).toBe("a · b");
  });
});
