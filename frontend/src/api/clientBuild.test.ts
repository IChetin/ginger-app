import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiGet } from "@/api/client";
import { forceClientUpdate } from "@/lib/forceUpdate";

vi.mock("@/lib/forceUpdate", () => ({ forceClientUpdate: vi.fn() }));

describe("устаревшая сборка клиента", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("на 426 client_outdated запускает обновление приложения", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: "client_outdated", message: "Приложение обновилось" },
            }),
            { status: 426, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );
    await expect(apiGet("/api/v1/clubs")).rejects.toBeInstanceOf(ApiError);
    expect(forceClientUpdate).toHaveBeenCalledTimes(1);
  });
});
