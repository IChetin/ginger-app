export type PushBrowser =
  "chrome-android" | "yandex-android" | "safari-ios" | "firefox" | "chromium-desktop" | "other";

/** Why push cannot be enabled at all, regardless of the permission prompt. */
export type PushBlocker = "insecure-context" | "ios-needs-install" | "unsupported" | null;

export type PushEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const displayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return displayMode || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function currentPushEnv(): PushEnv {
  return {
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    platform: typeof navigator === "undefined" ? "" : navigator.platform,
    maxTouchPoints: typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
    standalone: isStandalone(),
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification: typeof window !== "undefined" && "Notification" in window,
  };
}

function isIos(env: PushEnv): boolean {
  return (
    /iPhone|iPad|iPod/i.test(env.userAgent) ||
    (env.platform === "MacIntel" && env.maxTouchPoints > 1)
  );
}

export function detectPushBrowser(env: PushEnv = currentPushEnv()): PushBrowser {
  const ua = env.userAgent;
  if (isIos(env)) {
    // Every iOS engine is WebKit, so the Safari instructions apply to all of them.
    return "safari-ios";
  }
  if (/Firefox|FxiOS/i.test(ua)) {
    return "firefox";
  }
  // Яндекс Браузер проверяем раньше: его UA содержит Chrome, а путь к настройкам другой.
  if (/Android/i.test(ua) && /YaBrowser/i.test(ua)) {
    return "yandex-android";
  }
  if (/Android/i.test(ua) && /Chrome|CriOS|EdgA|SamsungBrowser|OPR/i.test(ua)) {
    return "chrome-android";
  }
  if (/Chrome|Chromium|Edg|YaBrowser|OPR/i.test(ua)) {
    return "chromium-desktop";
  }
  return "other";
}

export function detectPushBlocker(env: PushEnv = currentPushEnv()): PushBlocker {
  if (!env.secureContext) {
    return "insecure-context";
  }
  if (isIos(env) && !env.standalone) {
    return "ios-needs-install";
  }
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return "unsupported";
  }
  return null;
}

const DENIED_MESSAGES: Record<PushBrowser, string> = {
  "chrome-android":
    "Браузер заблокировал уведомления: значок слева от адреса → «Настройки сайта» → Уведомления → Разрешить, затем попробуйте снова",
  "yandex-android":
    "Яндекс Браузер заблокировал уведомления: ⋮ → Настройки → Уведомления → Уведомления сайтов → найдите lisa52.com и разрешите, затем попробуйте снова",
  "safari-ios":
    "Разрешите уведомления в Настройках iPhone: Уведомления → Ginger, затем попробуйте снова",
  firefox:
    "Firefox заблокировал уведомления: замок в адресной строке → Разрешения → Получать уведомления, затем попробуйте снова",
  "chromium-desktop":
    "Браузер заблокировал уведомления: замок в адресной строке → Уведомления → Разрешить, затем попробуйте снова",
  other: "Разрешите уведомления для сайта в настройках браузера, затем попробуйте снова",
};

export function pushPermissionDeniedMessage(browser: PushBrowser = detectPushBrowser()): string {
  return DENIED_MESSAGES[browser];
}

export function pushBlockerMessage(blocker: Exclude<PushBlocker, null>): string {
  if (blocker === "insecure-context") {
    return "Push-уведомления работают только по HTTPS — откройте сайт по защищённому адресу";
  }
  if (blocker === "ios-needs-install") {
    return "Сначала добавьте Ginger на экран «Домой»: Поделиться → На экран «Домой» — iOS присылает уведомления только установленному приложению";
  }
  return "Этот браузер не поддерживает push-уведомления";
}
