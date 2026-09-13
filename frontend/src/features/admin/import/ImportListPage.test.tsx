import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import type { UserMe } from "@/api/types/auth";
import { ImportListPage } from "@/features/admin/import/ImportListPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchAdminSeries = vi.hoisted(() => vi.fn());
const fetchAdminOrganizers = vi.hoisted(() => vi.fn());
const fetchAdminVenues = vi.hoisted(() => vi.fn());
const fetchAdminParsers = vi.hoisted(() => vi.fn());
const fetchImportJobs = vi.hoisted(() => vi.fn());
const fetchImportStats = vi.hoisted(() => vi.fn());
const uploadImportJob = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/admin/api")>("@/features/admin/api");
  return {
    ...actual,
    fetchAdminSeries: (...args: unknown[]) => fetchAdminSeries(...args),
    fetchAdminOrganizers: (...args: unknown[]) => fetchAdminOrganizers(...args),
    fetchAdminVenues: (...args: unknown[]) => fetchAdminVenues(...args),
    fetchAdminParsers: (...args: unknown[]) => fetchAdminParsers(...args),
  };
});

vi.mock("@/features/admin/import/api", () => ({
  fetchImportJobs: (...args: unknown[]) => fetchImportJobs(...args),
  fetchImportStats: (...args: unknown[]) => fetchImportStats(...args),
  uploadImportJob: (...args: unknown[]) => uploadImportJob(...args),
}));

const userFixture: UserMe = {
  id: "user-1",
  email: "editor@example.com",
  phone: null,
  nickname: "editor",
  base_currency: "RUB",
  timezone: null,
  schedule_view: "cards",
  role: "editor",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

const emptySeries = {
  id: "series-1",
  slug: "rpt-demo",
  organizer_id: "org-1",
  venue_id: "venue-1",
  name: "Empty Series",
  starts_on: "2026-08-01",
  ends_on: "2026-08-07",
  status: "announced",
  poster_url: null,
  links: {},
  description: null,
  organizer: { id: "org-1", name: "RPT", slug: "rpt", logo_url: null },
  venue: {
    id: "venue-1",
    name: "KP",
    city: "Sochi",
    country_code: "RU",
    zone: null,
    timezone: "Europe/Moscow",
    address: null,
  },
  country: { code: "RU", name_ru: "Россия" },
  events_count: 0,
  bookmarks_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const filledSeries = {
  ...emptySeries,
  id: "series-2",
  name: "Filled Series",
  status: "schedule_published",
  events_count: 3,
};

describe("ImportListPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchAdminSeries.mockResolvedValue({
      items: [emptySeries, filledSeries],
      total: 2,
      limit: 100,
      offset: 0,
    });
    fetchAdminOrganizers.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    fetchAdminVenues.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    fetchAdminParsers.mockResolvedValue([
      {
        name: "apc_xlsx_v1",
        kind: "schedule",
        organizer_slugs: ["apc"],
        supported_types: ["xlsx"],
        description: "APC XLSX",
      },
      {
        name: "bpt_pdf_v1",
        kind: "schedule",
        organizer_slugs: ["bpt"],
        supported_types: ["pdf", "image"],
        description: "BPT PDF",
      },
      {
        name: "rpt_structure_pdf_v1",
        kind: "structures",
        organizer_slugs: ["rpt"],
        supported_types: ["pdf"],
        description: "RPT structures",
      },
    ]);
    fetchImportJobs.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    fetchImportStats.mockResolvedValue({
      total: 0,
      by_status: {},
      by_parse_path: {},
      by_parser: {},
      success_rate: null,
      avg_confidence: null,
      tokens_input: 0,
      tokens_output: 0,
      estimated_cost_usd: "0",
      avg_correction_ratio: null,
    });
    uploadImportJob.mockResolvedValue({ id: "job-1", status: "review", import_kind: "schedule" });
  });

  it("uploads file with preset series_id and navigates to review", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/admin/import" element={<ImportListPage />} />
        <Route path="/admin/import/:jobId" element={<div>Review job-1</div>} />
      </Routes>,
      { route: "/admin/import?series_id=series-1" },
    );

    expect(await screen.findByText("Импорт расписания")).toBeInTheDocument();
    const fileInput = document.querySelector("#import-file") as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["a,b\n1,2\n"], "schedule.csv", { type: "text/csv" });
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Загрузить и разобрать" }));

    await waitFor(() => {
      expect(uploadImportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          seriesId: "series-1",
          file,
          importKind: "schedule",
        }),
      );
    });
    expect(await screen.findByText("Review job-1")).toBeInTheDocument();
  });

  it("uploads structures import with import_kind from query", async () => {
    const user = userEvent.setup();
    uploadImportJob.mockResolvedValue({
      id: "job-2",
      status: "review",
      import_kind: "structures",
    });
    renderWithProviders(
      <Routes>
        <Route path="/admin/import" element={<ImportListPage />} />
        <Route path="/admin/import/:jobId" element={<div>Review job-2</div>} />
      </Routes>,
      { route: "/admin/import?series_id=series-2&import_kind=structures" },
    );

    expect(await screen.findByText("Импорт структур")).toBeInTheDocument();
    const fileInput = document.querySelector("#import-file") as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["%PDF"], "structure.pdf", { type: "application/pdf" });
    await user.upload(fileInput, file);
    const seriesSelect = screen.getByRole("combobox", { name: /Серия/i });
    await waitFor(() => {
      expect(seriesSelect).toHaveValue("series-2");
    });
    await user.click(screen.getByRole("button", { name: "Загрузить и разобрать" }));

    await waitFor(() => {
      expect(uploadImportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          seriesId: "series-2",
          file,
          importKind: "structures",
        }),
      );
    });
    expect(await screen.findByText("Review job-2")).toBeInTheDocument();
  });
});
