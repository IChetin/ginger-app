import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import type { UserMe } from "@/api/types/auth";
import { ResultFormPage } from "@/features/tracker/ResultFormPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.fn();
const createResult = vi.fn();
const updateResult = vi.fn();
const fetchResult = vi.fn();
const fetchResultCurrencies = vi.fn();
const deleteResult = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/tracker/api", () => ({
  createResult: (...args: unknown[]) => createResult(...args),
  updateResult: (...args: unknown[]) => updateResult(...args),
  fetchResult: (...args: unknown[]) => fetchResult(...args),
  fetchResultCurrencies: (...args: unknown[]) => fetchResultCurrencies(...args),
  deleteResult: (...args: unknown[]) => deleteResult(...args),
}));

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "ace",
  base_currency: "RUB",
  timezone: null,
  stack_display: "chips",
  hide_holes_until_showdown: true,
  results_visibility: "private",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("ResultFormPage", () => {
  beforeEach(() => {
    fetchCurrentUser.mockResolvedValue(userFixture);
    createResult.mockResolvedValue({ id: "new", events: [] });
    updateResult.mockReset();
    fetchResult.mockReset();
    deleteResult.mockReset();
    fetchResultCurrencies.mockResolvedValue([{ code: "RUB", symbol: "₽" }]);
  });

  it("creates manual result with events snapshot", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/tracker/results/new" element={<ResultFormPage />} />
        <Route path="/tracker" element={<div>Tracker home</div>} />
      </Routes>,
      { route: "/tracker/results/new" },
    );

    expect(await screen.findByTestId("result-form-page")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Название турнира"), "Home Game");
    await user.type(screen.getByLabelText("Дата"), "2024-06-01");
    const buyin = screen.getByLabelText("Бай-ин");
    await user.clear(buyin);
    await user.type(buyin, "100");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(createResult).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Home Game",
          played_on: "2024-06-01",
          buyin: "100",
          currency_code: "RUB",
          events: expect.arrayContaining([
            expect.objectContaining({ type: "entry", amount: "100" }),
          ]),
        }),
      );
    });
    expect(await screen.findByText("Tracker home")).toBeInTheDocument();
  });

  it("persists a note immediately when editing an existing result", async () => {
    const user = userEvent.setup();
    fetchResult.mockResolvedValue({
      id: "r1",
      entry_type: "live_mtt",
      event_id: null,
      name: "Home Game",
      venue_text: "Minsk",
      series_text: null,
      played_on: "2024-06-01",
      buyin: "100",
      currency_code: "RUB",
      entries_count: 1,
      payout: "0",
      place: null,
      field_size: null,
      note: null,
      events: [
        {
          id: "e1",
          type: "entry",
          amount: "100",
          currency_code: "RUB",
          text: null,
          occurred_at: "2024-06-01T12:00:00.000Z",
          created_at: "2024-06-01T12:00:00.000Z",
        },
      ],
      created_at: "2024-06-01T12:00:00Z",
      updated_at: "2024-06-01T12:00:00Z",
    });
    updateResult.mockResolvedValue({ id: "r1", events: [] });

    renderWithProviders(
      <Routes>
        <Route path="/tracker/results/:resultId/edit" element={<ResultFormPage />} />
      </Routes>,
      { route: "/tracker/results/r1/edit" },
    );

    expect(await screen.findByText("Home Game")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Заметка" }));
    await user.type(screen.getByPlaceholderText("Что произошло за столом?"), "Бабл");
    const saveButtons = screen.getAllByRole("button", { name: "Сохранить" });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(updateResult).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({ type: "entry" }),
            expect.objectContaining({ type: "note", text: "Бабл" }),
          ]),
        }),
      );
    });
  });
});
