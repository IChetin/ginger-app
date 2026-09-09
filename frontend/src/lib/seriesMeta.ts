/** Country code → flag emoji for series meta lines. */
const COUNTRY_FLAG: Record<string, string> = {
  RU: "🇷🇺",
  BY: "🇧🇾",
  CY: "🇨🇾",
};

/** Latin spellings so «Casino Sochi» + «Сочи» still dedups across scripts. */
const CITY_LATIN_ALIASES: Record<string, readonly string[]> = {
  сочи: ["sochi"],
  калининград: ["kaliningrad"],
  минск: ["minsk"],
  кирения: ["kyrenia", "girne"],
  никосия: ["nicosia"],
};

function normalizePlace(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cityAppearsInName(nameKey: string, cityKey: string): boolean {
  if (!cityKey) {
    return false;
  }
  if (nameKey === cityKey || nameKey.includes(cityKey)) {
    return true;
  }
  return (CITY_LATIN_ALIASES[cityKey] ?? []).some((alias) => nameKey.includes(alias));
}

export function countryFlag(code: string): string {
  return COUNTRY_FLAG[code] ?? "";
}

/**
 * Venue segment(s) for series meta: name · flag city, with dedup when
 * name equals city or city is already a substring of the venue name.
 */
export function formatSeriesVenuePlace(params: {
  venueName: string;
  venueCity: string;
  countryCode: string;
}): string[] {
  const name = params.venueName.trim().replace(/\s+/g, " ");
  const city = params.venueCity.trim().replace(/\s+/g, " ");
  const flag = countryFlag(params.countryCode);
  const nameKey = normalizePlace(name);
  const cityKey = normalizePlace(city);

  if (!name && !city) {
    return [];
  }

  if (!name) {
    const place = flag ? `${flag} ${city}`.trim() : city;
    return place ? [place] : [];
  }

  if (!city) {
    return flag ? [`${name} ${flag}`.trim()] : [name];
  }

  if (nameKey === cityKey) {
    const place = flag ? `${flag} ${city}`.trim() : city;
    return [place];
  }

  if (cityAppearsInName(nameKey, cityKey)) {
    return flag ? [`${name} ${flag}`.trim()] : [name];
  }

  const place = flag ? `${flag} ${city}`.trim() : city;
  return [name, place];
}

/** Join meta parts with « · », skipping empties (no dangling separators). */
export function joinMetaParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" · ");
}

/**
 * Full series meta line: dates · venue · flag city.
 * Pass dateLabel already formatted (optionally with year).
 */
export function formatSeriesMeta(params: {
  dateLabel: string;
  venueName: string;
  venueCity: string;
  countryCode: string;
}): string {
  return joinMetaParts([
    params.dateLabel,
    ...formatSeriesVenuePlace({
      venueName: params.venueName,
      venueCity: params.venueCity,
      countryCode: params.countryCode,
    }),
  ]);
}
