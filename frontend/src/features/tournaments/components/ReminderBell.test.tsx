import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tournament } from "@/api/types/tournaments";
import { ReminderBell } from "@/features/tournaments/components/ReminderBell";
import * as remindersApi from "@/features/tournaments/remindersApi";

vi.mock("@/features/tournaments/remindersApi", () => ({
  fetchReminders: vi.fn().mockResolvedValue([]),
  putReminders: vi.fn(),
}));

// Расписание открыто гостям: колокольчик сам решает, вошёл ли игрок.
const auth = vi.hoisted(() => ({ user: { id: "u1" } as unknown }));
vi.mock("@/features/auth/hooks", () => ({
  useMe: () => ({ data: auth.user }),
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
    lobby_name: null,
    bounty_share: null,
    early_bird_bonus: null,
    early_bird_levels: null,
    has_jackpot: false,
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
  beforeEach(() => {
    auth.user = { id: "u1" };
  });

  it("guest sees a login hint instead of reminder switches", () => {
    auth.user = undefined;
    renderBell(tournament());
    fireEvent.click(screen.getByRole("button", { name: "Напомнить о турнире" }));
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(remindersApi.fetchReminders).not.toHaveBeenCalled();
  });

  it("sets a start reminder and hints to install when push is unsupported", async () => {
    vi.mocked(remindersApi.putReminders).mockResolvedValue([
      { tournament_id: "t1", kind: "start" },
    ]);
    renderBell(tournament());
    fireEvent.click(screen.getByRole("button", { name: "Напомнить о турнире" }));
    // Без аддона о конце регистрации не напоминаем.
    expect(screen.queryByRole("switch", { name: /до аддона/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /до старта/ }));
    await waitFor(() => expect(remindersApi.putReminders).toHaveBeenCalledWith("t1", ["start"]));
    expect(await screen.findByText(/установите приложение на экран/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Напоминания включены" })).toBeInTheDocument();
  });

  it("offers only the addon bell for a running tournament and hides without addon", () => {
    const running = tournament({ starts_at: "2026-09-13T14:30:00Z", has_addon: true });
    const { unmount } = renderBell(running);
    fireEvent.click(screen.getByRole("button", { name: "Напомнить о турнире" }));
    expect(screen.queryByRole("switch", { name: /до старта/ })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /до аддона/ })).toBeInTheDocument();
    unmount();

    const noAddon = renderBell(tournament({ starts_at: "2026-09-13T14:30:00Z" }));
    expect(screen.queryByRole("button", { name: "Напомнить о турнире" })).not.toBeInTheDocument();
    noAddon.unmount();

    renderBell(tournament({ starts_at: "2026-09-13T12:00:00Z", late_reg_closes_at: null }));
    expect(screen.queryByRole("button", { name: "Напомнить о турнире" })).not.toBeInTheDocument();
  });
});
