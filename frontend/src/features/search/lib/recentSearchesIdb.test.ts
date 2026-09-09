import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRecentSearches,
  collapseRecentSearches,
  deleteRecentSearch,
  listRecentSearches,
  pushRecentSearch,
} from "@/features/search/lib/recentSearchesIdb";

describe("collapseRecentSearches", () => {
  it("drops queries shorter than 3 characters", () => {
    expect(
      collapseRecentSearches([
        { query: "ка", created_at: "2026-01-03T00:00:00.000Z" },
        { query: "минск", created_at: "2026-01-02T00:00:00.000Z" },
      ]),
    ).toEqual([{ query: "минск", created_at: "2026-01-02T00:00:00.000Z" }]);
  });

  it("keeps only the longest query in a prefix chain", () => {
    expect(
      collapseRecentSearches([
        { query: "ка", created_at: "2026-01-05T00:00:00.000Z" },
        { query: "кал", created_at: "2026-01-04T00:00:00.000Z" },
        { query: "кали", created_at: "2026-01-03T00:00:00.000Z" },
        { query: "калин", created_at: "2026-01-02T00:00:00.000Z" },
        { query: "калининград", created_at: "2026-01-01T00:00:00.000Z" },
      ]),
    ).toEqual([{ query: "калининград", created_at: "2026-01-01T00:00:00.000Z" }]);
  });

  it("dedupes case-insensitively and prefers newer casing", () => {
    expect(
      collapseRecentSearches([
        { query: "Минск", created_at: "2026-01-01T00:00:00.000Z" },
        { query: "минск", created_at: "2026-01-02T00:00:00.000Z" },
      ]),
    ).toEqual([{ query: "минск", created_at: "2026-01-02T00:00:00.000Z" }]);
  });

  it("caps at 5 newest after collapse", () => {
    const records = Array.from({ length: 7 }, (_, index) => ({
      query: `query${index}`,
      created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const result = collapseRecentSearches(records);
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.query)).toEqual([
      "query6",
      "query5",
      "query4",
      "query3",
      "query2",
    ]);
  });
});

describe("recentSearchesIdb", () => {
  beforeEach(async () => {
    await clearRecentSearches();
  });

  it("ignores queries shorter than 3 characters", async () => {
    await pushRecentSearch("ка");
    expect(await listRecentSearches()).toEqual([]);
  });

  it("stores a completed query and orders newest first", async () => {
    await pushRecentSearch("Минск");
    await pushRecentSearch("Сочи");
    const list = await listRecentSearches();
    expect(list.map((item) => item.query)).toEqual(["Сочи", "Минск"]);
  });

  it("raises an existing case-insensitive duplicate instead of duplicating", async () => {
    await pushRecentSearch("Минск");
    await pushRecentSearch("Сочи");
    await pushRecentSearch("минск");
    const list = await listRecentSearches();
    expect(list.map((item) => item.query)).toEqual(["минск", "Сочи"]);
  });

  it("collapses a shorter history entry when a longer prefix match is pushed", async () => {
    await pushRecentSearch("кали");
    await pushRecentSearch("калининград");
    expect((await listRecentSearches()).map((item) => item.query)).toEqual(["калининград"]);
  });

  it("keeps the longer entry when a shorter prefix is pushed later", async () => {
    await pushRecentSearch("калининград");
    await pushRecentSearch("кали");
    const list = await listRecentSearches();
    expect(list.map((item) => item.query)).toEqual(["калининград"]);
  });

  it("migrates legacy fragment history on list", async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("day2-recent-searches", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queries", "readwrite");
      const store = tx.objectStore("queries");
      store.put({ query: "ка", created_at: "2026-01-05T00:00:00.000Z" });
      store.put({ query: "кал", created_at: "2026-01-04T00:00:00.000Z" });
      store.put({ query: "кали", created_at: "2026-01-03T00:00:00.000Z" });
      store.put({ query: "калин", created_at: "2026-01-02T00:00:00.000Z" });
      store.put({ query: "Минск", created_at: "2026-01-01T00:00:00.000Z" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const list = await listRecentSearches();
    expect(list.map((item) => item.query)).toEqual(["калин", "Минск"]);
  });

  it("deletes by case-insensitive match and clears all", async () => {
    await pushRecentSearch("Минск");
    await pushRecentSearch("Сочи");
    await deleteRecentSearch("минск");
    expect((await listRecentSearches()).map((item) => item.query)).toEqual(["Сочи"]);
    await clearRecentSearches();
    expect(await listRecentSearches()).toEqual([]);
  });
});
