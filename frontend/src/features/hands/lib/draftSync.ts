import { ApiError } from "@/api/client";
import type {
  HandDraftCreatePayload,
  HandDraftUpdatePayload,
  HandPublishPayload,
  HandRead,
} from "@/api/types/hands";
import {
  createHandDraft,
  deleteHand,
  fetchHand,
  patchHandDraft,
  publishHand,
} from "@/features/hands/api";
import {
  deleteLocalDraft,
  enqueueOutbox,
  getLocalDraft,
  getOutbox,
  localDraftFromRead,
  migrateLegacyCurrentDraft,
  putLocalDraft,
  replaceOutbox,
  wizardToPayload,
  type DraftOutboxItem,
  type LocalHandDraft,
} from "@/features/hands/lib/draftIdb";
import { emptyWizard, type WizardState } from "@/features/hands/lib/wizardState";

export type DraftSyncResult =
  | { ok: true }
  | { ok: false; conflict: true; draftId: string; server: HandRead; message: string }
  | { ok: false; conflict: false; code?: string; message: string };

let syncing = false;

function isHandRead(value: unknown): value is HandRead {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; status?: unknown };
  return typeof row.id === "string" && (row.status === "draft" || row.status === "published");
}

async function applyServerDraft(row: HandRead): Promise<LocalHandDraft | null> {
  if (row.status !== "draft") {
    await deleteLocalDraft(row.id);
    return null;
  }
  const mapped = localDraftFromRead(row);
  const existing = await getLocalDraft(row.id);
  if (!mapped) {
    if (existing) {
      await putLocalDraft({
        ...existing,
        createdOnServer: true,
        serverUpdatedAt: row.updated_at ?? existing.serverUpdatedAt,
        conflict: false,
        conflictServer: null,
      });
    }
    return existing;
  }
  await putLocalDraft({
    ...mapped,
    state: existing?.state ?? mapped.state,
    conflict: false,
    conflictServer: null,
  });
  return mapped;
}

async function processItem(item: DraftOutboxItem): Promise<void> {
  switch (item.kind) {
    case "create": {
      const body = item.payload as unknown as HandDraftCreatePayload;
      const row = await createHandDraft({
        id: item.draftId,
        current_step: body.current_step,
        event_id: body.event_id,
        series_id: body.series_id,
        live_session_id: body.live_session_id,
        title: body.title,
        note: body.note,
        wizard: body.wizard,
        slug: body.slug,
      });
      await applyServerDraft(row);
      return;
    }
    case "patch": {
      const body = item.payload as unknown as HandDraftUpdatePayload;
      let row: HandRead;
      try {
        row = await patchHandDraft(item.draftId, body);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) {
          throw error;
        }
        const existing = await getLocalDraft(item.draftId);
        const payload = item.payload as Record<string, unknown>;
        const slug =
          typeof payload.slug === "string" ? payload.slug : (existing?.slug ?? undefined);
        row = await createHandDraft({
          id: item.draftId,
          current_step: body.current_step,
          event_id: body.event_id,
          series_id: body.series_id,
          live_session_id: body.live_session_id,
          title: body.title,
          note: body.note,
          wizard: body.wizard,
          slug,
        });
      }
      const existing = await getLocalDraft(item.draftId);
      const mapped = localDraftFromRead(row);
      if (mapped) {
        await putLocalDraft({
          ...mapped,
          state: existing?.state ?? mapped.state,
          conflict: false,
          conflictServer: null,
        });
      }
      return;
    }
    case "delete": {
      try {
        await deleteHand(item.draftId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          await deleteLocalDraft(item.draftId);
          return;
        }
        throw error;
      }
      await deleteLocalDraft(item.draftId);
      return;
    }
    case "publish": {
      const body = item.payload as unknown as HandPublishPayload;
      await publishHand(item.draftId, body);
      await deleteLocalDraft(item.draftId);
      return;
    }
    default:
      return;
  }
}

