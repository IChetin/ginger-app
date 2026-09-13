import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Tournament } from "@/api/types/tournaments";
import { ReminderBell } from "@/features/tournaments/components/ReminderBell";
import * as remindersApi from "@/features/tournaments/remindersApi";

vi.mock("@/features/tournaments/remindersApi", () => ({
  fetchReminders: vi.fn().mockResolvedValue([]),
  putReminders: vi.fn(),
}));

vi.mock("@/features/push/hooks", () => ({
  isPushSupported: () => false,
  usePushSubscription: () => ({ data: null }),
  useSubscribePush: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const now = new Date("2026-09-13T15:00:00Z");

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "Daily",
    game_type: "nlh",
    bounty_kind: "none",
    buyin: "10",
    guarantee: null,
    rebuy_cost: null,
    rebuy_terms: null,
    addon_cost: null,
    addon_terms: null,
    start_stack: null,
    table_size: null,
    late_reg_levels: null,
    level_minutes: null,
    structure: null,
    ticket_value: null,
    satellite_target: null,
    early_bird_players: null,
    notes: null,
    club: {
      id: "c1",
      name: "Ginger",
      slug: "ginger",
      app: "pppoker",
      chip_value: "1",
      chip_currency_code: "USDT",
      currency_symbol: "$",
    },
    starts_at: "2026-09-13T17:00:00Z",
    late_reg_closes_at: "2026-09-13T18:00:00Z",
    status: "scheduled",
    is_promoted: false,
    buyin_rub: null,
    guarantee_rub: null,
    has_addon: false,
    ...overrides,
  };
}

function renderBell(item: Tournament) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReminderBell tournament={item} now={now} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReminderBell", () => {
  it("sets a start reminder and hints to install when push is unsupported", async () => {
    vi.mocked(remindersApi.putReminders).mockResolvedValue([
      { tournament_id: "t1", kind: "start" },
    ]);
    renderBell(tournament());
    fireEvent.click(screen.getByRole("button", { name: "Напомнить о турнире" }));
    expect(screen.getByRole("switch", { name: /до конца регистрации/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /до старта/ }));
    await waitFor(() => expect(remindersApi.putReminders).toHaveBeenCalledWith("t1", ["start"]));
    expect(await screen.findByText(/установите приложение на экран/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Напоминания включены" })).toBeInTheDocument();
  });

  it("offers only the late-reg bell for a running tournament and hides for finished", () => {
    const running = tournament({ starts_at: "2026-09-13T14:30:00Z" });
    const { unmount } = renderBell(running);
    fireEvent.click(screen.getByRole("button", { name: "Напомнить о турнире" }));
    expect(screen.queryByRole("switch", { name: /до старта/ })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /до конца регистрации/ })).toBeInTheDocument();
    unmount();

    renderBell(tournament({ starts_at: "2026-09-13T12:00:00Z", late_reg_closes_at: null }));
    expect(screen.queryByRole("button", { name: "Напомнить о турнире" })).not.toBeInTheDocument();
  });
});
