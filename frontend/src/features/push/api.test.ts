import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import {
  PushPermissionDeniedError,
  PushUnavailableError,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/features/push/api";

const unsubscribePush = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    unsubscribePush: (...args: unknown[]) => unsubscribePush(...args),
  };
});

function stubSupportedEnv() {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: new Promise(() => {}) },
    configurable: true,
  });
  vi.stubGlobal("PushManager", class {});
}

describe("push permission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("stops subscription when the user denies permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    stubSupportedEnv();

    await expect(subscribeToPushNotifications()).rejects.toBeInstanceOf(PushPermissionDeniedError);
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  // BUG-5: an insecure origin makes Chrome deny notifications outright, and we
  // used to report it as a permission problem with Safari instructions.
  it("reports an insecure origin before asking for permission", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    stubSupportedEnv();
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });

    await expect(subscribeToPushNotifications()).rejects.toMatchObject({
      name: "PushUnavailableError",
      blocker: "insecure-context",
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser", async () => {
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    const error = await subscribeToPushNotifications().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PushUnavailableError);
    expect((error as PushUnavailableError).blocker).toBe("unsupported");
  });
});

describe("unsubscribeFromPushNotifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    unsubscribePush.mockReset();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  function stubLocalSubscription() {
    const localUnsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: "https://push.example/stale",
      unsubscribe: localUnsubscribe,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(subscription),
          },
        }),
      },
      configurable: true,
    });
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission: "granted" });
    return { localUnsubscribe, subscription };
  }

  it("clears a local subscription when the server row is already gone", async () => {
    const { localUnsubscribe, subscription } = stubLocalSubscription();
    unsubscribePush.mockRejectedValue(new ApiError(404, "not_found", "Push subscription not found"));

    await unsubscribeFromPushNotifications();

    expect(unsubscribePush).toHaveBeenCalledWith({ endpoint: subscription.endpoint });
    expect(localUnsubscribe).toHaveBeenCalledOnce();
  });
});
