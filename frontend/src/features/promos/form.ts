import type { PromoAdmin, PromoPayload } from "@/features/promos/promosApi";

/** Черновик акции в форме: даты — по Москве, призы и окна x2 — простыми строками. */
export interface PromoForm {
  clubId: string;
  kind: PromoPayload["kind"];
  title: string;
  prizeFund: string;
  prizeExtra: string;
  currencyCode: string;
  startsAt: string;
  endsAt: string;
  recurrence: PromoPayload["recurrence"];
  game: PromoPayload["game"];
  buyinMin: string;
  buyinMax: string;
  prizes: string;
  windows: string;
  uncertain: string[];
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** ISO → «2026-09-28T10:00» по Москве для поля `datetime-local`. */
export function toMskInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + MSK_OFFSET_MS).toISOString().slice(0, 16);
}

/** «2026-09-28T10:00» по Москве → ISO. */
export function fromMskInput(value: string): string | null {
  return value ? new Date(`${value}:00+03:00`).toISOString() : null;
}

function plainNumber(value: string | null): string {
  if (value === null) return "";
  return String(Number(value));
}

function groupDigits(value: string): string {
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

export function prizesToText(prizes: PromoAdmin["prizes"]): string {
  return prizes
    .map(
      (prize) =>
        `${prize.place} — ${prize.amount !== null ? groupDigits(prize.amount) : (prize.label ?? "")}`,
    )
    .join("\n");
}

/** «1 — 250 000», «10 — Black VIP Card»: деньги — числом, остальное — подписью. */
export function textToPrizes(text: string): PromoPayload["prizes"] {
  const prizes: PromoPayload["prizes"] = [];
  for (const raw of text.split("\n")) {
    const match = raw.trim().match(/^(\d{1,3})\s*(?:место)?\s*[—\-–:.)]?\s*(.+)$/i);
    if (!match) continue;
    const place = Number(match[1]);
    const value = (match[2] ?? "").trim();
    const digits = value.replace(/[\s ₽$€]|руб\.?/gi, "");
    if (/^\d+([.,]\d+)?$/.test(digits)) {
      prizes.push({ place, amount: digits.replace(",", "."), label: null });
    } else if (value) {
      prizes.push({ place, amount: null, label: value.slice(0, 60) });
    }
  }
  return prizes;
}

export function windowsToText(windows: PromoAdmin["boost_windows"]): string {
  return windows.map((item) => `${item.start}–${item.end}`).join(", ");
}

/** «10:00–12:00, 20:00-21:00» → окна x2. */
export function textToWindows(text: string): PromoPayload["boost_windows"] {
  const windows: PromoPayload["boost_windows"] = [];
  for (const match of text.matchAll(/(\d{1,2}:\d{2})\s*[—\-–]\s*(\d{1,2}:\d{2})/g)) {
    const [start, end] = [match[1] ?? "", match[2] ?? ""].map((value) => value.padStart(5, "0"));
    windows.push({ start: start ?? "", end: end ?? "", multiplier: 2 });
  }
  return windows;
}

export function toForm(promo: PromoAdmin): PromoForm {
  return {
    clubId: promo.club?.id ?? "",
    kind: promo.kind,
    title: promo.title,
    prizeFund: plainNumber(promo.prize_fund),
    prizeExtra: promo.prize_extra ?? "",
    currencyCode: promo.currency_code ?? "",
    startsAt: toMskInput(promo.starts_at),
    endsAt: toMskInput(promo.ends_at),
    recurrence: promo.recurrence,
    game: promo.game,
    buyinMin: plainNumber(promo.buyin_min),
    buyinMax: plainNumber(promo.buyin_max),
    prizes: prizesToText(promo.prizes),
    windows: windowsToText(promo.boost_windows),
    uncertain: promo.uncertain,
  };
}

function money(value: string): string | null {
  const cleaned = value.replace(/[\s ]/g, "").replace(",", ".");
  return cleaned ? cleaned : null;
}

export function toPayload(form: PromoForm, publish: boolean): PromoPayload {
  return {
    club_id: form.clubId || null,
    kind: form.kind,
    title: form.title.trim(),
    prize_fund: money(form.prizeFund),
    prize_extra: form.prizeExtra.trim() || null,
    currency_code: form.currencyCode || null,
    starts_at: fromMskInput(form.startsAt),
    ends_at: fromMskInput(form.endsAt),
    recurrence: form.recurrence,
    game: form.game,
    buyin_min: money(form.buyinMin),
    buyin_max: money(form.buyinMax),
    prizes: textToPrizes(form.prizes),
    boost_windows: textToWindows(form.windows),
    uncertain: form.uncertain,
    is_published: publish,
  };
}

/** Какие поля формы отвечают за «сомнения» разборщика. */
export const UNCERTAIN_FIELD: Record<string, keyof PromoForm> = {
  club_id: "clubId",
  title: "title",
  prize_fund: "prizeFund",
  currency_code: "currencyCode",
  starts_at: "startsAt",
  ends_at: "endsAt",
  boost_windows: "windows",
  prizes: "prizes",
};
