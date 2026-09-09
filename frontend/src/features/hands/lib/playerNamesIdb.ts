import {
  isGenericPlayerName,
  NAME_HISTORY_LIMIT,
  normalizeSeatName,
  rankUsedNames,
} from "@/features/hands/lib/playerNames";

const DB_NAME = "day2-hand-names";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const NAMES_KEY = "used";
const FORGOTTEN_KEY = "forgotten";
const PRIVACY_KEY = "privacy-seen";

interface StoredName {
  name: string;
  count: number;
  lastUsed: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open hand names database"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function runStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = handler(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => {
          reject(request.error ?? tx.error ?? new Error("Hand names IndexedDB request failed"));
        };
        tx.onabort = () => {
          reject(tx.error ?? new Error("Hand names IndexedDB transaction aborted"));
        };
      }),
  );
}

async function readUsed(): Promise<StoredName[]> {
  const rows = await runStore<StoredName[] | undefined>("readonly", (store) =>
    store.get(NAMES_KEY),
  );
  return Array.isArray(rows) ? rows : [];
}

async function readForgotten(): Promise<string[]> {
  const rows = await runStore<string[] | undefined>("readonly", (store) => store.get(FORGOTTEN_KEY));
  return Array.isArray(rows) ? rows.map((name) => normalizeSeatName(name)).filter(Boolean) : [];
}

export async function loadForgottenNames(): Promise<string[]> {
  return readForgotten();
}

export async function loadRememberedNames(): Promise<string[]> {
  const rows = await readUsed();
  return rankUsedNames(
    rows.map((row) => ({ name: row.name, at: row.lastUsed, count: row.count })),
    NAME_HISTORY_LIMIT,
  );
}

function evictOldest(rows: StoredName[]): StoredName[] {
  if (rows.length <= NAME_HISTORY_LIMIT) return rows;
  return [...rows]
    .sort((a, b) => a.lastUsed - b.lastUsed || a.name.localeCompare(b.name))
    .slice(rows.length - NAME_HISTORY_LIMIT);
}

export async function rememberUsedName(raw: string): Promise<void> {
  const name = normalizeSeatName(raw);
  if (isGenericPlayerName(name)) return;
  const rows = await readUsed();
  const forgotten = (await readForgotten()).filter((item) => item !== name);
  const index = rows.findIndex((row) => row.name === name);
  const now = Date.now();
  if (index >= 0) {
    const current = rows[index];
    if (current) rows[index] = { name, count: current.count + 1, lastUsed: now };
  } else {
    rows.push({ name, count: 1, lastUsed: now });
  }
  const kept = evictOldest(rows);
  await runStore("readwrite", (store) => {
    store.put(kept, NAMES_KEY);
    return store.put(forgotten, FORGOTTEN_KEY);
  });
}

export async function forgetUsedName(raw: string): Promise<void> {
  const name = normalizeSeatName(raw);
  if (!name) return;
  const rows = (await readUsed()).filter((row) => row.name !== name);
  const forgotten = await readForgotten();
  if (!forgotten.includes(name)) forgotten.push(name);
  await runStore("readwrite", (store) => {
    store.put(rows, NAMES_KEY);
    return store.put(forgotten, FORGOTTEN_KEY);
  });
}

export async function isNamePrivacyHintSeen(): Promise<boolean> {
  const value = await runStore<unknown>("readonly", (store) => store.get(PRIVACY_KEY));
  return value === true;
}

export async function markNamePrivacyHintSeen(): Promise<void> {
  await runStore("readwrite", (store) => store.put(true, PRIVACY_KEY));
}

export async function clearHandNamesIdb(): Promise<void> {
  await runStore("readwrite", (store) => store.clear());
}
