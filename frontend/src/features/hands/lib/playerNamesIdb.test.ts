import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearHandNamesIdb,
  forgetUsedName,
  isNamePrivacyHintSeen,
  loadForgottenNames,
  loadRememberedNames,
  markNamePrivacyHintSeen,
  rememberUsedName,
} from "@/features/hands/lib/playerNamesIdb";

describe("playerNamesIdb", () => {
  beforeEach(async () => {
    await clearHandNamesIdb();
  });

  it("ranks remembered names by frequency and skips generic labels", async () => {
    await rememberUsedName("Ник");
    await rememberUsedName("Рег из Минска");
    await rememberUsedName("Рег из Минска");
    await rememberUsedName("Игрок 4");
    expect(await loadRememberedNames()).toEqual(["Рег из Минска", "Ник"]);
  });

  it("keeps at most 50 names and drops the oldest unused", async () => {
    for (let index = 0; index < 51; index += 1) {
      await rememberUsedName(`ИгрокИмя${index}`);
    }
    const names = await loadRememberedNames();
    expect(names).toHaveLength(50);
    expect(names).not.toContain("ИгрокИмя0");
    expect(names).toContain("ИгрокИмя50");
  });

  it("forgets a stored name", async () => {
    await rememberUsedName("Ник");
    await forgetUsedName("Ник");
    expect(await loadRememberedNames()).toEqual([]);
    expect(await loadForgottenNames()).toEqual(["Ник"]);
  });

  it("stores the privacy hint flag once", async () => {
    expect(await isNamePrivacyHintSeen()).toBe(false);
    await markNamePrivacyHintSeen();
    expect(await isNamePrivacyHintSeen()).toBe(true);
  });
});
