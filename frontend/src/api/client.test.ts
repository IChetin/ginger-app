import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  buildQuery,
  createBookmark,
  fetchBookmarksOverview,
  fetchNotificationHistory,
  fetchSeriesList,
  migrateBookmarks,
  previewAdminSeries,
  updateCurrentUser,
  withPreviewToken,
} from "@/api/client";
import { updateAdminSeries } from "@/features/admin/api";

describe("buildQuery", () => {
  it("serializes arrays and skips empty values", () => {
    expect(
      buildQuery({
        country_code: "RU",
        zone: "",
        tags: ["main", "bounty"],
        offset: 0,
      }),
    ).toBe("?country_code=RU&tags=main&tags=bounty&offset=0");
  });
});

describe("fetchSeriesList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns json payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }),
      }),
    );

    const payload = await fetchSeriesList({ country_code: "RU" });
    expect(payload.total).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
  });

  it("maps api error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: "not_found", message: "Series not found" } }),
      }),
    );

    await expect(fetchSeriesList()).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 404,
        code: "not_found",
        message: "Series not found",
      } satisfies Partial<ApiError>),
    );
  });
});

describe("updateCurrentUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends PATCH with credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "user-1",
            email: "pro@example.com",
            phone: null,
            nickname: "pro",
            base_currency: "USD",
            timezone: null,
            schedule_view: "cards",
            role: "user",
            default_reminder_offsets: [1440, 120],
            email_verified: true,
            has_password: false,
            created_at: "2026-01-01T00:00:00Z",
          }),
      }),
    );

    const user = await updateCurrentUser({
      nickname: "pro",
      base_currency: "USD",
    });

    expect(user.nickname).toBe("pro");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/me");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      nickname: "pro",
      base_currency: "USD",
    });
  });
});

describe("bookmark client methods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates bookmark via POST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: "bookmark-1",
            target_type: "flight",
            target_id: "flight-1",
            reminder_offsets: [1440],
            created_at: "2026-01-01T00:00:00Z",
          }),
      }),
    );

    const bookmark = await createBookmark({
      target_type: "flight",
      target_id: "flight-1",
      reminder_offsets: [1440],
    });

    expect(bookmark.id).toBe("bookmark-1");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/bookmarks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      target_type: "flight",
      target_id: "flight-1",
      reminder_offsets: [1440],
    });
  });

  it("migrates guest bookmarks via POST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            created: 1,
            skipped: 0,
            items: [],
          }),
      }),
    );

    const response = await migrateBookmarks({
      items: [{ target_type: "series", target_id: "series-1", reminder_offsets: [] }],
    });

    expect(response.created).toBe(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/bookmarks/migrate");
    expect(init.method).toBe("POST");
  });

  it("fetches bookmarks overview and notification history", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        }),
    );

    await expect(fetchBookmarksOverview()).resolves.toEqual([]);
    await expect(fetchNotificationHistory(30)).resolves.toEqual([]);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/bookmarks/overview");
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe("/api/v1/notifications/history?days=30");
  });
});

describe("admin preview helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets X-Preview-Token header", () => {
    const headers = withPreviewToken(undefined, "token-abc");
    expect(headers.get("X-Preview-Token")).toBe("token-abc");
    expect(headers.get("X-Notify")).toBeNull();
  });

  it("sets X-Notify header when notify is provided", () => {
    expect(withPreviewToken(undefined, "token-abc", true).get("X-Notify")).toBe("1");
    expect(withPreviewToken(undefined, "token-abc", false).get("X-Notify")).toBe("0");
  });

  it("posts series preview and patches with preview token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              preview_token: "token-1",
              expires_in_seconds: 300,
              entity_type: "series",
              entity_id: "series-1",
              diffs: [],
              impacts: [],
              total_recipients: 0,
              requires_confirmation: false,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: "series-1",
              organizer_id: "org-1",
              venue_id: "venue-1",
              name: "Demo",
              starts_on: "2026-08-01",
              ends_on: "2026-08-05",
              poster_url: null,
              description: null,
              status: "announced",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: "series-1",
              organizer_id: "org-1",
              venue_id: "venue-1",
              name: "Demo",
              starts_on: "2026-08-01",
              ends_on: "2026-08-05",
              poster_url: null,
              description: null,
              status: "announced",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
        }),
    );

    const preview = await previewAdminSeries("series-1", { name: "Demo" });
    expect(preview.preview_token).toBe("token-1");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/admin/series/series-1/preview");

    await updateAdminSeries("series-1", { name: "Demo" }, "token-1");
    const [, init] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Preview-Token")).toBe("token-1");

    await updateAdminSeries("series-1", { name: "Demo" }, "token-1", false);
    const [, initNotify] = vi.mocked(fetch).mock.calls[2] as [string, RequestInit];
    expect(new Headers(initNotify.headers).get("X-Notify")).toBe("0");
  });
});
