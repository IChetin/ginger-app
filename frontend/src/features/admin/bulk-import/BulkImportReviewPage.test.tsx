import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BulkJob, BulkPreview } from "@/api/types/bulkImport";
import { BulkImportReviewPage } from "@/features/admin/bulk-import/BulkImportReviewPage";
import { renderWithProviders } from "@/test/render";

const fetchBulkJob = vi.hoisted(() => vi.fn());
const previewBulkImport = vi.hoisted(() => vi.fn());
const publishBulkImport = vi.hoisted(() => vi.fn());
const fetchAdminDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/features/admin/bulk-import/api", () => ({
  TEMPLATE_URL: "/day2_series_upload.xlsx",
  fetchBulkJobs: vi.fn(),
  uploadBulkJob: vi.fn(),
  fetchBulkJob: (...args: unknown[]) => fetchBulkJob(...args),
  previewBulkImport: (...args: unknown[]) => previewBulkImport(...args),
  publishBulkImport: (...args: unknown[]) => publishBulkImport(...args),
}));

vi.mock("@/features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/admin/api")>("@/features/admin/api");
  return { ...actual, fetchAdminDashboard: (...args: unknown[]) => fetchAdminDashboard(...args) };
});

const job: BulkJob = {
  id: "bulk-1",
  status: "review",
  original_filename: "series.xlsx",
  file_size: 15000,
  file_sha256: "abc",
  draft: {
    kind: "bulk_xlsx",
    issues: [],
    demo_rows_skipped: [3, 4],
    empty_rows_skipped: 1,
    rows_total: 7,
    report: null,
  },
  error: null,
  created_at: "2026-08-22T10:00:00Z",
  published_at: null,
};

const preview: BulkPreview = {
  preview_token: "token-1",
  expires_in_seconds: 300,
  job_id: "bulk-1",
  mark_missing_cancelled: false,
  series: { created: 1, updated: 1, unchanged: 0, missing: 0 },
  events: { created: 2, updated: 1, unchanged: 3, missing: 1 },
  flights: { created: 3, updated: 1, unchanged: 4, missing: 0 },
  plans: [
    {
      import_key: "rpt-sochi-2026-09",
      name: "RPT Sochi",
      action: "update",
      series_id: "series-1",
      diffs: [],
      events: [
        {
          import_key: "me",
          name: "Main Event",
          action: "update",
          diffs: [{ field: "buyin", label: "Бай-ин", old_value: "44000", new_value: "50000" }],
          flights: [
            {
              label: "Day 1A",
              action: "update",
              starts_at_local: "2026-09-10 20:00",
              diffs: [
                {
                  field: "start_at",
                  label: "Старт",
                  old_value: "2026-09-10 18:00",
                  new_value: "2026-09-10 20:00",
                },
              ],
            },
          ],
          recipients: 42,
        },
      ],
      recipients: 42,
      warnings: [],
    },
  ],
  new_references: {
    organizers: ["APC"],
    venues: [
      { name: "Merit Royal", city: "Kyrenia", country_code: "CY", timezone: "Asia/Nicosia" },
    ],
    countries: [],
  },
  impacts: [
    {
      type: "event_time_changed",
      title: "Main Event",
      body: "Старт 18:00 → 20:00",
      url: "/events/1",
      recipient_count: 42,
    },
  ],
  total_recipients: 42,
  issues: [],
  can_publish: true,
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/import/bulk/:jobId" element={<BulkImportReviewPage />} />
    </Routes>,
    { route: "/admin/import/bulk/bulk-1" },
  );
}

describe("BulkImportReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    fetchBulkJob.mockResolvedValue(job);
    previewBulkImport.mockResolvedValue(preview);
    publishBulkImport.mockResolvedValue({
      job_id: "bulk-1",
      report: {
        series_created: 1,
        series_updated: 1,
        events_created: 2,
        events_updated: 1,
        events_cancelled: 0,
        flights_created: 3,
        flights_updated: 1,
        organizers_created: ["APC"],
        venues_created: ["Merit Royal"],
        countries_created: [],
        notifications_enqueued: 42,
        notifications_suppressed: false,
      },
    });
  });

  it("shows the field diff, push count and references to be created", async () => {
    renderPage();

    expect(await screen.findByText("Бай-ин:")).toBeInTheDocument();
    expect(screen.getByText("50000")).toBeInTheDocument();
    expect(screen.getByText("push: 42")).toBeInTheDocument();
    expect(screen.getByText("Push подписчикам")).toBeInTheDocument();
    expect(screen.getByText("Будут созданы")).toBeInTheDocument();
    expect(screen.getByText(/Merit Royal/)).toBeInTheDocument();
  });

  it("publishes with notifications on and missing events untouched by default", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Бай-ин:");
    await waitFor(() => {
      expect(previewBulkImport).toHaveBeenCalledWith("bulk-1", false);
    });

    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => {
      expect(publishBulkImport).toHaveBeenCalledWith("bulk-1", {
        previewToken: "token-1",
        markMissingCancelled: false,
        notify: true,
      });
    });
  });

  it("recounts the preview when missing events are marked as cancelled", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Бай-ин:");
    await user.click(
      screen.getByRole("checkbox", {
        name: /Отметить отсутствующие в файле турниры как отменённые/,
      }),
    );

    await waitFor(() => {
      expect(previewBulkImport).toHaveBeenCalledWith("bulk-1", true);
    });
  });

  it("publishes without push when notifications are switched off", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Бай-ин:");
    await user.click(screen.getByRole("checkbox", { name: /Отправлять уведомления подписчикам/ }));
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => {
      expect(publishBulkImport).toHaveBeenCalledWith(
        "bulk-1",
        expect.objectContaining({ notify: false }),
      );
    });
  });

  it("blocks publishing and shows the cell address for every error", async () => {
    previewBulkImport.mockResolvedValue({
      ...preview,
      can_publish: false,
      issues: [
        {
          severity: "error",
          code: "invalid_timezone",
          message: "Неизвестный часовой пояс",
          row: 12,
          column: "G",
          field: "timezone",
          series_key: "rpt-sochi-2026-09",
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("Неизвестный часовой пояс")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/^G/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  });

  it("shows the report once the job is published", async () => {
    fetchBulkJob.mockResolvedValue({
      ...job,
      status: "published",
      published_at: "2026-08-22T11:00:00Z",
      draft: {
        ...job.draft!,
        report: {
          series_created: 2,
          series_updated: 0,
          events_created: 5,
          events_updated: 0,
          events_cancelled: 1,
          flights_created: 7,
          flights_updated: 0,
          organizers_created: ["APC"],
          venues_created: [],
          countries_created: [],
          notifications_enqueued: 0,
          notifications_suppressed: true,
        },
      },
    });
    renderPage();

    expect(await screen.findByText("Опубликовано")).toBeInTheDocument();
    expect(screen.getByText("создано 2, обновлено 0")).toBeInTheDocument();
    expect(screen.getByText("не отправлялись (галочка была снята)")).toBeInTheDocument();
    expect(previewBulkImport).not.toHaveBeenCalled();
  });
});
