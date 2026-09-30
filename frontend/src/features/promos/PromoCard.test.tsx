import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fromMskInput, textToPrizes, textToWindows, toMskInput } from "@/features/promos/form";
import { activeWindow, formatPromoMoney, promoPhase } from "@/features/promos/lib";
import { PromoCard } from "@/features/promos/PromoCard";
import type { Promo } from "@/features/promos/promosApi";
import { renderWithProviders } from "@/test/render";

function promo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: "p1",
    club: { id: "c1", name: "Ginger21", app: "poker21" },
    kind: "leaderboard",
    title: "Leaderboard MTT",
    prize_fund: "610000.00",
    prize_extra: null,
    currency_code: "RUB",
    currency_symbol: "₽",
    starts_at: "2026-09-28T07:00:00Z",
    ends_at: "2026-12-28T03:00:00Z",
    recurrence: "none",
    game: "mtt",
    buyin_min: "500.00",
    buyin_max: "10000.00",
    prizes: [
      { place: 1, amount: "250000.00", label: null },
      { place: 2, amount: "150000.00", label: null },
      { place: 3, amount: "100000.00", label: null },
      { place: 4, amount: null, label: "Black VIP Card" },
    ],
    boost_windows: [{ start: "10:00", end: "12:00", multiplier: 2 }],
    image_url: null,
    ...overrides,
  };
}

// 30.09.2026 11:15 по Москве — внутри окна x2 10:00–12:00.
const IN_WINDOW = new Date("2026-09-30T08:15:00Z");
const OUT_OF_WINDOW = new Date("2026-09-30T15:00:00Z");

describe("плашка акции", () => {
  it("показывает фонд, срок, условия и горящий x2", async () => {
    renderWithProviders(<PromoCard promo={promo()} now={IN_WINDOW} main />, { route: "/promos" });

    expect(screen.getByText("₽610 000")).toBeInTheDocument();
    expect(screen.getByTestId("promo-when")).toHaveTextContent("до 28 декабря, 06:00");
    expect(screen.getByTestId("promo-when")).toHaveTextContent("осталось 89 дней");
    expect(screen.getByText("бай-ин ₽500 – ₽10 000")).toBeInTheDocument();
    expect(screen.getByTestId("promo-boost")).toHaveTextContent("Двойные очки сейчас · ещё 45 мин");

    // Три приза сразу, остальные по тапу.
    expect(screen.queryByText("Black VIP Card")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ещё 1 место ▾" }));
    expect(screen.getByText("Black VIP Card")).toBeInTheDocument();
  });

  it("вне окна — расписание двойных очков, у будущей — старт", () => {
    renderWithProviders(
      <PromoCard
        promo={promo({
          starts_at: "2026-09-30T21:00:00Z",
          ends_at: "2026-10-31T21:00:00Z",
          recurrence: "monthly",
        })}
        now={OUT_OF_WINDOW}
      />,
      { route: "/promos" },
    );

    expect(screen.getByTestId("promo-boost")).toHaveTextContent(
      "Двойные очки каждый день 10:00–12:00 МСК",
    );
    expect(screen.getByText("Старт завтра")).toBeInTheDocument();
    expect(screen.getByTestId("promo-when")).toHaveTextContent("с 1 октября по 31 октября");
    expect(screen.getByTestId("promo-when")).toHaveTextContent("каждый месяц");
  });
});

describe("расчёты акции", () => {
  it("окно x2 по Москве, в том числе через полночь", () => {
    const windows = [{ start: "10:00", end: "12:00", multiplier: 2 }];
    expect(activeWindow(windows, IN_WINDOW)?.minutesLeft).toBe(45);
    expect(activeWindow(windows, OUT_OF_WINDOW)).toBeNull();
    const night = [{ start: "23:00", end: "01:00", multiplier: 3 }];
    // 30.09 23:30 МСК = 20:30 UTC.
    expect(activeWindow(night, new Date("2026-09-30T20:30:00Z"))?.minutesLeft).toBe(90);
  });

  it("фаза: скоро, идёт, закончилась", () => {
    expect(promoPhase(promo(), IN_WINDOW)).toEqual({ kind: "running", daysLeft: 89 });
    expect(promoPhase(promo({ ends_at: "2026-09-30T08:00:00Z" }), IN_WINDOW).kind).toBe("ended");
    expect(promoPhase(promo({ starts_at: "2026-10-03T08:15:00Z" }), IN_WINDOW)).toEqual({
      kind: "upcoming",
      startsInDays: 3,
    });
  });

  it("деньги символом вперёд", () => {
    // Разряды Intl делит узким неразрывным пробелом — сравниваем без него.
    expect(formatPromoMoney("90000.00", "₽")?.replace(/\s/g, " ")).toBe("₽90 000");
    expect(formatPromoMoney(null, "₽")).toBeNull();
  });

  it("форма: призы строками, окна x2 и даты по Москве", () => {
    expect(textToPrizes("1 — 250 000 ₽\n2 - 150000\n10 — Black VIP Card\nмусор")).toEqual([
      { place: 1, amount: "250000", label: null },
      { place: 2, amount: "150000", label: null },
      { place: 10, amount: null, label: "Black VIP Card" },
    ]);
    expect(textToWindows("10:00–12:00, 9:00-9:30")).toEqual([
      { start: "10:00", end: "12:00", multiplier: 2 },
      { start: "09:00", end: "09:30", multiplier: 2 },
    ]);
    expect(toMskInput("2026-09-28T07:00:00Z")).toBe("2026-09-28T10:00");
    expect(fromMskInput("2026-09-28T10:00")).toBe("2026-09-28T07:00:00.000Z");
  });
});
