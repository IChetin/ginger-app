import { ApiError, fetchVapidPublicKey, subscribePush, unsubscribePush } from "@/api/client";
import type { PushSubscribePayload } from "@/api/types/push";
import { currentPushEnv, detectPushBlocker, type PushBlocker } from "@/features/push/lib/pushEnv";

export { fetchVapidPublicKey, subscribePush, unsubscribePush };

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export function subscriptionToPayload(subscription: PushSubscription): PushSubscribePayload {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing required keys");
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
  };
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super("Push notification permission was denied");
    this.name = "PushPermissionDeniedError";
  }
}

/** Push is impossible here (no HTTPS, iOS without install, no PushManager). */
export class PushUnavailableError extends Error {
  readonly blocker: Exclude<PushBlocker, null>;

  constructor(blocker: Exclude<PushBlocker, null>) {
    super(`Push is unavailable: ${blocker}`);
    this.name = "PushUnavailableError";
    this.blocker = blocker;
  }
}

/** The browser refused the subscription itself — keep its reason for the user. */
export class PushSubscribeFailedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Push subscription failed: ${reason}`);
    this.name = "PushSubscribeFailedError";
    this.reason = reason;
  }
}

/** navigator.serviceWorker.ready never rejects; without a bound SW it just hangs. */
const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

let cachedVapidPublicKey: string | null | undefined;

/** Module-level cache so a second toggle does not wait on GET /vapid-public-key. */
export async function getVapidPublicKeyCached(): Promise<string> {
  if (cachedVapidPublicKey !== undefined) {
    if (!cachedVapidPublicKey) {
      throw new PushSubscribeFailedError("server has no VAPID public key");
    }
    return cachedVapidPublicKey;
  }
  const { public_key: publicKey } = await fetchVapidPublicKey();
  cachedVapidPublicKey = publicKey || null;
  if (!cachedVapidPublicKey) {
    throw new PushSubscribeFailedError("server has no VAPID public key");
  }
  return cachedVapidPublicKey;
}

export function resetVapidPublicKeyCacheForTests(): void {
  cachedVapidPublicKey = undefined;
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) {
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return null;
  }
  return registration.pushManager.getSubscription();
}

export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  const blocker = detectPushBlocker(currentPushEnv());
  if (blocker) {
    throw new PushUnavailableError(blocker);
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    throw new PushPermissionDeniedError();
  }

  // SW ready and VAPID fetch are independent — run in parallel.
  const [registration, publicKey] = await Promise.all([
    getServiceWorkerRegistration(),
    getVapidPublicKeyCached(),
  ]);
  if (!registration) {
    throw new PushSubscribeFailedError("service worker is not registered");
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (error) {
    throw new PushSubscribeFailedError(error instanceof Error ? error.message : String(error));
  }

  await subscribePush(subscriptionToPayload(subscription));
  return subscription;
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) {
    return;
  }

  try {
    await unsubscribePush({ endpoint: subscription.endpoint });
  } catch (error) {
    // Server row may already be gone (worker deleted it after 410).
    if (!(error instanceof ApiError) || error.status !== 404) {
      await subscription.unsubscribe();
      throw error;
    }
  }
  await subscription.unsubscribe();
}
