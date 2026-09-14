import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerAdmin } from "@/features/admin/chips/api";
import * as chipsApi from "@/features/admin/chips/api";
import type { PlayerCrmCard } from "@/features/admin/crm/crmApi";
import * as crmApi from "@/features/admin/crm/crmApi";
import { formatAgo, formatBirthdaySoon } from "@/features/admin/crm/hooks";
import { AdminBroadcastsPage } from "@/pages/admin/AdminBroadcastsPage";
import { AdminPlayerPage } from "@/pages/admin/AdminPlayerPage";
import { AdminPlayersPage } from "@/pages/admin/AdminPlayersPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/admin/hooks", () => ({
  useMe: () => ({ data: { id: "u0", role: "admin" } }),
  isAdminUser: () => true,
}));

vi.mock("@/features/admin/chips/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/admin/chips/api")>();
  return {
    ...original,
    fetchAdminPlayers: vi.fn(),
    fetchPendingAccounts: vi.fn(),
    updateAdminPlayer: vi.fn(),
  };
});

vi.mock("@/features/admin/crm/crmApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/admin/crm/crmApi")>();
  return {
    ...original,
    fetchPlayerCard: vi.fn(),
    previewBroadcast: vi.fn(),
    sendBroadcast: vi.fn(),
    fetchBroadcasts: vi.fn(),
  };
});

function makePlayer(overrides: Partial<PlayerAdmin> = {}): PlayerAdmin {
  return {
    id: "p1",
    user_id: "u1",
    nickname: "Fox",
    email: "fox@example.com",
    kind: "credit",
    status: "active",
    offline_access: false,
    results_consent: true,
    birthday: null,
    notes: null,
    referrer_player_id: null,
    accounts: [],
    created_at: "2026-08-01T12:00:00Z",
    real_name: null,
    phone: null,
    telegram: null,
    source: null,
    tags: [],
    last_seen_at: null,
    last_request_at: null,
    last_activity_at: "2026-09-13T12:00:00Z",
    requests_30d: 0,
    sleeping: false,
    days_to_birthday: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(chipsApi.fetchPendingAccounts).mockResolvedValue([]);
  vi.mocked(crmApi.fetchBroadcasts).mockResolvedValue([]);
});

describe("crm format", () => {
  it("formats activity and birthdays", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    expect(formatAgo(null, now)).toBe("не заходил");
    expect(formatAgo("2026-09-14T08:00:00Z", now)).toBe("сегодня");
    expect(formatAgo("2026-09-13T08:00:00Z", now)).toBe("вчера");
    expect(formatAgo("2026-09-04T08:00:00Z", now)).toBe("10 дн. назад");
    expect(formatBirthdaySoon(null)).toBeNull();
    expect(formatBirthdaySoon(0)).toBe("ДР сегодня");
    expect(formatBirthdaySoon(5)).toBe("ДР через 5 дн.");
  });
});

describe("AdminPlayersPage", () => {
  it("filters by segment and tag", async () => {
    vi.mocked(chipsApi.fetchAdminPlayers).mockResolvedValue([
      makePlayer({ id: "p1", nickname: "Fox", tags: ["vip"] }),
      makePlayer({ id: "p2", nickname: "Sleepy", sleeping: true }),
      makePlayer({ id: "p3", nickname: "Party", days_to_birthday: 3 }),
    ]);
    renderWithProviders(<AdminPlayersPage />, { route: "/admin/players" });

    expect(await screen.findAllByTestId("player-row")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Fox/ })).toHaveAttribute("href", "/admin/players/p1");

    fireEvent.click(screen.getByRole("button", { name: /Спящие/ }));
    expect(screen.getAllByTestId("player-row")).toHaveLength(1);
    expect(screen.getByText("Sleepy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ДР скоро/ }));
    expect(screen.getByText("ДР через 3 дн.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Все/ }));
    fireEvent.click(screen.getByRole("button", { name: /#vip/ }));
    expect(screen.getAllByTestId("player-row")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Рассылка" })).toHaveAttribute(
      "href",
      "/admin/broadcasts?segment=tag&tag=vip",
    );
  });
});

describe("AdminPlayerPage", () => {
  it("shows the card and adds a tag", async () => {
    const card: PlayerCrmCard = {
      ...makePlayer({ tags: ["vip"], real_name: "Иван Лисов", requests_30d: 2 }),
      referrer_nickname: "Boss",
      invited_players: 1,
      completed_topups: 4,
      requests: [
        {
          id: "r1",
          kind: "topup",
          status: "completed",
          summary: "Ginger 100",
          created_at: "2026-09-12T10:00:00Z",
        },
      ],
      threads: [],
    };
    vi.mocked(crmApi.fetchPlayerCard).mockResolvedValue(card);
    vi.mocked(chipsApi.updateAdminPlayer).mockResolvedValue(card);

    renderWithProviders(
      <Routes>
        <Route path="/admin/players/:playerId" element={<AdminPlayerPage />} />
      </Routes>,
      { route: "/admin/players/p1" },
    );

    expect(await screen.findByTestId("admin-player")).toBeInTheDocument();
    expect(screen.getByText(/привёл Boss/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ginger 100/ })).toHaveAttribute(
      "href",
      "/admin/chips/r1",
    );

    fireEvent.change(screen.getByLabelText("Новый тег"), { target: { value: "#хайроллер" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() =>
      expect(chipsApi.updateAdminPlayer).toHaveBeenCalledWith("p1", {
        tags: ["vip", "хайроллер"],
      }),
    );
  });
});

describe("AdminBroadcastsPage", () => {
  it("previews the segment and sends after confirmation", async () => {
    vi.mocked(chipsApi.fetchAdminPlayers).mockResolvedValue([]);
    vi.mocked(crmApi.previewBroadcast).mockResolvedValue({ recipients: 12, with_push: 7 });
    vi.mocked(crmApi.sendBroadcast).mockResolvedValue({
      id: "b1",
      title: "Фриролл",
      body: "Сегодня в 20:00",
      url: "/tournaments",
      segment: { kind: "sleeping" },
      recipients: 12,
      pushes: 7,
      author_nickname: "Ivan",
      created_at: "2026-09-14T10:00:00Z",
    });

    renderWithProviders(<AdminBroadcastsPage />, { route: "/admin/broadcasts?segment=sleeping" });

    expect(await screen.findByText("В сегменте 12 игроков, пуш получат 7")).toBeInTheDocument();
    expect(vi.mocked(crmApi.previewBroadcast).mock.calls[0]?.[0]).toMatchObject({
      kind: "sleeping",
    });

    fireEvent.change(screen.getByLabelText("Заголовок пуша"), { target: { value: "Фриролл" } });
    fireEvent.change(screen.getByLabelText("Текст пуша"), {
      target: { value: "Сегодня в 20:00" },
    });
    fireEvent.change(screen.getByLabelText("Куда ведёт пуш"), {
      target: { value: "/tournaments" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    const buttons = await screen.findAllByRole("button", { name: "Отправить" });
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(await screen.findByText("Отправлено: 7 из 12")).toBeInTheDocument();
    expect(vi.mocked(crmApi.sendBroadcast).mock.calls[0]?.[0]).toEqual({
      title: "Фриролл",
      body: "Сегодня в 20:00",
      url: "/tournaments",
      segment: { kind: "sleeping", tag: null, player_kind: null, player_ids: [] },
    });
  });
});
