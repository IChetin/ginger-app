/**
 * Управление темой приложения.
 *
 * Обе темы живут на CSS-переменных с одинаковыми именами (см. index.css), поэтому
 * компоненты о теме не знают: здесь только выбор режима и атрибут `data-theme` на <html>.
 *
 * Выбор хранится в IndexedDB (источник правды) и дублируется в cookie — cookie нужен
 * инлайн-скрипту в index.html, который применяет тему до первого рендера (без FOUC).
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Значение <meta name="theme-color"> для каждой темы (статусбар PWA). */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0B0A09",
  light: "#F4EEE2",
};

export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "Как в системе",
  dark: "Тёмная",
  light: "Светлая",
};

export const THEME_COOKIE_NAME = "day2_theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DB_NAME = "day2-preferences";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const THEME_KEY = "theme";

const LIGHT_MEDIA_QUERY = "(prefers-color-scheme: light)";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemeCookie(): ThemeChoice | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isThemeChoice(value) ? value : null;
}

function writeThemeCookie(choice: ThemeChoice): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE_NAME}=${choice}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

function openPreferencesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open preferences database"));
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

function runTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openPreferencesDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = handler(transaction.objectStore(STORE_NAME));

        request.onerror = () => {
          reject(request.error ?? new Error("Preferences IndexedDB request failed"));
        };

        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };

        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Preferences IndexedDB transaction failed"));
        };

        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? new Error("Preferences IndexedDB transaction aborted"));
        };
      }),
  );
}

export async function readStoredTheme(): Promise<ThemeChoice | null> {
  try {
    const value = await runTransaction<unknown>("readonly", (store) => store.get(THEME_KEY));
    return isThemeChoice(value) ? value : null;
  } catch {
    return null;
  }
}

// Записи в IndexedDB идут по очереди: иначе быстрые переключения могут применяться не в порядке.
let writeQueue: Promise<void> = Promise.resolve();

export function writeStoredTheme(choice: ThemeChoice): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      await runTransaction("readwrite", (store) => store.put(choice, THEME_KEY));
    } catch {
      // Приватный режим или заблокированное хранилище: остаётся cookie-зеркало.
    }
  });
  return writeQueue;
}

/** Дожидается завершения отложенных записей выбора (нужно тестам). */
export function flushStoredTheme(): Promise<void> {
  return writeQueue;
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(LIGHT_MEDIA_QUERY).matches ? "light" : "dark";
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? getSystemTheme() : choice;
}

/** Ставит (или снимает для режима «как в системе») data-theme на <html> и обновляет meta. */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const root = document.documentElement;
  const resolved = resolveTheme(choice);

  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }

  // Класс нужен tailwind-варианту `dark:` в shadcn-примитивах.
  root.classList.toggle("dark", resolved === "dark");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }

  return resolved;
}

export function subscribeSystemTheme(listener: () => void): () => void {
  const media = window.matchMedia(LIGHT_MEDIA_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

let choice: ThemeChoice = DEFAULT_THEME_CHOICE;
const listeners = new Set<() => void>();
let unsubscribeSystem: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function watchSystemTheme(): void {
  unsubscribeSystem?.();
  unsubscribeSystem = null;

  if (choice !== "system") {
    return;
  }

  unsubscribeSystem = subscribeSystemTheme(() => {
    applyTheme(choice);
    notify();
  });
}

export function getThemeChoice(): ThemeChoice {
  return choice;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(choice);
}

export function subscribeThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  applyTheme(next);
  watchSystemTheme();
  writeThemeCookie(next);
  void writeStoredTheme(next);
  notify();
}

/**
 * Синхронно применяет тему из cookie (инлайн-скрипт уже сделал это до рендера),
 * затем сверяется с IndexedDB как с источником правды.
 */
export async function initTheme(): Promise<ThemeChoice> {
  choice = readThemeCookie() ?? DEFAULT_THEME_CHOICE;
  applyTheme(choice);
  watchSystemTheme();

  const stored = await readStoredTheme();

  if (stored && stored !== choice) {
    choice = stored;
    applyTheme(choice);
    watchSystemTheme();
    writeThemeCookie(choice);
    notify();
  } else if (!stored) {
    await writeStoredTheme(choice);
  }

  return choice;
}

/** Только для тестов: сбрасывает состояние модуля. */
export function resetThemeStateForTests(): void {
  unsubscribeSystem?.();
  unsubscribeSystem = null;
  listeners.clear();
  choice = DEFAULT_THEME_CHOICE;
}
