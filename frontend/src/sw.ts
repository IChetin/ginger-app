/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// injectManifest strategy не добавляет это автоматически (в отличие от generateSW):
// без этого слушателя registerType: "autoUpdate" на клиенте не может активировать
// новую версию SW — она зависает в состоянии "waiting" до закрытия всех вкладок,
// и пользователь продолжает получать старый закэшированный бандл после деплоя.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) {
    return null;
  }
  return {
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch("/api/v1/push/vapid-public-key", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch VAPID public key");
  }
  const body = (await response.json()) as { public_key: string };
  return body.public_key;
}

async function resubscribePush(): Promise<void> {
  const registration = self.registration;
  const publicKey = await fetchVapidPublicKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const keys = subscriptionKeys(subscription);
  if (!keys) {
    throw new Error("Push subscription keys are missing");
  }

  await fetch("/api/v1/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }),
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload: PushPayload = {
        title: "Ginger",
        body: "Напоминание о турнире",
        url: "/",
      };

      if (event.data) {
        try {
          payload = { ...payload, ...(event.data.json() as PushPayload) };
        } catch {
          payload.body = event.data.text();
        }
      }

      await self.registration.showNotification(payload.title ?? "Ginger", {
        body: payload.body,
        data: { url: payload.url ?? "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationClickUrl(
    (event.notification.data as { url?: string } | undefined)?.url,
  );

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await (client as WindowClient).navigate(targetUrl);
          }
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  (event as ExtendableEvent).waitUntil(resubscribePush());
});

// Background Sync for live tournament outbox (Chrome/Android).
// The page listens too; this wakes sync after the tab was closed.
self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== "live-session-sync" && syncEvent.tag !== "hand-draft-sync") {
    return;
  }
  const messageType = syncEvent.tag === "hand-draft-sync" ? "HAND_DRAFT_SYNC" : "LIVE_SESSION_SYNC";
  syncEvent.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        client.postMessage({ type: messageType });
      }
    })(),
  );
});

export {};
