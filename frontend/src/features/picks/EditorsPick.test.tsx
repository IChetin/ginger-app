import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Tournament } from "@/api/types/tournaments";
import * as picksApi from "@/features/picks/api";
import { EditorsPick } from "@/features/picks/EditorsPick";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/picks/api", () => ({ fetchEditorPicks: vi.fn() }));

const club = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker" as const,
  chip_value: "1",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};

const tournament = {
  id: "t1",
  name: "DREAM RIVER",
  lobby_name: "Dream River 5K",
  buyin: "16",
  guarantee: "5000",
  satellite_target: null,
  starts_at: "2026-09-18T16:00:00Z",
  club,
} as Tournament;

describe("EditorsPick", () => {
  it("плашка с объяснением по (?) и переходом в турнир", async () => {
    vi.mocked(picksApi.fetchEditorPicks).mockResolvedValue([
      { id: "p1", kind: "mtt", note: "Гарантия ×300 к бай-ину", tournament, tables: [] },
    ]);
    const onSelect = vi.fn();

    renderWithProviders(<EditorsPick kind="mtt" onSelectTournament={onSelect} />);

    expect(await screen.findByText("Dream River 5K")).toBeInTheDocument();
    expect(screen.getByText("Гарантия ×300 к бай-ину")).toBeInTheDocument();
    expect(screen.getByText(/\$16 · GTD \$5 000/)).toBeInTheDocument();

    const help = screen.getByRole("button", { name: "Что такое Editor's Pick" });
    expect(screen.queryByText(/выбрали для наших игроков/)).toBeNull();
    fireEvent.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/выбрали для наших игроков/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("editors-pick-card"));
    expect(onSelect).toHaveBeenCalledWith(tournament);
  });

  it("без пиков плашки нет", async () => {
    vi.mocked(picksApi.fetchEditorPicks).mockResolvedValue([]);
    const view = renderWithProviders(<EditorsPick kind="cash" />);
    await vi.waitFor(() => expect(picksApi.fetchEditorPicks).toHaveBeenCalled());
    expect(view.container.querySelector("[data-testid=editors-pick]")).toBeNull();
  });
});
