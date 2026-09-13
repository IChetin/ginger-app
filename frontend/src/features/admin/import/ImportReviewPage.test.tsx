import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import type { UserMe } from "@/api/types/auth";
import type { ImportJob, ImportPublishPreview } from "@/api/types/imports";
import { ImportReviewPage } from "@/features/admin/import/ImportReviewPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchImportJob = vi.hoisted(() => vi.fn());
const updateImportDraft = vi.hoisted(() => vi.fn());
const previewImportPublish = vi.hoisted(() => vi.fn());
const publishImportJob = vi.hoisted(() => vi.fn());
const fetchAdminSeriesEvents = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/admin/import/api", () => ({
  fetchImportJob: (...args: unknown[]) => fetchImportJob(...args),
  updateImportDraft: (...args: unknown[]) => updateImportDraft(...args),
  previewImportPublish: (...args: unknown[]) => previewImportPublish(...args),
  publishImportJob: (...args: unknown[]) => publishImportJob(...args),
}));

vi.mock("@/features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/admin/api")>("@/features/admin/api");
  return {
    ...actual,
    fetchAdminSeriesEvents: (...args: unknown[]) => fetchAdminSeriesEvents(...args),
  };
});

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

function reviewJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    status: "review",
    import_kind: "schedule",
    original_filename: "schedule.csv",
    content_type: "text/csv",
    file_size: 12,
    file_sha256: "abc",
    detected_type: "csv",
    organizer_id: "org-1",
    series_id: "series-1",
    file_timezone: null,
    parser_requested: null,
    parser_used: "mock_ai",
    parse_path: "ai",
    parser_mismatch_reason: null,
    confidence: "0.91",
    tokens_input: 0,
    tokens_output: 0,
    estimated_cost_usd: "0",
    fields_total: 4,
    fields_corrected: 1,
    draft: {
      kind: "schedule",
      confidence: "0.91",
      unparsed_rows: [],
      issues: [{ field: "events.0.buyin", severity: "warning", message: "Low confidence" }],
      events: [
        {
          number: 1,
          name: "Main Event",
          buyin: "10000",
          currency_code: "RUB",
          flights: [{ play_date: "2026-08-02", play_time: "14:00" }],
          issues: [{ field: "buyin", severity: "warning", message: "Low confidence" }],
          field_confidence: { buyin: "0.5" },
        },
      ],
    },
    error: null,
    created_at: "2026-07-19T00:00:00Z",
    published_at: null,
    ...overrides,
  };
}

function structuresJob(): ImportJob {
  return reviewJob({
    import_kind: "structures",
    original_filename: "structure.pdf",
    detected_type: "pdf",
    draft: {
      kind: "structures",
      confidence: "0.88",
      issues: [],
      structures: [
        {
          source_title: "Main Event Structure",
          parsed_buyin: "0",
          parsed_start_stack: 30000,
          parsed_late_reg_level: 8,
          notes: null,
          structure_sets: [
            {
              label: "default",
              levels: [
                {
                  level_no: 1,
                  sb: 100,
                  bb: 200,
                  ante: 200,
                  minutes: 20,
                  is_break: false,
                  is_late_reg_end: false,
                },
                {
                  level_no: 2,
                  sb: 200,
                  bb: 400,
                  ante: 400,
                  minutes: 20,
                  is_break: false,
                  is_late_reg_end: true,
                },
              ],
            },
            {
              label: "turbo",
              levels: [
                {
                  level_no: 1,
                  sb: 100,
                  bb: 200,
                  ante: 0,
                  minutes: 10,
                  is_break: false,
                  is_late_reg_end: false,
                },
              ],
            },
          ],
          matched_event_id: "event-1",
          match_confidence: "0.95",
          selected: true,
          is_shared_satellites: true,
          shared_event_ids: ["event-2"],
          issues: [],
          source_page: 1,
        },
      ],
    },
  });
}

const previewFixture: ImportPublishPreview = {
  preview_token: "token-1",
  expires_in_seconds: 300,
  entity_type: "import",
  entity_id: "job-1",
  series_id: "series-1",
  diffs: [{ field: "status", old_value: "announced", new_value: "schedule_published" }],
  impacts: [
    {
      type: "schedule_published",
      title: "Расписание опубликовано",
      body: "Empty Series",
      url: "/series/rpt-demo",
      recipient_count: 2,
    },
  ],
  total_recipients: 2,
  requires_confirmation: true,
  events_to_create: 1,
  structures_to_apply: 0,
};

