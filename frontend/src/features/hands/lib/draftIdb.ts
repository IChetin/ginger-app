import type { HandRead } from "@/api/types/hands";
import { STREET_TITLE } from "@/features/hands/lib/handSchema";
import {
  currentStreet,
  emptyWizard,
  streetActionCount,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { pluralRu } from "@/lib/plural";

const DB_NAME = "day2-hand-drafts";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const OUTBOX_STORE = "outbox";
const META_STORE = "meta";

const LEGACY_DB = "day2-hand-draft";
const LEGACY_STORE = "draft";
const LEGACY_KEY = "current";

export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_LIMIT = 20;
export const AUTOSAVE_MS = 2500;

export interface HandDraftRecord {
  state: WizardState;
  updatedAt: string;
}

export type DraftOutboxKind = "create" | "patch" | "delete" | "publish";

export interface DraftOutboxItem {
  seq: number;
  kind: DraftOutboxKind;
  draftId: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface LocalHandDraft extends HandDraftRecord {
  id: string;
  slug?: string | null;
  serverUpdatedAt: string | null;
  createdOnServer: boolean;
  deleted?: boolean;
  conflict?: boolean;
  conflictServer?: HandRead | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open hand drafts IDB"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
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
          reject(tx.error ?? new Error("Hand drafts IDB transaction failed"));
        };
        if (request) {
          request.onerror = () => {
            reject(request.error ?? new Error("Hand drafts IDB request failed"));
          };
        }
      }),
  );
}

export function isWizardState(value: unknown): value is WizardState {
  if (!value || typeof value !== "object") return false;
  const step = (value as { step?: unknown }).step;
  return step === 1 || step === 2 || step === 3 || step === 4;
}

function numberKeyedRecord<T>(value: unknown, ok: (item: unknown) => item is T): Record<number, T> {
  if (!value || typeof value !== "object") return {};
  const out: Record<number, T> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const seat = Number(key);
    if (!Number.isInteger(seat) || !ok(item)) continue;
    out[seat] = item;
  }
  return out;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function wizardFromPayload(raw: unknown): WizardState | null {
  if (!isWizardState(raw)) return null;
  const empty = emptyWizard();
  const source = raw as WizardState & Record<string, unknown>;
  return {
    ...empty,
    ...source,
    stacks: numberKeyedRecord(source.stacks, (item): item is string => typeof item === "string"),
    names: numberKeyedRecord(source.names, (item): item is string => typeof item === "string"),
    showdownCards: numberKeyedRecord(source.showdownCards, isStringArray),
  };
}

