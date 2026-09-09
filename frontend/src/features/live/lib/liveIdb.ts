import type { LiveEventRead, LiveSessionRead } from "@/api/types/live";

const DB_NAME = "day2-live-sessions";
const DB_VERSION = 1;
const SESSION_STORE = "session";
const OUTBOX_STORE = "outbox";
const META_STORE = "meta";

export type OutboxKind =
  | "create_session"
  | "create_events"
  | "patch_event"
  | "delete_event"
  | "finish"
  | "cancel";

export interface OutboxItem {
  seq: number;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface LocalLiveEvent extends LiveEventRead {
  deleted_at?: string | null;
}

export interface LocalLiveSession extends Omit<LiveSessionRead, "events"> {
  events: LocalLiveEvent[];
  conflict?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open live sessions IDB"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "seq" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = handler(store);
        tx.oncomplete = () => {
          resolve((request ? request.result : undefined) as T);
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("Live sessions IDB transaction failed"));
        };
        if (request) {
          request.onerror = () => {
            reject(request.error ?? new Error("Live sessions IDB request failed"));
          };
        }
      }),
  );
}

export async function getLocalActiveSession(): Promise<LocalLiveSession | null> {
  const all = await runStore<LocalLiveSession[]>(SESSION_STORE, "readonly", (store) =>
    store.getAll(),
  );
  const active = (all ?? []).find((item) => item.status === "active");
  return active ?? null;
}

export async function putLocalSession(session: LocalLiveSession): Promise<void> {
  await runStore(SESSION_STORE, "readwrite", (store) => {
    store.clear();
    store.put(session);
  });
}

export async function clearLocalSession(): Promise<void> {
  await runStore(SESSION_STORE, "readwrite", (store) => store.clear());
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const items = await runStore<OutboxItem[]>(OUTBOX_STORE, "readonly", (store) => store.getAll());
  return (items ?? []).slice().sort((a, b) => a.seq - b.seq);
}

export async function getOutboxCount(): Promise<number> {
  const items = await getOutbox();
  return items.length;
}

async function nextSeq(): Promise<number> {
  const meta = await runStore<{ key: string; value: number } | undefined>(
    META_STORE,
    "readonly",
    (store) => store.get("outbox_seq"),
  );
  return (meta?.value ?? 0) + 1;
}

async function setSeq(seq: number): Promise<void> {
  await runStore(META_STORE, "readwrite", (store) => store.put({ key: "outbox_seq", value: seq }));
}

/** Merge create+patch / drop create+delete before append. */
export function coalesceOutbox(items: OutboxItem[], next: OutboxItem): OutboxItem[] {
  if (next.kind === "create_events") {
    const events = (next.payload.events as { id: string }[]) ?? [];
    const ids = new Set(events.map((e) => e.id));
    const filtered = items.filter((item) => {
      if (item.kind === "patch_event" && ids.has(String(item.payload.id))) return false;
      if (item.kind === "delete_event" && ids.has(String(item.payload.id))) return false;
      return true;
    });
    // Merge into existing create_events batch if present
    const existingIdx = filtered.findIndex((item) => item.kind === "create_events");
    if (existingIdx >= 0) {
      const existing = filtered[existingIdx];
      const prevEvents = (existing.payload.events as Record<string, unknown>[]) ?? [];
      const byId = new Map(prevEvents.map((e) => [String(e.id), e]));
      for (const ev of events as Record<string, unknown>[]) {
        byId.set(String(ev.id), { ...byId.get(String(ev.id)), ...ev });
      }
      const merged: OutboxItem = {
        ...existing,
        payload: { ...existing.payload, events: [...byId.values()] },
      };
      return [...filtered.slice(0, existingIdx), merged, ...filtered.slice(existingIdx + 1)];
    }
    return [...filtered, next];
  }

  if (next.kind === "patch_event") {
    const id = String(next.payload.id);
    // Fold into pending create_events
    const createIdx = items.findIndex((item) => item.kind === "create_events");
    if (createIdx >= 0) {
      const createItem = items[createIdx];
      const events = ((createItem.payload.events as Record<string, unknown>[]) ?? []).map((ev) =>
        String(ev.id) === id ? { ...ev, ...next.payload, id } : ev,
      );
      if (events.some((ev) => String(ev.id) === id)) {
        const merged: OutboxItem = {
          ...createItem,
          payload: { ...createItem.payload, events },
        };
        return [...items.slice(0, createIdx), merged, ...items.slice(createIdx + 1)];
      }
    }
    // Replace prior patch for same id
    const without = items.filter(
      (item) => !(item.kind === "patch_event" && String(item.payload.id) === id),
    );
    return [...without, next];
  }

  if (next.kind === "delete_event") {
    const id = String(next.payload.id);
    const createIdx = items.findIndex((item) => item.kind === "create_events");
    if (createIdx >= 0) {
      const createItem = items[createIdx];
      const events = ((createItem.payload.events as Record<string, unknown>[]) ?? []).filter(
        (ev) => String(ev.id) !== id,
      );
      const had = ((createItem.payload.events as Record<string, unknown>[]) ?? []).some(
        (ev) => String(ev.id) === id,
      );
      if (had) {
        const rest = items.filter(
          (item, idx) =>
            idx !== createIdx &&
            !(item.kind === "patch_event" && String(item.payload.id) === id) &&
            !(item.kind === "delete_event" && String(item.payload.id) === id),
        );
        if (events.length === 0) {
          return rest;
        }
        return [
          ...rest.slice(0, createIdx),
          { ...createItem, payload: { ...createItem.payload, events } },
          ...rest.slice(createIdx),
        ];
      }
    }
    const without = items.filter(
      (item) =>
        !(item.kind === "patch_event" && String(item.payload.id) === id) &&
        !(item.kind === "delete_event" && String(item.payload.id) === id),
    );
    return [...without, next];
  }

  return [...items, next];
}

export async function enqueueOutbox(
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<OutboxItem[]> {
  const current = await getOutbox();
  const seq = await nextSeq();
  const next: OutboxItem = {
    seq,
    kind,
    payload,
    created_at: new Date().toISOString(),
  };
  const merged = coalesceOutbox(current, next);
  await runStore(OUTBOX_STORE, "readwrite", (store) => {
    store.clear();
    for (const item of merged) {
      store.put(item);
    }
  });
  await setSeq(seq);
  return merged;
}

export async function replaceOutbox(items: OutboxItem[]): Promise<void> {
  await runStore(OUTBOX_STORE, "readwrite", (store) => {
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  });
}

export async function clearOutbox(): Promise<void> {
  await replaceOutbox([]);
}

export function visibleEvents(session: LocalLiveSession): LiveEventRead[] {
  return session.events
    .filter((item) => !item.deleted_at)
    .map(({ deleted_at: _d, ...rest }) => rest);
}
