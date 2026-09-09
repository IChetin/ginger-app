import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGuestBookmarks,
  deleteGuestBookmark,
  getAllGuestBookmarks,
  getGuestBookmark,
  putGuestBookmark,
} from "@/features/bookmarks/lib/guestBookmarksIdb";

describe("guestBookmarksIdb", () => {
  beforeEach(async () => {
    await clearGuestBookmarks();
  });

  it("creates, reads, updates and deletes guest bookmarks", async () => {
    const record = {
      target_type: "flight" as const,
      target_id: "flight-1",
      reminder_offsets: [1440, 120],
      created_at: "2026-01-01T00:00:00.000Z",
    };

    await putGuestBookmark(record);

    expect(await getGuestBookmark("flight", "flight-1")).toEqual(record);
    expect(await getAllGuestBookmarks()).toEqual([record]);

    const updated = {
      ...record,
      reminder_offsets: [60],
    };
    await putGuestBookmark(updated);
    expect(await getGuestBookmark("flight", "flight-1")).toEqual(updated);

    await deleteGuestBookmark("flight", "flight-1");
    expect(await getGuestBookmark("flight", "flight-1")).toBeNull();
    expect(await getAllGuestBookmarks()).toEqual([]);
  });

  it("stores series bookmarks without reminder offsets", async () => {
    const record = {
      target_type: "series" as const,
      target_id: "series-1",
      reminder_offsets: [],
      created_at: "2026-01-01T00:00:00.000Z",
    };

    await putGuestBookmark(record);

    expect(await getAllGuestBookmarks()).toEqual([record]);
  });
});
