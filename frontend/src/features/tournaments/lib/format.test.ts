import { describe, expect, it } from "vitest";

import type { Tournament, TournamentClub } from "@/api/types/tournaments";
import {
  formatCountdown,
  formatDayLabel,
  formatMoney,
  formatTags,
  formatTimeMsk,
  groupByDay,
  lateRegLabel,
  tournamentPhase,
} from "@/features/tournaments/lib/format";

const ginger: TournamentClub = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker",
  chip_value: "1.0000",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};

export function tournamentFixture(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "MAIN",
    game_type: "nlh",
    bounty_kind: "none",
    buyin: "16.00",
    guarantee: "1000.00",
    rebuy_cost: null,
    rebuy_terms: null,
    addon_cost: "16.00",
    addon_terms: "3x",
    start_stack: 20000,
    table_size: 8,
    late_reg_levels: 10,
    level_minutes: "15/12/12",
    structure: "Turbo",
    ticket_value: null,
    early_bird_players: null,
    notes: null,
    club: ginger,
    starts_at: "2026-09-13T15:00:00Z",
    late_reg_closes_at: "2026-09-13T17:40:00Z",
    status: "scheduled",
    is_promoted: false,
    buyin_rub: "1408",
    has_addon: true,
    ...overrides,
  };
}

describe("formatMoney", () => {
  it("ставит символ перед суммой и переводит фишки в деньги", () => {
    expect(formatMoney("16.00", ginger)).toBe("$16");
    expect(formatMoney("1.60", ginger)).toBe("$1,6");
    expect(formatMoney("5", { ...ginger, chip_value: "100", currency_symbol: "₽" })).toBe("₽500");
    expect(formatMoney("1000", ginger)?.replace(/\s/g, " ")).toBe("$1 000");
  });

  it("без курса показывает фишки", () => {
    expect(formatMoney("12", { ...ginger, chip_value: null, currency_symbol: null })).toBe(
      "12 фиш.",
    );
    expect(formatMoney(null, ginger)).toBeNull();
  });
});

describe("время и фазы", () => {
  it("время — московское", () => {
    expect(formatTimeMsk("2026-09-13T15:00:00Z")).toBe("18:00");
  });

  it("аддон или конец регистрации", () => {
    expect(lateRegLabel(tournamentFixture())).toBe("Аддон в 20:40");
    expect(lateRegLabel(tournamentFixture({ has_addon: false }))).toBe("Рег. до 20:40");
    expect(lateRegLabel(tournamentFixture({ late_reg_closes_at: null }))).toBeNull();
  });

  it("фаза турнира", () => {
    const t = tournamentFixture();
    expect(tournamentPhase(t, new Date("2026-09-13T14:00:00Z")).kind).toBe("upcoming");
    expect(tournamentPhase(t, new Date("2026-09-13T16:00:00Z")).kind).toBe("late_reg");
    expect(tournamentPhase(t, new Date("2026-09-13T18:00:00Z")).kind).toBe("closed");
  });

  it("обратный отсчёт", () => {
    expect(formatCountdown(47 * 60_000 + 5_000)).toBe("47:05");
    expect(formatCountdown(72 * 60_000 + 5_000)).toBe("1:12:05");
    expect(formatCountdown(-1)).toBe("00:00");
  });

  it("дни по Москве", () => {
    const now = new Date("2026-09-13T10:00:00Z");
    expect(formatDayLabel("2026-09-13", now)).toMatch(/^Сегодня/);
    expect(formatDayLabel("2026-09-14", now)).toMatch(/^Завтра/);
    // 22:30 UTC — уже следующий день по Москве.
    const groups = groupByDay([
      tournamentFixture({ id: "a", starts_at: "2026-09-13T20:00:00Z" }),
      tournamentFixture({ id: "b", starts_at: "2026-09-13T22:30:00Z" }),
    ]);
    expect(groups.map(([day]) => day)).toEqual(["2026-09-13", "2026-09-14"]);
  });

  it("метки формата", () => {
    expect(
      formatTags(
        tournamentFixture({ game_type: "plo5", bounty_kind: "pko", early_bird_players: 10 }),
      ),
    ).toEqual(["PLO5", "PKO", "Early Bird ×10"]);
  });
});
