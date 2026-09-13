export type Platform = "ios" | "android" | "desktop";

/** Инструкция по установке своя под каждую ОС (экраны §3.1, шаг 2). */
export function detectPlatform(ua: string = navigator.userAgent): Platform {
  const touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Открыто с иконки на домашнем экране, а не во вкладке браузера. */
export function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return (
      Boolean(window.matchMedia?.("(display-mode: standalone)").matches) || nav.standalone === true
    );
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Android Chrome присылает предложение установки один раз и рано — до того, как игрок дойдёт
 * до нужного экрана. Ловим его при старте приложения и держим до кнопки «Установить».
 */
export function listenInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}

const ONBOARDING_KEY = "ginger.onboarding.v1";

export function onboardingDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    // приватный режим — онбординг просто покажется ещё раз
  }
}
