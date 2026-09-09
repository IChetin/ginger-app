import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TableInputHeader } from "@/features/hands/components/table-input/TableInputHeader";
import { emptyTableInput, tableReducer } from "@/features/hands/lib/tableInputState";
import { renderWithProviders } from "@/test/render";

function renderHeader(
  status: "hidden" | "saving" | "offline" | "error" = "hidden",
  lastSavedAt: string | null = "2026-08-23T11:58:00.000Z",
  onRetry = vi.fn(),
  onOpenSettings?: () => void,
) {
  const state = tableReducer(emptyTableInput(), { type: "startHand" });
  return {
    onRetry,
    onOpenSettings,
    ...renderWithProviders(
      <TableInputHeader
        state={state}
        dispatch={() => undefined}
        saveStatus={status}
        lastSavedAt={lastSavedAt}
        onRetry={onRetry}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    ),
  };
}

describe("TableInputHeader", () => {
  it("keeps blinds in the title and hides a fast save", () => {
    renderHeader("hidden");
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("100 / 200");
    expect(header).toHaveTextContent("Префлоп");
    expect(header).not.toHaveTextContent("Сохранено");
    expect(header).not.toHaveTextContent("Сохраняется");
    expect(screen.queryByTestId("stack-display-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("draft-save-status")).not.toBeInTheDocument();
    expect(header.className).toMatch(/relative/);
  });

  it("overlays save errors without replacing the subtitle", () => {
    renderHeader("error");
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("100 / 200");
    expect(screen.getByTestId("draft-save-status")).toHaveAttribute("data-status", "error");
    expect(screen.getByTestId("draft-save-status").className).toMatch(/absolute/);
    expect(screen.getByTestId("draft-save-retry")).toHaveTextContent(
      "Не удалось сохранить · Повторить",
    );
  });

  it("retries a failed save from the overlay", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderHeader("error");
    await user.click(screen.getByTestId("draft-save-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows last save time in the overflow menu", async () => {
    const user = userEvent.setup();
    renderHeader("hidden", "2026-08-23T11:58:00.000Z");
    await user.click(screen.getByTestId("table-header-more"));
    expect(screen.getByTestId("draft-last-saved")).toHaveTextContent(/Сохранено/);
  });

  it("offers table settings from the overflow menu during a hand", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderHeader("hidden", "2026-08-23T11:58:00.000Z", vi.fn(), onOpenSettings);
    await user.click(screen.getByTestId("table-header-more"));
    await user.click(screen.getByTestId("table-header-settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
