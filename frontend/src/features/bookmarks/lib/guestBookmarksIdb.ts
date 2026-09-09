import type { BookmarkTargetType } from "@/api/types/bookmarks";

const DB_NAME = "day2-guest-bookmarks";
const DB_VERSION = 1;
const STORE_NAME = "bookmarks";

export interface GuestBookmarkRecord {
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets: number[];
  created_at: string;
}

function guestBookmarkKey(targetType: BookmarkTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function openGuestBookmarksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open guest bookmarks database"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("target_type", "target_type", { unique: false });
        store.createIndex("target_id", "target_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

type StoredGuestBookmark = GuestBookmarkRecord & { key: string };

function toStoredRecord(record: GuestBookmarkRecord): StoredGuestBookmark {
  return {
    ...record,
    key: guestBookmarkKey(record.target_type, record.target_id),
  };
}

function fromStoredRecord(record: StoredGuestBookmark): GuestBookmarkRecord {
  return {
    target_type: record.target_type,
    target_id: record.target_id,
    reminder_offsets: record.reminder_offsets,
    created_at: record.created_at,
  };
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openGuestBookmarksDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = handler(store);

        request.onerror = () => {
          reject(request.error ?? new Error("Guest bookmarks IndexedDB request failed"));
        };

        transaction.oncomplete = () => {
          resolve(request.result as T);
        };

        transaction.onerror = () => {
          reject(transaction.error ?? new Error("Guest bookmarks IndexedDB transaction failed"));
        };
      }),
  );
}

export async function getAllGuestBookmarks(): Promise<GuestBookmarkRecord[]> {
  const records = await runTransaction("readonly", (store) => store.getAll());
  return (records as StoredGuestBookmark[]).map(fromStoredRecord);
}

export async function getGuestBookmark(
  targetType: BookmarkTargetType,
  targetId: string,
): Promise<GuestBookmarkRecord | null> {
  const record = await runTransaction("readonly", (store) =>
    store.get(guestBookmarkKey(targetType, targetId)),
  );
  if (!record) {
    return null;
  }
  return fromStoredRecord(record as StoredGuestBookmark);
}

export async function putGuestBookmark(record: GuestBookmarkRecord): Promise<void> {
  await runTransaction("readwrite", (store) => store.put(toStoredRecord(record)));
}

export async function deleteGuestBookmark(
  targetType: BookmarkTargetType,
  targetId: string,
): Promise<void> {
  await runTransaction("readwrite", (store) =>
    store.delete(guestBookmarkKey(targetType, targetId)),
  );
}

export async function clearGuestBookmarks(): Promise<void> {
  await runTransaction("readwrite", (store) => store.clear());
}

export { guestBookmarkKey };