export function wizardToPayload(state: WizardState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

export async function getLocalDraft(id: string): Promise<LocalHandDraft | null> {
  const row = await runStore<LocalHandDraft | undefined>(DRAFT_STORE, "readonly", (store) =>
    store.get(id),
  );
  if (!row || row.deleted) return null;
  const state = wizardFromPayload(row.state);
  if (!state) return null;
  return { ...row, state };
}

export async function listLocalDrafts(): Promise<LocalHandDraft[]> {
  const rows = await runStore<LocalHandDraft[]>(DRAFT_STORE, "readonly", (store) => store.getAll());
  return (rows ?? [])
    .filter((row) => !row.deleted)
    .flatMap((row) => {
      const state = wizardFromPayload(row.state);
      return state ? [{ ...row, state }] : [];
    });
}

export async function getLocalDraftBySlug(slug: string): Promise<LocalHandDraft | null> {
  const rows = await listLocalDrafts();
  return rows.find((row) => row.slug === slug) ?? null;
}

export async function putLocalDraft(draft: LocalHandDraft): Promise<void> {
  await runStore(DRAFT_STORE, "readwrite", (store) => store.put(draft));
}

export async function deleteLocalDraft(id: string): Promise<void> {
  await runStore(DRAFT_STORE, "readwrite", (store) => store.delete(id));
}

export async function markLocalDraftDeleted(id: string): Promise<void> {
  const row = await runStore<LocalHandDraft | undefined>(DRAFT_STORE, "readonly", (store) =>
    store.get(id),
  );
  if (!row) return;
  await putLocalDraft({ ...row, deleted: true, updatedAt: new Date().toISOString() });
}

export function emptyLocalDraft(
  id: string,
  state: WizardState = emptyWizard(),
  slug?: string | null,
): LocalHandDraft {
  return {
    id,
    slug: slug ?? null,
    state,
    updatedAt: new Date().toISOString(),
    serverUpdatedAt: null,
    createdOnServer: false,
  };
}

export async function getOutbox(): Promise<DraftOutboxItem[]> {
  const items = await runStore<DraftOutboxItem[]>(OUTBOX_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return (items ?? []).slice().sort((a, b) => a.seq - b.seq);
}

export async function getOutboxForDraft(draftId: string): Promise<DraftOutboxItem[]> {
  const items = await getOutbox();
  return items.filter((item) => item.draftId === draftId);
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

export function coalesceDraftOutbox(
  items: DraftOutboxItem[],
  next: DraftOutboxItem,
): DraftOutboxItem[] {
  const id = next.draftId;
  if (next.kind === "create") {
    const without = items.filter((item) => item.draftId !== id);
    return [...without, next];
  }
  if (next.kind === "patch") {
    const createIdx = items.findIndex((item) => item.kind === "create" && item.draftId === id);
    if (createIdx >= 0) {
      const createItem = items[createIdx];
      const merged: DraftOutboxItem = {
        ...createItem,
        payload: { ...createItem.payload, ...next.payload },
      };
      const rest = items.filter(
        (item, index) => index !== createIdx && !(item.kind === "patch" && item.draftId === id),
      );
      return [...rest.slice(0, createIdx), merged, ...rest.slice(createIdx)];
    }
    const without = items.filter((item) => !(item.kind === "patch" && item.draftId === id));
    return [...without, next];
  }
  if (next.kind === "delete") {
    const hadUnsentCreate = items.some((item) => item.kind === "create" && item.draftId === id);
    const rest = items.filter((item) => item.draftId !== id);
    if (hadUnsentCreate) return rest;
    return [...rest, next];
  }
  if (next.kind === "publish") {
    const without = items.filter(
      (item) =>
        !(item.kind === "patch" && item.draftId === id) &&
        !(item.kind === "publish" && item.draftId === id),
    );
    return [...without, next];
  }
  return [...items, next];
}

export async function enqueueOutbox(
  kind: DraftOutboxKind,
  draftId: string,
  payload: Record<string, unknown> = {},
): Promise<DraftOutboxItem[]> {
  const current = await getOutbox();
  const seq = await nextSeq();
  const next: DraftOutboxItem = {
    seq,
    kind,
    draftId,
    payload,
    created_at: new Date().toISOString(),
  };
  const merged = coalesceDraftOutbox(current, next);
  await runStore(OUTBOX_STORE, "readwrite", (store) => {
    store.clear();
    for (const item of merged) {
      store.put(item);
    }
  });
  await setSeq(seq);
  return merged;
}

export async function replaceOutbox(items: DraftOutboxItem[]): Promise<void> {
  await runStore(OUTBOX_STORE, "readwrite", (store) => {
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  });
}

async function getMetaFlag(key: string): Promise<boolean> {
  const row = await runStore<{ key: string; value: boolean } | undefined>(
    META_STORE,
    "readonly",
    (store) => store.get(key),
  );
  return Boolean(row?.value);
}

async function setMetaFlag(key: string, value: boolean): Promise<void> {
  await runStore(META_STORE, "readwrite", (store) => store.put({ key, value }));
}

function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB, 1);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open legacy hand draft IDB"));
    };
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        request.transaction?.abort();
        resolve(null);
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function parseLegacyStored(row: unknown): HandDraftRecord | null {
  if (!row || typeof row !== "object") return null;
  const record = row as { state?: unknown; updatedAt?: unknown };
  if (isWizardState(record.state)) {
    const state = wizardFromPayload(record.state);
    if (!state) return null;
    return {
      state,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    };
  }
  if (isWizardState(row)) {
    const state = wizardFromPayload(row);
    if (!state) return null;
    return { state, updatedAt: new Date().toISOString() };
  }
  return null;
}

export async function loadLegacyCurrentDraft(): Promise<HandDraftRecord | null> {
  const dbs = await indexedDB.databases?.();
  if (dbs && !dbs.some((item) => item.name === LEGACY_DB)) {
    return null;
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openLegacyDb();
  } catch {
    return null;
  }
  if (!db) return null;
  if (!db.objectStoreNames.contains(LEGACY_STORE)) {
    db.close();
    return null;
  }
  const row = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE, "readonly");
    const request = tx.objectStore(LEGACY_STORE).get(LEGACY_KEY);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return parseLegacyStored(row);
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${name}`));
    request.onblocked = () => resolve();
  });
}

export async function migrateLegacyCurrentDraft(): Promise<string | null> {
  if (await getMetaFlag("legacy_migrated")) {
    return null;
  }
  const legacy = await loadLegacyCurrentDraft();
  if (legacy && draftHasProgress(legacy.state)) {
    const id = crypto.randomUUID();
    await putLocalDraft({
      id,
      state: legacy.state,
      updatedAt: legacy.updatedAt,
      serverUpdatedAt: null,
      createdOnServer: false,
    });
    await enqueueOutbox("create", id, {
      id,
      current_step: legacy.state.step,
      event_id: legacy.state.eventId,
      live_session_id: legacy.state.liveSessionId,
      note: legacy.state.note.trim() || null,
      wizard: wizardToPayload(legacy.state),
    });
    await deleteDatabase(LEGACY_DB);
    await setMetaFlag("legacy_migrated", true);
    return id;
  }
  await deleteDatabase(LEGACY_DB);
  await setMetaFlag("legacy_migrated", true);
  return null;
}

/** Тесты и сброс: очищает новые черновики и legacy-ключ. */
export async function clearHandDraft(): Promise<void> {
  await runStore(DRAFT_STORE, "readwrite", (store) => store.clear());
  await runStore(OUTBOX_STORE, "readwrite", (store) => store.clear());
  await runStore(META_STORE, "readwrite", (store) => store.clear());
  await deleteDatabase(LEGACY_DB).catch(() => undefined);
}

export function isDraftStale(updatedAt: string, nowMs = Date.now()): boolean {
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  return nowMs - ts >= DRAFT_STALE_MS;
}

export function draftHasProgress(state: WizardState): boolean {
  if (state.step > 1 || state.furthestStep > 1) return true;
  if (state.eventId || state.seriesId || state.liveSessionId) return true;
  if (state.note.trim() !== "") return true;
  if (state.heroCards.length > 0) return true;
  if (streetActionCount(state) > 0) return true;
  if (state.streets.some((street) => street.board.length > 0 || street.actions.length > 0)) {
    return true;
  }
  if (Object.keys(state.showdownCards).length > 0) return true;
  if (state.winnerSeats.length > 0) return true;
  if (Object.values(state.names ?? {}).some((value) => value.trim() !== "")) return true;
  return Object.values(state.stacks).some((value) => value.trim() !== "");
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatDraftUpdatedAt(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (dayDiff === 0) return `сегодня в ${time}`;
  if (dayDiff === 1) return `вчера в ${time}`;
  const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (date.getFullYear() === now.getFullYear()) return `${dayMonth} в ${time}`;
  return `${dayMonth} ${date.getFullYear()} в ${time}`;
}

export function formatDraftSummary(record: HandDraftRecord, now = new Date()): string {
  const { state, updatedAt } = record;
  const parts = [`Шаг ${state.step}`];
  if (state.step === 3) {
    parts.push(STREET_TITLE[currentStreet(state).street].toLowerCase());
  }
  const players = state.occupied.length;
  parts.push(`${players} ${pluralRu(players, "игрок", "игрока", "игроков")}`);
  const when = formatDraftUpdatedAt(updatedAt, now);
  if (when) parts.push(when);
  return parts.join(" · ");
}

export function describeDraftLoss(state: WizardState): string {
  const count = streetActionCount(state);
  const bits: string[] = [];
  if (count > 0) {
    bits.push(`Введено ${count} ${pluralRu(count, "действие", "действия", "действий")}.`);
  } else if (state.heroCards.length > 0) {
    bits.push("Выбраны карты героя.");
  } else {
    bits.push("Введённые данные будут удалены.");
  }
  bits.push("Черновик будет удалён.");
  return bits.join(" ");
}

export function localDraftFromRead(row: HandRead): LocalHandDraft | null {
  if (row.status !== "draft") return null;
  const state = wizardFromPayload(row.wizard);
  if (!state) return null;
  return {
    id: row.id,
    slug: row.slug,
    state,
    updatedAt: row.updated_at,
    serverUpdatedAt: row.updated_at,
    createdOnServer: true,
  };
}
