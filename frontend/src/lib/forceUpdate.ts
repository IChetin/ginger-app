const GUARD_KEY = "ginger.forceUpdateAt";
const GUARD_MS = 60_000;

/**
 * Сервер сказал «сборка устарела» (426): подтягиваем новый service worker и перезагружаемся.
 * Не чаще раза в минуту — если новая версия почему-то не приехала, не зацикливаемся.
 */
export async function forceClientUpdate(): Promise<void> {
  try {
    const last = Number(window.sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return;
    window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // приватный режим — перезагрузимся без защиты от повтора
  }

  const reload = () => window.location.reload();
  if (!("serviceWorker" in navigator)) {
    reload();
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
  // Не дождались смены воркера — всё равно перезагружаемся: сеть отдаст свежий index.html.
  window.setTimeout(reload, 5000);
  try {
    await registration.update();
  } catch {
    reload();
    return;
  }
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}
