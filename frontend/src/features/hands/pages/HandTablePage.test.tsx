import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { authKeys } from "@/features/auth/queryKeys";
import { HandTablePage } from "@/features/hands/pages/HandTablePage";
import { HandInputPage } from "@/features/hands/pages/HandInputPage";
import { clearHandDraft } from "@/features/hands/lib/draftIdb";
import { POSITIONS_BY_SIZE } from "@/features/hands/lib/positions";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import { HAND_INPUT_MODE_STORAGE_KEY } from "@/features/hands/lib/useHandInputMode";
import { renderWithProviders } from "@/test/render";

function feltLabels(size: number): string[] {
  return Array.from({ length: size }, (_, index) => {
    const seat = index + 1;
    const occupied = screen.queryByTestId(`table-seat-${seat}`);
    if (occupied) {
      return (within(occupied).getByTestId("seat-position").textContent ?? "").replace("•", "");
    }
    return (
      within(screen.getByTestId(`table-seat-empty-${seat}`)).getByTestId("empty-seat-avatar")
        .textContent ?? ""
    );
  });
}

const fetchHand = vi.hoisted(() => vi.fn());

vi.mock("@/features/hands/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/hands/api")>();
  return {
    ...actual,
    publishHand: vi.fn(),
    createHandDraft: vi
      .fn()
      .mockResolvedValue({ id: "draft-1", status: "draft", slug: "dR4ftSlugA" }),
    patchHandDraft: vi
      .fn()
      .mockResolvedValue({ id: "draft-1", status: "draft", slug: "dR4ftSlugA" }),
    fetchHand: (...args: unknown[]) => fetchHand(...args),
  };
});

