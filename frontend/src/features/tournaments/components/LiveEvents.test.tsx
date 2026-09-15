import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LiveEvent, Tournament } from "@/api/types/tournaments";
import { LiveEvents } from "@/features/tournaments/components/LiveEvents";
import * as liveApi from "@/features/tournaments/liveApi";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/tournaments/liveApi", () => ({
  fetchLiveEvents: vi.fn(),
  fetchTournamentSatellites: vi.fn(),
}));

const club = {
  id: "c1",
  name: "Ginger+",
  slug: "ginger-plus",
  app: "xpoker" as const,
  chip_value: "100",
  chip_currency_code: "RUB",
  currency_symbol: "₽",
};

function item(overrides: Partial<Tournament>): Tournament {
  return {
    id: "t1",
    name: "ME APC45 STEP",
    lobby_name: null,
    buyin: "5",
    starts_at: "2026-09-15T16:00:00Z",
    live_event: "APC45 Main Event",
    live_dates: "8–11 октября",
    live_step: 1,
    notes: "2 билета по 4 000 ₽",
    club,
    ...overrides,
  } as Tournament;
}

describe("LiveEvents", () => {
  it("свёрнут по умолчанию, раскрывается и открывает турнир", async () => {
    const step = item({});
    const final = item({ id: "t2", name: "Main Event APC45", buyin: "300", live_step: null });
    const events: LiveEvent[] = [
      { title: "APC45 Main Event", dates: "8–11 октября", club, items: [step, final] },
    ];
    vi.mocked(liveApi.fetchLiveEvents).mockResolvedValue(events);
    const onSelect = vi.fn();

    renderWithProviders(<LiveEvents onSelect={onSelect} />);

    const toggle = await screen.findByRole("button", { name: /Путь в живые серии/ });
    expect(screen.queryByText("APC45 Main Event")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText("APC45 Main Event")).toBeInTheDocument();
    expect(screen.getByText("8–11 октября")).toBeInTheDocument();
    expect(screen.getByText("₽30 000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Шаг 1 · 2 билета по 4 000 ₽/ }));
    expect(onSelect).toHaveBeenCalledWith(step);
  });
});
