const DB_NAME = "day2-recent-searches";
const DB_VERSION = 1;
const STORE_NAME = "queries";
const MAX_RECENT = 5;
const MIN_QUERY_LENGTH = 3;

export interface RecentSearchRecord {
  query: string;
  created_at: string;
}

/** Trim + collapse whitespace + lowercase for comparison. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Display form: trim + collapse whitespace, keep original casing. */
export function formatSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function isPrefixRelated(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Collapse prefix chains and case-insensitive duplicates.
 * Keeps the longer query; on equal length prefers the newer `created_at`.
 * Result is sorted newest-first and capped at MAX_RECENT.
 */
export function collapseRecentSearches(records: RecentSearchRecord[]): RecentSearchRecord[] {
  const eligible = records
    .map((record) => ({
      query: formatSearchQuery(record.query),
      created_at: record.created_at,
      norm: normalizeSearchQuery(record.query),
    }))
    .filter((record) => record.norm.length >= MIN_QUERY_LENGTH);

  // Longer first; same length → newer first.
  eligible.sort((a, b) => {
    if (b.norm.length !== a.norm.length) {
      return b.norm.length - a.norm.length;
    }
    return b.created_at.localeCompare(a.created_at);
  });

  const kept: Array<{ query: string; created_at: string; norm: string }> = [];
  for (const candidate of eligible) {
    const relatedIndex = kept.findIndex((item) => isPrefixRelated(item.norm, candidate.norm));
    if (relatedIndex === -1) {
      kept.push(candidate);
      continue;
    }
    const existing = kept[relatedIndex];
    if (
      candidate.norm.length > existing.norm.length ||
      (candidate.norm.length === existing.norm.length &&
        candidate.created_at > existing.created_at)
    ) {
      kept[relatedIndex] = candidate;
    }
  }

  return kept
    .map(({ query, created_at }) => ({ query, created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_RECENT);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open recent searches database"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "query" });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = handler(store);
        if (request) {
          request.onerror = () => {
            reject(request.error ?? new Error("Recent searches IndexedDB request failed"));
          };
        }
        transaction.oncomplete = () => {
          resolve((request ? request.result : undefined) as T);
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("Recent searches IndexedDB transaction failed"));
        };
      }),
  );
}

async function readAllRecords(): Promise<RecentSearchRecord[]> {
  return runTransaction<RecentSearchRecord[]>("readonly", (store) => store.getAll());
}

async function rewriteAll(records: RecentSearchRecord[]): Promise<void> {
  await runTransaction("readwrite", (store) => {
    store.clear();
    for (const record of records) {
      store.put(record);
    }
  });
}

function sameRecords(a: RecentSearchRecord[], b: RecentSearchRecord[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort((x, y) => x.query.localeCompare(y.query));
  const sortedB = [...b].sort((x, y) => x.query.localeCompare(y.query));
  return sortedA.every(
    (item, index) =>
      item.query === sortedB[index]?.query && item.created_at === sortedB[index]?.created_at,
  );
}

/** One-shot cleanup of legacy fragments (prefix chains, short queries). */
async function migrateIfNeeded(records: RecentSearchRecord[]): Promise<RecentSearchRecord[]> {
  const cleaned = collapseRecentSearches(records);
  if (!sameRecords(records, cleaned)) {
    await rewriteAll(cleaned);
  }
  return cleaned;
}

export async function listRecentSearches(): Promise<RecentSearchRecord[]> {
  const records = await readAllRecords();
  return migrateIfNeeded(records);
}

export async function pushRecentSearch(query: string): Promise<void> {
  const formatted = formatSearchQuery(query);
  const norm = normalizeSearchQuery(formatted);
  if (norm.length < MIN_QUERY_LENGTH) {
    return;
  }

  const existing = await readAllRecords();
  const now = new Date().toISOString();

  const related = existing.filter((item) => isPrefixRelated(normalizeSearchQuery(item.query), norm));
  const longestRelated = related.reduce<RecentSearchRecord | null>((best, item) => {
    const itemNorm = normalizeSearchQuery(item.query);
    if (!best) {
      return item;
    }
    return itemNorm.length > normalizeSearchQuery(best.query).length ? item : best;
  }, null);

  const longestNorm = longestRelated ? normalizeSearchQuery(longestRelated.query) : "";
  const keepQuery =
    longestRelated && longestNorm.length > norm.length ? longestRelated.query : formatted;

  const withoutRelated = existing.filter(
    (item) => !isPrefixRelated(normalizeSearchQuery(item.query), norm),
  );
  const next = collapseRecentSearches([
    ...withoutRelated,
    { query: keepQuery, created_at: now },
  ]);
  await rewriteAll(next);
}

export async function deleteRecentSearch(query: string): Promise<void> {
  const norm = normalizeSearchQuery(query);
  const all = await readAllRecords();
  const match = all.find((item) => normalizeSearchQuery(item.query) === norm);
  if (!match) {
    return;
  }
  await runTransaction("readwrite", (store) => store.delete(match.query));
}

export async function clearRecentSearches(): Promise<void> {
  await runTransaction("readwrite", (store) => store.clear());
}
