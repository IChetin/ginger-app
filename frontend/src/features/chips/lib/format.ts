import type {
  AccountClub,
  ChipRequest,
  ChipRequestKind,
  ChipRequestStatus,
} from "@/api/types/chips";

const OPEN: ReadonlySet<ChipRequestStatus> = new Set([
  "sent",
  "accepted",
  "awaiting_payment",
  "paid",
]);

export function isOpen(status: ChipRequestStatus): boolean {
  return OPEN.has(status);
}

export function statusLabel(status: ChipRequestStatus, kind: ChipRequestKind): string {
  switch (status) {
    case "sent":
      return "Отправлена";
    case "accepted":
      return "Принята";
    case "awaiting_payment":
      return "Ждёт оплаты";
    case "paid":
      return "Оплата на проверке";
    case "completed":
      return kind === "withdrawal" ? "Выведено" : "Выдана";
    case "rejected":
      return "Отклонена";
    case "expired":
      return "Истекла";
  }
}

export type StatusTone = "wait" | "action" | "done" | "fail";

export function statusTone(status: ChipRequestStatus): StatusTone {
  if (status === "awaiting_payment") return "action";
  if (status === "completed") return "done";
  if (status === "rejected" || status === "expired") return "fail";
  return "wait";
}

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function formatNumber(value: string | number): string {
  return numberFormat.format(Number(value));
}

/** «$100», «₽5 000» — символ перед числом (решение 5.21). */
export function formatMoney(amount: string | number, symbol: string | null, code: string): string {
  return `${symbol ?? `${code} `}${formatNumber(amount)}`;
}

/**
 * Кнопки сумм в фишках клуба (ответ 11.10): долларовые клубы — 10/25/50/100,
 * фишка за 1 ₽ — 1 000…10 000, фишка за 100 ₽ — 10/30/50/100.
 */
export function amountPresets(club: AccountClub): number[] {
  const code = club.chip_currency_code;
  if (code === "RUB") {
    return Number(club.chip_value ?? 1) >= 50 ? [10, 30, 50, 100] : [1000, 3000, 5000, 10000];
  }
  return [10, 25, 50, 100];
}

export function parseAmount(value: string): number {
  const number = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export interface TotalLine {
  code: string;
  symbol: string | null;
  amount: number;
}

/** Итог «в деньгах» по валютам: фишки × курс клуба. Клубы без курса не считаются. */
export function computeTotals(rows: { club: AccountClub; amount: number }[]): TotalLine[] {
  const totals = new Map<string, TotalLine>();
  for (const row of rows) {
    const code = row.club.chip_currency_code;
    if (!code || row.club.chip_value === null || row.amount <= 0) continue;
    const line = totals.get(code) ?? { code, symbol: row.club.currency_symbol, amount: 0 };
    line.amount += row.amount * Number(row.club.chip_value);
    totals.set(code, line);
  }
  return [...totals.values()];
}

export function requestSummary(request: ChipRequest): string {
  return request.items.map((item) => `${item.club.name} ${formatNumber(item.amount)}`).join(", ");
}

/** «18:42» — сколько осталось на оплату. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateMsk(iso: string): string {
  return dateFormat.format(new Date(iso));
}