describe("HandTablePage", () => {
  beforeEach(async () => {
    fetchHand.mockReset();
    fetchHand.mockRejectedValue(new ApiError(404, "not_found", "Раздача не найдена"));
    await clearHandDraft();
    localStorage.removeItem(HAND_INPUT_MODE_STORAGE_KEY);
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(HAND_INPUT_MODE_STORAGE_KEY);
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("starts a hand from the setup panel and accepts fold", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-table-page"));
    expect(screen.getByTestId("table-setup-panel")).toBeInTheDocument();
    await user.click(screen.getByTestId("table-start-hand"));
    expect(await screen.findByTestId("table-action-panel")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(screen.getByTestId("table-action-panel")).toBeInTheDocument();
  });

  it("opens table settings from the menu and resumes the hand", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    expect(await screen.findByTestId("table-action-panel")).toBeInTheDocument();
    await user.click(screen.getByTestId("table-header-more"));
    await user.click(screen.getByTestId("table-header-settings"));
    expect(screen.getByTestId("table-setup-panel")).toBeInTheDocument();
    expect(screen.getByTestId("table-resume-hand")).toBeInTheDocument();
    expect(screen.queryByTestId("table-action-panel")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("table-resume-hand"));
    expect(screen.getByTestId("table-action-panel")).toBeInTheDocument();
  });

  it("keeps autosave quiet and puts last save time in the menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    expect(await screen.findByTestId("table-action-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("draft-save-status")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("100 / 200");
    expect(screen.getByRole("banner")).not.toHaveTextContent("Сохранено");
    await user.click(screen.getByTestId("table-header-more"));
    expect(screen.getByTestId("draft-last-saved")).toHaveTextContent(/Сохранено/);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByTestId("draft-save-status")).toHaveTextContent(
      "Офлайн · сохранено на устройстве",
    );
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("draft-save-status")).not.toBeInTheDocument();
    });
  });

  it("undo works next to the action panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    expect(
      within(screen.getByTestId("table-action-panel")).getByTestId("stack-display-toggle"),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).queryByTestId("stack-display-toggle")).toBeNull();
    const undo = await screen.findByTestId("table-undo");
    expect(undo).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: "Фолд" }));
    expect(screen.getByTestId("table-undo")).toBeEnabled();
    await user.click(screen.getByTestId("table-undo"));
    expect(screen.getByRole("button", { name: "Фолд" })).toBeInTheDocument();
  });

  it("hides the seating hint after the first sit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    expect(screen.getByTestId("table-felt-hint")).toHaveTextContent(
      "Тап по пустому месту — посадить, по игроку — настроить",
    );
    await user.click(screen.getByTestId("table-seat-empty-4"));
    expect(screen.queryByTestId("table-felt-hint")).not.toBeInTheDocument();
  });

  it("sits a player from an empty seat on a 9-max table", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    expect(screen.getByTestId("table-start-hand")).toHaveTextContent("3 игрока");
    expect(screen.getByRole("button", { name: "Переименовать: Игрок 2" })).toHaveTextContent(
      "Игрок 2",
    );
    expect(screen.getByRole("button", { name: "Переименовать: Игрок 2" })).not.toHaveTextContent(
      "✎",
    );
    expect(screen.getAllByTestId(/table-seat-empty-/)).toHaveLength(6);
    await user.click(screen.getByTestId("table-seat-empty-4"));
    expect(screen.getByTestId("table-start-hand")).toHaveTextContent("4 игрока");
    expect(
      within(screen.getByTestId("table-seat-4")).getByTestId("seat-position"),
    ).toHaveTextContent("UTG");
  });

  it("treats two seated players as heads-up on a 9-max table", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-seat-2"));
    await user.click(screen.getByTestId("table-seat-2"));
    await user.click(screen.getByTestId("table-seat-remove"));
    expect(screen.getByTestId("table-start-hand")).toHaveTextContent("2 игрока");
    expect(
      within(screen.getByTestId("table-seat-1")).getByTestId("seat-position"),
    ).toHaveTextContent("BTN");
    expect(
      within(screen.getByTestId("table-seat-3")).getByTestId("seat-position"),
    ).toHaveTextContent("BB");
  });

  it("changes table size from the settings sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-open-settings"));
    await user.click(screen.getByTestId("table-open-settings"));
    expect(screen.getByTestId("table-size-9")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("table-size-6"));
    expect(screen.getByTestId("table-settings-sheet")).toBeInTheDocument();
    expect(screen.getAllByTestId(/table-seat-empty-/)).toHaveLength(3);
    await user.click(screen.getByTestId("table-settings-done"));
    expect(screen.getAllByTestId(/table-seat-empty-/)).toHaveLength(3);
    expect(screen.getByTestId("table-start-hand")).toHaveTextContent("3 игрока");
  });

  it("warns before shrinking if a seated player would be removed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-seat-empty-8"));
    await user.click(screen.getByTestId("table-seat-empty-8"));
    await user.click(screen.getByTestId("table-open-settings"));
    await user.click(screen.getByTestId("table-size-6"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Уменьшить стол?");
    expect(dialog).toHaveTextContent("месте 8");
    await user.click(within(dialog).getByRole("button", { name: "Отмена" }));
    expect(screen.getByTestId("table-size-9")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("table-size-6"));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Уменьшить" }),
    );
    expect(screen.getByTestId("table-size-6")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("table-seat-8")).not.toBeInTheDocument();
    expect(screen.queryByTestId("table-seat-empty-8")).not.toBeInTheDocument();
  });

  it("edits a seated player from a mini sheet and keeps required seats", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-seat-2"));
    await user.click(screen.getByTestId("table-seat-2"));
    expect(screen.getByTestId("table-seat-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("table-seat-remove")).toBeInTheDocument();
    expect(screen.queryByTestId("seat-name-suggestions")).not.toBeInTheDocument();
    expect(screen.getByTestId("seat-name-input")).not.toHaveFocus();
    await user.click(screen.getByTestId("table-seat-1"));
    expect(screen.queryByTestId("table-seat-remove")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("table-seat-3"));
    expect(screen.queryByTestId("table-seat-remove")).not.toBeInTheDocument();
  });

  it("keeps setup on a summary bar without a stacks list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-setup-panel"));
    const page = screen.getByTestId("hand-table-page");
    expect(page.className).toMatch(/overflow-hidden/);
    const panel = screen.getByTestId("table-setup-panel");
    expect(panel).toHaveTextContent("100 / 200 · анте 200");
    expect(within(screen.getByRole("banner")).getByText("Новая раздача")).toBeInTheDocument();
    expect(screen.queryByTestId("table-stacks-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-felt-hint")).toBeInTheDocument();
    expect(screen.getByTestId("table-start-hand")).toBeEnabled();
    await user.click(screen.getByTestId("table-start-hand"));
    expect(await screen.findByTestId("table-action-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("table-size-select")).not.toBeInTheDocument();
  });

  it("shows fold, call and raise without a dedicated all-in button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    const panel = await screen.findByTestId("table-action-panel");
    const buttons = within(panel).getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(within(panel).getByTestId("stack-display-toggle")).toBeInTheDocument();
    expect(within(panel).getByTestId("table-undo")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Фолд" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Олл-ин/ })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /Рейз/ }));
    const sizing = await screen.findByTestId("table-sizing-panel");
    expect(within(sizing).getByRole("button", { name: /Олл-ин/ })).toBeInTheDocument();
  });

  it("opens the same player sheet from a name tap during a hand", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    await screen.findByTestId("table-action-panel");
    await user.click(screen.getByRole("button", { name: "Переименовать: Игрок 2" }));
    expect(screen.getByTestId("table-seat-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("seat-name-input")).toHaveFocus();
    expect(screen.queryByTestId("seat-name-suggestions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("table-action-panel")).not.toBeInTheDocument();
  });

  it("invites hero cards, prompts once after preflop, and can skip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    expect(await screen.findByTestId("table-hero-cards-hint")).toHaveTextContent(
      "Тапните по своим картам",
    );
    const heroHoles = within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes");
    expect(heroHoles).toHaveAttribute("data-invite", "1");
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: "Чек" }));
    const prompt = await screen.findByTestId("table-hero-cards-prompt");
    expect(prompt).toHaveTextContent("Вы не указали свои карты");
    await user.click(screen.getByTestId("table-hero-cards-skip"));
    expect(screen.queryByTestId("table-hero-cards-prompt")).not.toBeInTheDocument();
    expect(await screen.findByTestId("table-deck-panel")).toHaveTextContent("Борд");
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
  });

  it("does not start equity after only hero cards are entered", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    await user.click(within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes"));
    expect(await screen.findByTestId("table-deck-panel")).toHaveTextContent("Карты героя");
    await user.click(screen.getByRole("button", { name: "As" }));
    await user.click(screen.getByRole("button", { name: "Kd" }));
    expect(screen.queryByTestId("table-hero-cards-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
    const holes = within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes");
    expect(holes).toHaveAttribute("data-invite", "0");
  });

  it("does not start equity when only hero cards are entered mid-hand", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-start-hand"));
    await user.click(screen.getByTestId("table-start-hand"));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: "Чек" }));
    await user.click(await screen.findByTestId("table-hero-cards-skip"));
    const flop = await screen.findByTestId("table-deck-panel");
    expect(flop).toHaveTextContent("Борд");
    await user.click(screen.getByRole("button", { name: "2c" }));
    await user.click(screen.getByRole("button", { name: "7d" }));
    await user.click(screen.getByRole("button", { name: "Jh" }));
    expect(await screen.findByTestId("table-action-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes"));
    expect(await screen.findByTestId("table-deck-panel")).toHaveTextContent("Карты героя");
    await user.click(screen.getByRole("button", { name: "As" }));
    await user.click(screen.getByRole("button", { name: "Kd" }));
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
  });

  it("does not show not-found on a new client slug while GET 404s", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/hand/:slug" element={<HandTablePage />} />
      </Routes>,
      {
        routerProps: {
          initialEntries: [
            {
              pathname: "/hand/dR4ftSlugA",
              state: {
                creating: true,
                draftId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
                slug: "dR4ftSlugA",
              },
            },
          ],
        },
      },
    );
    expect(await screen.findByTestId("hand-table-page")).toBeInTheDocument();
    expect(screen.queryByText("Раздача не найдена")).not.toBeInTheDocument();
  });

  it("keeps chip defaults when the profile prefers BB", async () => {
    const user = userEvent.setup();
    const profile: UserMe = {
      id: "user-1",
      email: "player@example.com",
      phone: null,
      nickname: "player",
      base_currency: "RUB",
      timezone: null,
      stack_display: "bb",
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
    const { queryClient } = renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    queryClient.setQueryData(authKeys.me(), profile);
    await waitFor(() => {
      expect(screen.getByTestId("table-setup-panel")).toHaveTextContent("0,5 / 1");
    });
    expect(screen.getByTestId("table-setup-panel")).toHaveTextContent("анте 1");
    expect(
      within(screen.getByTestId("table-setup-panel")).getByRole("button", { name: "BB" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("seat-stack")[0]).toHaveTextContent("100");
    expect(screen.getAllByTestId("seat-stack")[0]).toHaveTextContent("BB");
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    expect(within(sheet).queryByTestId("stack-display-toggle")).not.toBeInTheDocument();
    expect(within(sheet).getByDisplayValue("100")).toBeInTheDocument();
    expect(within(sheet).getAllByDisplayValue("200")).toHaveLength(2);
  });

  it("recalculates stacks from the bar toggle and a stack tap", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-setup-panel"));
    const bar = screen.getByTestId("table-setup-panel");
    const stack = () => screen.getAllByTestId("seat-stack")[0];
    expect(stack().textContent?.replace(/\s/g, "")).toBe("20000");
    await user.click(within(bar).getByRole("button", { name: "BB" }));
    expect(bar).toHaveTextContent("0,5 / 1");
    expect(stack()).toHaveTextContent("100");
    expect(stack()).toHaveTextContent("BB");
    expect(localStorage.getItem(STACK_DISPLAY_STORAGE_KEY)).toBe("bb");
    await user.click(stack());
    expect(screen.queryByTestId("table-seat-sheet")).not.toBeInTheDocument();
    expect(stack().textContent?.replace(/\s/g, "")).toBe("20000");
    expect(localStorage.getItem(STACK_DISPLAY_STORAGE_KEY)).toBe("chips");
    await user.click(screen.getByTestId("table-start-hand"));
    const panel = await screen.findByTestId("table-action-panel");
    await user.click(within(panel).getByRole("button", { name: "BB" }));
    expect(screen.getByRole("banner")).toHaveTextContent("0,5 / 1");
    expect(stack()).toHaveTextContent("BB");
    await user.click(within(panel).getByRole("button", { name: "Фишки" }));
    expect(screen.getByRole("banner")).toHaveTextContent("100 / 200");
    expect(stack().textContent).not.toMatch(/BB/);
  });

  it.each([6, 7, 8, 9] as const)("shows unique chair labels on a %s-max table", async (size) => {
    const user = userEvent.setup();
    renderWithProviders(<HandTablePage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("table-open-settings"));
    if (size !== 9) {
      await user.click(screen.getByTestId("table-open-settings"));
      await user.click(screen.getByTestId(`table-size-${size}`));
      await user.click(screen.getByTestId("table-settings-done"));
    }
    const labels = feltLabels(size);
    expect(labels).toHaveLength(size);
    expect(new Set(labels).size).toBe(size);
    expect(labels).toEqual([...POSITIONS_BY_SIZE[size]]);
  });
});

describe("HandInputPage", () => {
  beforeEach(async () => {
    await clearHandDraft();
    localStorage.removeItem(HAND_INPUT_MODE_STORAGE_KEY);
  });

  it("opens the table shell by default", async () => {
    renderWithProviders(<HandInputPage />, { route: "/hand/new" });
    expect(await screen.findByTestId("hand-table-page")).toBeInTheDocument();
  });

  it("opens the wizard when the preference is wizard", async () => {
    localStorage.setItem(HAND_INPUT_MODE_STORAGE_KEY, "wizard");
    renderWithProviders(<HandInputPage />, { route: "/hand/new" });
    expect(await screen.findByTestId("hand-wizard")).toBeInTheDocument();
  });
});
