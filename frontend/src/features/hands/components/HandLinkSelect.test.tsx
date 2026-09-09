import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import type { HandLinkTarget } from "@/api/types/hands";
import { HandLinkSelect } from "@/features/hands/components/HandLinkSelect";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchHandLinkTargets = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/hands/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/hands/api")>("@/features/hands/api");
  return {
    ...actual,
    fetchHandLinkTargets: (...args: unknown[]) => fetchHandLinkTargets(...args),
  };
});

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "player",
  base_currency: "RUB",
  timezone: null,
  stack_display: "chips",
  hide_holes_until_showdown: true,
  hand_input_mode: "table",
  card_deck: "four_color",
  results_visibility: "private",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

function target(overrides: Partial<HandLinkTarget>): HandLinkTarget {
  return {
    kind: "event",
    section: "today",
    event_id: null,
    series_id: null,
    live_session_id: null,
    label: "Турнир",
    series_name: "Серия",
    ...overrides,
  };
}

describe("HandLinkSelect", () => {
  beforeEach(() => {
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchHandLinkTargets.mockResolvedValue([
      target({
        kind: "live",
        section: "live",
        event_id: "event-live",
        live_session_id: "live-1",
        label: "Текущий турнир · Main",
      }),
      target({
        kind: "event",
        section: "today",
        event_id: "event-today",
        label: "#1 Сегодня",
      }),
      target({
        kind: "series",
        section: "running",
        series_id: "series-1",
        label: "Серия · APC",
      }),
    ]);
  });

  it("stays compact until opened in its own sheet", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <HandLinkSelect eventId={null} seriesId={null} liveSessionId={null} onChange={onChange} />,
    );
    expect(screen.getByTestId("hand-link-trigger")).toHaveTextContent("Не привязывать");
    expect(screen.queryByTestId("hand-link-picker")).not.toBeInTheDocument();
    expect(screen.queryByText("Активная сессия")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hand-link-none")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("hand-link-trigger"));
    const picker = await screen.findByTestId("hand-link-picker");
    expect(picker).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Турнир" }).className).toMatch(/max-w-\[420px\]/);
    expect(screen.getByTestId("hand-link-search")).toBeInTheDocument();
    expect(screen.getByText("Активная сессия")).toBeInTheDocument();
    expect(screen.getByText("Сегодня")).toBeInTheDocument();
    expect(screen.getByText("Идущие серии")).toBeInTheDocument();
    expect(screen.getByTestId("hand-link-none")).toBeInTheDocument();

    await user.click(screen.getByTestId("hand-link-series:series-1"));
    expect(onChange).toHaveBeenCalledWith({
      eventId: null,
      seriesId: "series-1",
      liveSessionId: null,
    });
    expect(screen.queryByTestId("hand-link-picker")).not.toBeInTheDocument();
  });

  it("searches from the picker sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HandLinkSelect eventId={null} seriesId={null} liveSessionId={null} onChange={vi.fn()} />,
    );
    await user.click(screen.getByTestId("hand-link-trigger"));
    await user.type(screen.getByTestId("hand-link-search"), "мейн");
    await waitFor(() => {
      expect(fetchHandLinkTargets).toHaveBeenCalledWith("мейн");
    });
  });
});