export async function syncHandDrafts(): Promise<DraftSyncResult> {
  if (syncing) return { ok: true };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: true };
  }
  await migrateLegacyCurrentDraft();
  syncing = true;
  try {
    let queue = await getOutbox();
    while (queue.length > 0) {
      const item = queue[0];
      try {
        await processItem(item);
        queue = queue.slice(1);
        await replaceOutbox(queue);
      } catch (error) {
        if (error instanceof ApiError && error.code === "draft_conflict") {
          const server = isHandRead(error.server) ? error.server : await fetchHand(item.draftId);
          const existing = await getLocalDraft(item.draftId);
          if (existing) {
            await putLocalDraft({
              ...existing,
              conflict: true,
              conflictServer: server,
              serverUpdatedAt: server.updated_at,
              createdOnServer: true,
            });
          }
          queue = queue.filter((entry) => entry.draftId !== item.draftId);
          await replaceOutbox(queue);
          return {
            ok: false,
            conflict: true,
            draftId: item.draftId,
            server,
            message: error.message,
          };
        }
        if (error instanceof ApiError && error.code === "draft_limit") {
          return { ok: false, conflict: false, code: "draft_limit", message: error.message };
        }
        return {
          ok: false,
          conflict: false,
          code: error instanceof ApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "Sync failed",
        };
      }
    }
    return { ok: true };
  } finally {
    syncing = false;
  }
}

export async function queueDraftSave(
  id: string,
  state: WizardState,
  options?: { slug?: string | null },
): Promise<DraftSyncResult> {
  const existing = await getLocalDraft(id);
  const now = new Date().toISOString();
  const slug = options?.slug ?? existing?.slug ?? null;
  const local: LocalHandDraft = {
    id,
    slug,
    state,
    updatedAt: now,
    serverUpdatedAt: existing?.serverUpdatedAt ?? null,
    createdOnServer: existing?.createdOnServer ?? false,
    conflict: existing?.conflict,
    conflictServer: existing?.conflictServer,
  };
  await putLocalDraft(local);
  const payload = {
    current_step: state.step,
    event_id: state.eventId,
    series_id: state.seriesId,
    live_session_id: state.liveSessionId,
    note: state.note.trim() || null,
    wizard: wizardToPayload(state),
    clear_event: !state.eventId,
    clear_series: !state.seriesId,
    clear_live_session: !state.liveSessionId,
    base_updated_at: local.serverUpdatedAt,
    slug,
  };
  if (!local.createdOnServer) {
    await enqueueOutbox("create", id, { id, ...payload });
  } else {
    await enqueueOutbox("patch", id, payload);
  }
  return syncHandDrafts();
}

export async function queueDraftDelete(id: string): Promise<DraftSyncResult> {
  await enqueueOutbox("delete", id);
  await deleteLocalDraft(id);
  return syncHandDrafts();
}

export async function resolveDraftConflict(
  id: string,
  choice: "local" | "server",
): Promise<WizardState> {
  const existing = await getLocalDraft(id);
  if (!existing) return emptyWizard();
  if (choice === "server") {
    const server = existing.conflictServer;
    const mapped = server ? localDraftFromRead(server) : null;
    if (mapped) {
      await putLocalDraft({ ...mapped, conflict: false, conflictServer: null });
      return mapped.state;
    }
  }
  await putLocalDraft({
    ...existing,
    conflict: false,
    conflictServer: null,
    serverUpdatedAt: existing.conflictServer?.updated_at ?? existing.serverUpdatedAt,
  });
  await queueDraftSave(id, existing.state);
  return existing.state;
}

export function registerHandDraftSyncTriggers(onSynced?: () => void): () => void {
  const run = () => {
    void syncHandDrafts().then(() => onSynced?.());
  };

  window.addEventListener("online", run);
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      run();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "HAND_DRAFT_SYNC") {
      run();
    }
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", onMessage);
    void navigator.serviceWorker.ready.then((reg) => {
      const syncManager = (
        reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }
      ).sync;
      void syncManager?.register("hand-draft-sync").catch(() => undefined);
    });
  }

  run();

  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisibility);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    }
  };
}
