import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { HandRead } from "@/api/types/hands";
import {
  clearHandDraft,
  emptyLocalDraft,
  getOutbox,
  putLocalDraft,
  wizardToPayload,
} from "@/features/hands/lib/draftIdb";
import { queueDraftSave } from "@/features/hands/lib/draftSync";
import { emptyWizard } from "@/features/hands/lib/wizardState";

const createHandDraft = vi.hoisted(() => vi.fn());
const patchHandDraft = vi.hoisted(() => vi.fn());

vi.mock("@/features/hands/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/hands/api")>();
  return {
    ...actual,
    createHandDraft: (...args: unknown[]) => createHandDraft(...args),
    patchHandDraft: (...args: unknown[]) => patchHandDraft(...args),
  };
});

const DRAFT_ID = "1baf6526-e2fc-4ded-b4ac-cc748dd7389b";
const SLUG = "aE7rT8Y5YY";

function draftRead(wizard: Record<string, unknown>): HandRead {
  return {
    id: DRAFT_ID,
    slug: SLUG,
    status: "draft",
    current_step: 1,
    current_street: null,
    title: null,
    note: null,
    is_public: false,
    views_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
    event_id: null,
    series_id: null,
    live_session_id: null,
    event: null,
    series: null,
    author: { nickname: "player" },
    is_owner: true,
    data: null,
    wizard,
  };
}

describe("draftSync", () => {
  beforeEach(async () => {
    createHandDraft.mockReset();
    patchHandDraft.mockReset();
    await clearHandDraft();
  });

  it("recreates the draft when PATCH returns 404", async () => {
    const state = { ...emptyWizard(), names: { 2: "Рег" } };
    await putLocalDraft({
      ...emptyLocalDraft(DRAFT_ID, state, SLUG),
      createdOnServer: true,
      serverUpdatedAt: "2026-01-01T00:00:00Z",
    });
    patchHandDraft.mockRejectedValue(new ApiError(404, "not_found", "Раздача не найдена"));
    createHandDraft.mockResolvedValue(draftRead(wizardToPayload(state)));

    const result = await queueDraftSave(DRAFT_ID, state, { slug: SLUG });

    expect(result).toEqual({ ok: true });
    expect(patchHandDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.objectContaining({ wizard: expect.any(Object) }),
    );
    expect(createHandDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: DRAFT_ID, slug: SLUG }),
    );
    expect(await getOutbox()).toEqual([]);
  });
});
