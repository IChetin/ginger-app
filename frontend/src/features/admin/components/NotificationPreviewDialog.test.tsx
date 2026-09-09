import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { NotificationPreviewResponse } from "@/api/types/notifications";
import { NotificationPreviewDialog } from "@/features/admin/components/NotificationPreviewDialog";
import { renderWithProviders } from "@/test/render";

const preview: NotificationPreviewResponse = {
  preview_token: "token-1",
  expires_in_seconds: 300,
  entity_type: "event",
  entity_id: "event-1",
  diffs: [{ field: "guarantee", old_value: "100000", new_value: "150000" }],
  impacts: [
    {
      type: "guarantee_changed",
      title: "Гарантия изменена",
      body: "Main Event: 100000 → 150000",
      url: "/events/rpt-demo-1-main-event",
      recipient_count: 3,
    },
  ],
  total_recipients: 3,
  requires_confirmation: true,
};

describe("NotificationPreviewDialog", () => {
  it("shows diffs, impacts and confirms", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <NotificationPreviewDialog
        open
        preview={preview}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Подтверждение рассылки")).toBeInTheDocument();
    expect(screen.getByText(/Получателей:/)).toBeInTheDocument();
    expect(screen.getByText("guarantee")).toBeInTheDocument();
    expect(screen.getByText("Гарантия изменена")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("warns when there are zero recipients", () => {
    renderWithProviders(
      <NotificationPreviewDialog
        open
        preview={{ ...preview, total_recipients: 0, impacts: [] }}
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByText("Подписчиков нет — рассылка никого не затронет.")).toBeInTheDocument();
  });
});
