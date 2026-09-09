import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReminderOffsetsDialog } from "@/features/bookmarks/components/ReminderOffsetsDialog";
import { renderWithProviders } from "@/test/render";

describe("ReminderOffsetsDialog", () => {
  it("requires at least one preset offset", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ReminderOffsetsDialog
        open
        onOpenChange={() => undefined}
        defaultOffsets={[]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Выберите хотя бы одно напоминание")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits selected offsets", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(
      <ReminderOffsetsDialog
        open
        onOpenChange={() => undefined}
        defaultOffsets={[1440, 120]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([1440, 120]);
    });
  });
});
