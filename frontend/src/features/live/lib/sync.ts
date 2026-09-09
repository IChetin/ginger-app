import { ApiError } from "@/api/client";
import type {
  LiveEventCreateItem,
  LiveSessionCreatePayload,
  LiveSessionFinishPayload,
  LiveSessionRead,
} from "@/api/types/live";
import {
  cancelLiveSession,
  createLiveSession,
  deleteLiveEvent,
  fetchActiveLiveSession,
  finishLiveSession,
  patchLiveEvent,
  postLiveEvents,
} from "@/features/live/api";
import {
  clearLocalSession,
  clearOutbox,
  getLocalActiveSession,
  getOutbox,
  putLocalSession,
  replaceOutbox,
  type LocalLiveSession,
  type OutboxItem,
  visibleEvents,
} from "@/features/live/lib/liveIdb";

export type SyncResult =
  | { ok: true; session: LocalLiveSession | null }
  | { ok: false; conflict: true; message: string }
  | { ok: false; conflict: false; message: string; resultId?: string };

let syncing = false;

function toLocal(session: LiveSessionRead, conflict = false): LocalLiveSession {
  return {
    ...session,
    events: session.events.map((item) => ({ ...item, deleted_at: null })),
    conflict,
  };
}

/** Keep local events that are not on the server yet (pending outbox sync). */
export function mergeServerSession(
  server: LiveSessionRead,
  existing: LocalLiveSession | null,
  conflict = false,
): LocalLiveSession {
  const base = toLocal(server, conflict);
  if (!existing || existing.id !== server.id) {
    return base;
  }
  const serverIds = new Set(base.events.map((item) => item.id));
  const serverHasEntry = base.events.some((item) => item.type === "entry");
  const pending = existing.events.filter((item) => {
    if (serverIds.has(item.id) || item.deleted_at != null) return false;
    // Server creates the initial entry; drop the offline placeholder with another id.
    if (item.type === "entry" && serverHasEntry) return false;
    return true;
  });
  if (pending.length === 0) {
    return base;
  }
  return { ...base, events: [...base.events, ...pending] };
}

async function applyServerSession(session: LiveSessionRead): Promise<LocalLiveSession> {
  if (session.status === "active") {
    const existing = await getLocalActiveSession();
    const local = mergeServerSession(session, existing);
    await putLocalSession(local);
    return local;
  }
  await clearLocalSession();
  return toLocal(session);
}

export async function syncLiveOutbox(): Promise<SyncResult> {
  if (syncing) {
    return { ok: true, session: await getLocalActiveSession() };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: true, session: await getLocalActiveSession() };
  }

  syncing = true;
  try {
    let queue = await getOutbox();
    while (queue.length > 0) {
      const item = queue[0];
      try {
        await processOutboxItem(item);
        queue = queue.slice(1);
        await replaceOutbox(queue);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          if (error.resultId) {
            await clearLocalSession();
            await clearOutbox();
            return {
              ok: false,
              conflict: false,
              message: error.message,
              resultId: error.resultId,
            };
          }
          // Stale ops against an already-closed session (events/finish/cancel):
          // drop them and keep syncing so a fresh create_session can run.
          if (item.kind !== "create_session") {
            queue = queue.slice(1);
            await replaceOutbox(queue);
            continue;
          }
          const local = await getLocalActiveSession();
          if (local) {
            await putLocalSession({ ...local, conflict: true });
          }
          return {
            ok: false,
            conflict: true,
            message: "Сессия уже закрыта на сервере. События остались на устройстве",
          };
        }
        return {
          ok: false,
          conflict: false,
          message: error instanceof Error ? error.message : "Sync failed",
        };
      }
    }
    return { ok: true, session: await getLocalActiveSession() };
  } finally {
    syncing = false;
  }
}

async function processOutboxItem(item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case "create_session": {
      try {
        const session = await createLiveSession(
          item.payload as unknown as LiveSessionCreatePayload,
        );
        await applyServerSession(session);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          if (error.resultId) {
            throw error;
          }
          if (error.activeSessionId) {
            const remote = await fetchActiveLiveSession();
            await applyServerSession(remote);
            return;
          }
        }
        throw error;
      }
      return;
    }
    case "create_events": {
      const sessionId = String(item.payload.session_id);
      const events = item.payload.events as LiveEventCreateItem[];
      const session = await postLiveEvents(sessionId, events);
      await applyServerSession(session);
      return;
    }
    case "patch_event": {
      const id = String(item.payload.id);
      const { id: _id, ...body } = item.payload;
      const session = await patchLiveEvent(id, body);
      await applyServerSession(session);
      return;
    }
    case "delete_event": {
      const session = await deleteLiveEvent(String(item.payload.id));
      await applyServerSession(session);
      return;
    }
    case "finish": {
      const sessionId = String(item.payload.session_id);
      const body = item.payload.body as LiveSessionFinishPayload;
      const session = await finishLiveSession(sessionId, body);
      await applyServerSession(session);
      await clearOutbox();
      return;
    }
    case "cancel": {
      const session = await cancelLiveSession(String(item.payload.session_id));
      await applyServerSession(session);
      await clearOutbox();
      return;
    }
    default:
      return;
  }
}

export function registerLiveSyncTriggers(onSynced?: () => void): () => void {
  const run = () => {
    void syncLiveOutbox().then(() => onSynced?.());
  };

  window.addEventListener("online", run);
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      run();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "LIVE_SESSION_SYNC") {
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
      void syncManager?.register("live-session-sync").catch(() => undefined);
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

export { visibleEvents, toLocal };
