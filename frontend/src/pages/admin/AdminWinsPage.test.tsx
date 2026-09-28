import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as feedApi from "@/features/feed/feedApi";
import { AdminWinsPage } from "@/pages/admin/AdminWinsPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/chips/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/chips/hooks")>();
  return { ...original, usePublicClubs: () => ({ data: [{ id: "c1", name: "Ginger+" }] }) };
});

vi.mock("@/features/feed/feedApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/feed/feedApi")>();
  return { ...original, fetchAdminWins: vi.fn().mockResolvedValue([]), importWinsCsv: vi.fn() };
});

describe("AdminWinsPage — неделя из выгрузок", () => {
  it("загружает CSV и показывает, сколько добавлено и что не разобрано", async () => {
    vi.mocked(feedApi.importWinsCsv).mockResolvedValue({
      created: 17,
      duplicates: 1,
      errors: ["строка 6: клуб «Нет такого» не найден"],
    });
    renderWithProviders(<AdminWinsPage />);

    const block = screen.getByTestId("wins-import");
    const input = block.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["won_on,club\n"], "wins-2026-W39.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await within(block).findByRole("status")).toHaveTextContent(
      "Добавлено 17, уже было 1, не разобрано 1.",
    );
    expect(block).toHaveTextContent("строка 6: клуб «Нет такого» не найден");
    expect(feedApi.importWinsCsv).toHaveBeenCalledWith(file, "wins-2026-W39.csv");
  });
});
