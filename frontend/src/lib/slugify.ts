/** Client-side slug helpers (parity with backend/app/utils/slugify.py). */

const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERIES_EVENT_SLUG_MAX_LEN = 80;

function translateCyrillic(text: string): string {
  return [...text].map((ch) => CYRILLIC[ch] ?? ch).join("");
}

export function slugify(
  value: string,
  opts?: { fallback?: string; maxLen?: number },
): string {
  const fallback = opts?.fallback ?? "item";
  const maxLen = opts?.maxLen ?? 64;
  let text = value.normalize("NFKC").trim().toLowerCase();
  text = translateCyrillic(text);
  text = text.normalize("NFKD");
  text = [...text].filter((ch) => !/\p{M}/u.test(ch)).join("");
  text = text.replace(/[^a-z0-9]+/g, "-");
  text = text.replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  if (!text) {
    text = fallback;
  }
  const trimmed = text.slice(0, maxLen).replace(/-$/, "");
  return trimmed || fallback;
}

export function isValidSlug(value: string, maxLen = 120): boolean {
  return SLUG_RE.test(value) && value.length >= 1 && value.length <= maxLen;
}

export function buildSeriesSlugBase(params: {
  organizerSlug: string;
  city: string;
  startsOn: string;
}): string {
  const org = slugify(params.organizerSlug, { fallback: "org", maxLen: SERIES_EVENT_SLUG_MAX_LEN });
  const cityPart = slugify(params.city, { fallback: "city", maxLen: SERIES_EVENT_SLUG_MAX_LEN });
  const [year, month] = params.startsOn.split("-");
  const period = `${year}-${month}`;
  const raw = `${org}-${cityPart}-${period}`;
  return slugify(raw, { fallback: "series", maxLen: SERIES_EVENT_SLUG_MAX_LEN });
}

export function buildEventSlugBase(params: { number: number | null; name: string }): string {
  const namePart = slugify(params.name, { fallback: "event", maxLen: SERIES_EVENT_SLUG_MAX_LEN });
  if (params.number == null) {
    return namePart;
  }
  const raw = `${params.number}-${namePart}`;
  return slugify(raw, { fallback: "event", maxLen: SERIES_EVENT_SLUG_MAX_LEN });
}
