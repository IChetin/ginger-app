import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearHandDraft,
  coalesceDraftOutbox,
  describeDraftLoss,
  DRAFT_STALE_MS,
  draftHasProgress,
  emptyLocalDraft,
  formatDraftSummary,
  formatDraftUpdatedAt,
  getLocalDraft,
  getLocalDraftBySlug,
  isDraftStale,
  listLocalDrafts,
  loadLegacyCurrentDraft,
  migrateLegacyCurrentDraft,
  putLocalDraft,
} from "@/features/hands/lib/draftIdb";
import { emptyTableInput, tableToWizard } from "@/features/hands/lib/tableInputState";
import { emptyWizard, type WizardState } from "@/features/hands/lib/wizardState";

function step3Draft(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    tableSize: 6,
    occupied: [1, 2, 3, 4, 5, 6],
    heroCards: ["As", "Kd"],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: Array.from({ length: 8 }, (_, index) => ({
          seat: (index % 6) + 1,
          action: "fold" as const,
        })),
      },
    ],
    ...overrides,
  };
}

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";

describe("hand draft IndexedDB", () => {
  beforeEach(async () => {
    await clearHandDraft();
  });

  it("stores drafts by id and overwrites the same id", async () => {
    await putLocalDraft(emptyLocalDraft(DRAFT_ID, step3Draft()));
    await putLocalDraft(emptyLocalDraft(DRAFT_ID, step3Draft({ step: 4, furthestStep: 4 })));
    const loaded = await getLocalDraft(DRAFT_ID);
    expect(loaded?.state.step).toBe(4);
    expect(loaded?.updatedAt).toEqual(expect.any(String));
    expect(await listLocalDrafts()).toHaveLength(1);
  });

  it("reads the legacy unwrapped WizardState format", async () => {
    const state = step3Draft();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("day2-hand-draft", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("draft")) {
          request.result.createObjectStore("draft");
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("draft", "readwrite");
      tx.objectStore("draft").put(state, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const loaded = await loadLegacyCurrentDraft();
    expect(loaded?.state.step).toBe(3);
    expect(loaded?.state.heroCards).toEqual(["As", "Kd"]);
  });

  it("migrates a legacy current draft into the new store", async () => {
    const state = step3Draft();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("day2-hand-draft", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("draft")) {
          request.result.createObjectStore("draft");
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("draft", "readwrite");
      tx.objectStore("draft").put({ state, updatedAt: "2026-08-19T12:00:00.000Z" }, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const id = await migrateLegacyCurrentDraft();
    expect(id).toEqual(expect.any(String));
    const moved = await getLocalDraft(id!);
    expect(moved?.state.heroCards).toEqual(["As", "Kd"]);
    expect(await migrateLegacyCurrentDraft()).toBeNull();
  });

  it("finds a local draft by slug", async () => {
    await putLocalDraft(emptyLocalDraft(DRAFT_ID, step3Draft(), "dR4ftSlugA"));
    const found = await getLocalDraftBySlug("dR4ftSlugA");
    expect(found?.id).toBe(DRAFT_ID);
    expect(await getLocalDraftBySlug("missingxxx")).toBeNull();
  });

  it("treats an empty wizard as no progress", () => {
    expect(draftHasProgress(emptyWizard())).toBe(false);
    expect(draftHasProgress(tableToWizard(emptyTableInput()))).toBe(false);
    expect(draftHasProgress(step3Draft())).toBe(true);
    expect(draftHasProgress({ ...emptyWizard(), names: { 2: "Рег из Минска" } })).toBe(true);
    expect(draftHasProgress({ ...emptyWizard(), heroCards: ["As", "Kd"] })).toBe(true);
  });

  it("marks drafts older than 7 days as stale", () => {
    const now = Date.parse("2026-08-19T12:00:00.000Z");
    expect(isDraftStale(new Date(now - DRAFT_STALE_MS + 1).toISOString(), now)).toBe(false);
    expect(isDraftStale(new Date(now - DRAFT_STALE_MS).toISOString(), now)).toBe(true);
  });

  it("formats the resume summary", () => {
    const now = new Date(2026, 7, 19, 15, 0, 0);
    const yesterday = new Date(2026, 7, 18, 22, 14, 0);
    expect(formatDraftUpdatedAt(yesterday.toISOString(), now)).toBe("вчера в 22:14");
    expect(
      formatDraftSummary({ state: step3Draft(), updatedAt: yesterday.toISOString() }, now),
    ).toBe("Шаг 3 · префлоп · 6 игроков · вчера в 22:14");
  });

  it("describes how much will be lost", () => {
    expect(describeDraftLoss(step3Draft())).toBe("Введено 8 действий. Черновик будет удалён.");
    expect(describeDraftLoss({ ...emptyWizard(), heroCards: ["As", "Kd"] })).toBe(
      "Выбраны карты героя. Черновик будет удалён.",
    );
  });

  it("folds a patch into a pending create and drops create+delete", () => {
    const create = {
      seq: 1,
      kind: "create" as const,
      draftId: DRAFT_ID,
      payload: { id: DRAFT_ID, current_step: 1 },
      created_at: "t",
    };
    const patched = coalesceDraftOutbox([create], {
      seq: 2,
      kind: "patch",
      draftId: DRAFT_ID,
      payload: { current_step: 3 },
      created_at: "t",
    });
    expect(patched).toHaveLength(1);
    expect(patched[0]?.kind).toBe("create");
    expect(patched[0]?.payload).toMatchObject({ id: DRAFT_ID, current_step: 3 });

    expect(
      coalesceDraftOutbox(patched, {
        seq: 3,
        kind: "delete",
        draftId: DRAFT_ID,
        payload: {},
        created_at: "t",
      }),
    ).toEqual([]);
  });
});