describe("ImportReviewPage", () => {
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
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchImportJob.mockResolvedValue(reviewJob());
    updateImportDraft.mockResolvedValue(reviewJob());
    previewImportPublish.mockResolvedValue(previewFixture);
    publishImportJob.mockResolvedValue({
      import_job_id: "job-1",
      series_id: "series-1",
      events_created: 1,
      structures_applied: 0,
    });
    fetchAdminSeriesEvents.mockResolvedValue([
      {
        id: "event-1",
        slug: "1-main-event",
        series_id: "series-1",
        number: 1,
        name: "Main Event",
        buyin: "10000",
        currency_code: "RUB",
        currency: { code: "RUB", symbol: "₽", name_ru: "Рубль" },
        guarantee: null,
        game_type: "nlh",
        tags: [],
        start_stack: 30000,
        reentry_count: null,
        reentry_unlimited: false,
        late_reg_level: 8,
        status: "scheduled",
        notes: null,
        flights: [],
        blind_levels: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "event-2",
        slug: "2-satellite",
        series_id: "series-1",
        number: 2,
        name: "Satellite",
        buyin: "1000",
        currency_code: "RUB",
        currency: { code: "RUB", symbol: "₽", name_ru: "Рубль" },
        guarantee: null,
        game_type: "nlh",
        tags: [],
        start_stack: 10000,
        reentry_count: null,
        reentry_unlimited: false,
        late_reg_level: 6,
        status: "scheduled",
        notes: null,
        flights: [],
        blind_levels: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("highlights low-confidence fields and saves corrections", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/admin/import/:jobId" element={<ImportReviewPage />} />
      </Routes>,
      { route: "/admin/import/job-1" },
    );

    expect(await screen.findByText("schedule.csv")).toBeInTheDocument();
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
    const buyin = screen.getByDisplayValue("10000");
    expect(buyin.className).toMatch(/border-warn/);

    await user.clear(buyin);
    await user.type(buyin, "15000");
    await user.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    await waitFor(() => {
      expect(updateImportDraft).toHaveBeenCalled();
    });
    const payload = updateImportDraft.mock.calls[0]?.[1] as {
      kind: string;
      events: { buyin: string }[];
    };
    expect(payload.kind).toBe("schedule");
    expect(payload.events[0]?.buyin).toBe("15000");
  });

  it("shows freeroll warning for zero buy-in", async () => {
    fetchImportJob.mockResolvedValue(
      reviewJob({
        draft: {
          kind: "schedule",
          confidence: "0.9",
          unparsed_rows: [],
          issues: [],
          events: [
            {
              number: 1,
              name: "Freeroll",
              buyin: "0",
              currency_code: "RUB",
              flights: [{ play_date: "2026-08-02", play_time: "12:00" }],
            },
          ],
        },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin/import/:jobId" element={<ImportReviewPage />} />
      </Routes>,
      { route: "/admin/import/job-1" },
    );

    expect(await screen.findByText(/Freeroll: buy-in = 0/)).toBeInTheDocument();
  });

  it("shows failed state without binary payload", async () => {
    fetchImportJob.mockResolvedValue(
      reviewJob({
        status: "failed",
        error: "ai_unavailable: no parser matched",
        draft: null,
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin/import/:jobId" element={<ImportReviewPage />} />
      </Routes>,
      { route: "/admin/import/job-1" },
    );

    expect(await screen.findByText(/ai_unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/file_data|BYTEA|\\x/i)).not.toBeInTheDocument();
  });

  it("runs publish preview and confirms with token", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/admin/import/:jobId" element={<ImportReviewPage />} />
        <Route path="/admin/series/:seriesId" element={<div>Series published</div>} />
      </Routes>,
      { route: "/admin/import/job-1" },
    );

    await screen.findByText("schedule.csv");
    await user.click(screen.getByRole("button", { name: "Превью публикации" }));

    expect(await screen.findByText("Подтверждение рассылки")).toBeInTheDocument();
    expect(screen.getByText(/Получателей:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    await waitFor(() => {
      expect(publishImportJob).toHaveBeenCalledWith("job-1", "token-1");
    });
    expect(await screen.findByText("Series published")).toBeInTheDocument();
  });

  it("reviews structures draft, saves mapping and confirms publish", async () => {
    const user = userEvent.setup();
    const job = structuresJob();
    fetchImportJob.mockResolvedValue(job);
    updateImportDraft.mockResolvedValue(job);
    previewImportPublish.mockResolvedValue({
      ...previewFixture,
      import_kind: "structures",
      events_to_create: 0,
      structures_to_apply: 1,
    });
    publishImportJob.mockResolvedValue({
      import_job_id: "job-1",
      series_id: "series-1",
      events_created: 0,
      structures_applied: 1,
    });

    renderWithProviders(
      <Routes>
        <Route path="/admin/import/:jobId" element={<ImportReviewPage />} />
        <Route path="/admin/series/:seriesId" element={<div>Series structures</div>} />
      </Routes>,
      { route: "/admin/import/job-1" },
    );

    expect(await screen.findByText("structure.pdf")).toBeInTheDocument();
    expect(screen.getByText("Main Event Structure")).toBeInTheDocument();
    expect(screen.getByText(/Freeroll:/)).toBeInTheDocument();
    expect(await screen.findByText("Доп. события (shared)")).toBeInTheDocument();
    expect(screen.getByText("late reg end")).toBeInTheDocument();

    updateImportDraft.mockClear();
    await user.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await waitFor(() => {
      expect(updateImportDraft).toHaveBeenCalled();
    });
    const saveCall = updateImportDraft.mock.calls.at(-1);
    const payload = (saveCall?.[1] ?? saveCall?.[0]) as {
      kind: string;
      structures: {
        selected: boolean;
        is_shared_satellites: boolean;
        shared_event_ids: string[];
        matched_event_id: string | null;
      }[];
    };
    expect(payload.kind).toBe("structures");
    expect(payload.structures[0]?.selected).toBe(true);
    expect(payload.structures[0]?.is_shared_satellites).toBe(true);
    expect(payload.structures[0]?.matched_event_id).toBe("event-1");
    expect(payload.structures[0]?.shared_event_ids).toEqual(["event-2"]);

    await user.click(screen.getByRole("button", { name: "Превью публикации" }));
    expect(await screen.findByText("Подтверждение рассылки")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    await waitFor(() => {
      expect(publishImportJob).toHaveBeenCalledWith("job-1", "token-1");
    });
    expect(await screen.findByText("Series structures")).toBeInTheDocument();
  });
});
