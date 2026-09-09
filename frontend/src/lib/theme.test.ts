import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  flushStoredTheme,
  getResolvedTheme,
  getThemeChoice,
  initTheme,
  isThemeChoice,
  readStoredTheme,
  readThemeCookie,
  resetThemeStateForTests,
  resolveTheme,
  setThemeChoice,
  THEME_COLORS,
  THEME_COOKIE_NAME,
} from "@/lib/theme";

type MediaListener = (event: MediaQueryListEvent) => void;

function mockSystemTheme(theme: "light" | "dark"): {
  emitChange: (next: "light" | "dark") => void;
} {
  let matches = theme === "light";
  const listeners = new Set<MediaListener>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_: string, listener: MediaListener) => listeners.delete(listener),
    dispatchEvent: () => false,
  }));

  return {
    emitChange: (next) => {
      matches = next === "light";
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

function clearThemeCookie(): void {
  document.cookie = `${THEME_COOKIE_NAME}=; path=/; max-age=0`;
}

function deletePreferencesDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("day2-preferences");
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  document.head.innerHTML = '<meta name="theme-color" content="#0B0A09" />';
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  clearThemeCookie();
  await deletePreferencesDb();
  resetThemeStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isThemeChoice", () => {
  it("принимает только три режима", () => {
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("sepia")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("режим system берёт тему из системы", () => {
    mockSystemTheme("light");
    expect(resolveTheme("system")).toBe("light");
    mockSystemTheme("dark");
    expect(resolveTheme("system")).toBe("dark");
  });

  it("ручной выбор переопределяет систему", () => {
    mockSystemTheme("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("ставит data-theme и класс dark при ручном выборе", () => {
    mockSystemTheme("light");
    expect(applyTheme("dark")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      THEME_COLORS.dark,
    );
  });

  it("снимает data-theme в режиме system и красит meta по системной теме", () => {
    mockSystemTheme("light");
    expect(applyTheme("system")).toBe("light");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      THEME_COLORS.light,
    );
  });
});

describe("setThemeChoice", () => {
  it("применяет тему, сохраняет выбор в cookie и IndexedDB, уведомляет подписчиков", async () => {
    mockSystemTheme("dark");
    const listener = vi.fn();
    const { subscribeThemeChoice } = await import("@/lib/theme");
    const unsubscribe = subscribeThemeChoice(listener);

    setThemeChoice("light");

    expect(getThemeChoice()).toBe("light");
    expect(getResolvedTheme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(readThemeCookie()).toBe("light");
    expect(listener).toHaveBeenCalled();
    await flushStoredTheme();
    await expect(readStoredTheme()).resolves.toBe("light");

    unsubscribe();
  });
});

describe("initTheme", () => {
  it("по умолчанию режим system", async () => {
    mockSystemTheme("light");
    await expect(initTheme()).resolves.toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(getResolvedTheme()).toBe("light");
  });

  it("восстанавливает сохранённый выбор между сессиями", async () => {
    mockSystemTheme("dark");
    setThemeChoice("light");
    await flushStoredTheme();
    resetThemeStateForTests();
    clearThemeCookie();

    await expect(initTheme()).resolves.toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(readThemeCookie()).toBe("light");
  });

  it("в режиме system реагирует на смену системной темы", async () => {
    const media = mockSystemTheme("dark");
    await initTheme();
    expect(getResolvedTheme()).toBe("dark");

    media.emitChange("light");

    expect(getResolvedTheme()).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      THEME_COLORS.light,
    );
  });

  it("при ручном выборе системная тема игнорируется", async () => {
    const media = mockSystemTheme("dark");
    setThemeChoice("dark");
    await flushStoredTheme();
    await initTheme();

    media.emitChange("light");

    expect(getThemeChoice()).toBe("dark");
    expect(getResolvedTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
