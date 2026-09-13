import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminClub, TemplateAdmin, TemplatesImportResult } from "@/features/admin/clubs/api";
import { formatTemplateDays } from "@/features/admin/clubs/format";
import { AdminGridImportPage } from "@/pages/admin/AdminGridImportPage";
import { renderWithProviders } from "@/test/render";

const fetchAdminClubs = vi.fn();
const fetchClubTemplates = vi.fn();
const importClubTemplates = vi.fn();

vi.mock("@/features/admin/clubs/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/admin/clubs/api")>(
    "@/features/admin/clubs/api",
  );
  return {
    ...actual,
    fetchAdminClubs: () => fetchAdminClubs(),
    fetchClubTemplates: (id: string) => fetchClubTemplates(id),
    importClubTemplates: (id: string, file: File, dryRun: boolean) =>
      importClubTemplates(id, file, dryRun),
  };
});

const club: AdminClub = {
  id: "c21",
  name: "Ginger21",
  slug: "ginger21",
  app: "poker21",
  organizer_name: "Poker21",
  chip_value: "1.0000",
  chip_currency_code: "RUB",
  is_visible: true,
  templates_count: 20,
};

function result(overrides: Partial<TemplatesImportResult>): TemplatesImportResult {
  return {
    dry_run: true,
    rows_total: 20,
    templates_parsed: 19,
    issues: [{ row: 5, message: "BAD: не разобрано время" }],
    templates_created: 2,
    templates_updated: 0,
    templates_unchanged: 17,
    templates_removed: 1,
    tournaments_created: 14,
    tournaments_updated: 3,
    tournaments_deleted: 7,
    tournaments_detached_kept: 0,
    ...overrides,
  };
}

function template(overrides: Partial<TemplateAdmin>): TemplateAdmin {
  return {
    id: "t",
    name: "X",
    bounty_kind: "none",
    buyin: "500",
    guarantee: null,
    ticket_value: null,
    satellite_target: null,
    weekdays: [1],
    start_time: "18:00:00",
    valid_from: null,
    valid_until: null,
    month_week: null,
    source: "manual-csv",
    is_active: true,
    ...overrides,
  };
}

describe("AdminGridImportPage", () => {
  beforeEach(() => {
    fetchAdminClubs.mockResolvedValue([club]);
    fetchClubTemplates.mockResolvedValue([]);
    importClubTemplates.mockReset();
  });

  it("проверка файла, потом применение", async () => {
    importClubTemplates
      .mockResolvedValueOnce(result({}))
      .mockResolvedValueOnce(result({ dry_run: false, issues: [] }));
    renderWithProviders(<AdminGridImportPage />);

    const apply = await screen.findByRole("button", { name: "Применить" });
    expect(apply).toBeDisabled();

    const file = new File(["days,time,name,buyin\n"], "p21.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("Файл сетки"), file);
    await userEvent.click(screen.getByRole("button", { name: "Проверить" }));

    expect(await screen.findByText(/Предпросмотр/)).toBeInTheDocument();
    expect(screen.getByText("Строка 5: BAD: не разобрано время")).toBeInTheDocument();
    expect(importClubTemplates).toHaveBeenLastCalledWith("c21", file, true);

    await userEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(importClubTemplates).toHaveBeenLastCalledWith("c21", file, false));
    expect(await screen.findByText("Сетка применена")).toBeInTheDocument();
  });

  it("дни шаблона по-человечески", () => {
    expect(formatTemplateDays(template({ weekdays: [1, 2, 3, 4, 5, 6, 7] }))).toBe("ежедневно");
    expect(formatTemplateDays(template({ weekdays: [3, 6] }))).toBe("ср, сб");
    expect(formatTemplateDays(template({ weekdays: [7], month_week: -1 }))).toBe("последнее вс");
    expect(formatTemplateDays(template({ weekdays: [7], month_week: 2 }))).toBe("2-е вс");
    expect(
      formatTemplateDays(template({ valid_from: "2026-09-25", valid_until: "2026-09-25" })),
    ).toBe("25.09");
  });
});
