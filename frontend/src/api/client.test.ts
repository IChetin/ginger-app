import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, buildQuery, fetchCurrentUser, updateCurrentUser } from "@/api/client";

describe("buildQuery", () => {
  it("serializes arrays and skips empty values", () => {
    expect(
      buildQuery({
        club: "nuts",
        search: "",
        tags: ["main", "bounty"],
        offset: 0,
      }),
    ).toBe("?club=nuts&tags=main&tags=bounty&offset=0");
  });
});

const userPayload = {
  id: "user-1",
  email: "pro@example.com",
  phone: null,
  nickname: "pro",
  schedule_view: "cards",
  role: "user",
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("fetchCurrentUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns json payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(userPayload),
      }),
    );

    const user = await fetchCurrentUser();
    expect(user.nickname).toBe("pro");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/me");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
  });

  it("maps api error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "unauthorized", message: "Not authenticated" } }),
      }),
    );

    await expect(fetchCurrentUser()).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 401,
        code: "unauthorized",
        message: "Not authenticated",
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
        text: async () => JSON.stringify({ ...userPayload, schedule_view: "table" }),
      }),
    );

    const user = await updateCurrentUser({
      nickname: "pro",
      schedule_view: "table",
    });

    expect(user.schedule_view).toBe("table");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/me");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      nickname: "pro",
      schedule_view: "table",
    });
  });
});
