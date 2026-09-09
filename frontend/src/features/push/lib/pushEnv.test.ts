import { describe, expect, it } from "vitest";

import {
  detectPushBlocker,
  detectPushBrowser,
  pushBlockerMessage,
  pushPermissionDeniedMessage,
  type PushEnv,
} from "@/features/push/lib/pushEnv";

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIREFOX_DESKTOP = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

function env(overrides: Partial<PushEnv> = {}): PushEnv {
  return {
    userAgent: CHROME_ANDROID,
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    standalone: false,
    secureContext: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    ...overrides,
  };
}

// BUG-5: Chrome on Android was told to change its settings in Safari.
describe("detectPushBrowser", () => {
  it("recognizes Chrome on Android", () => {
    expect(detectPushBrowser(env())).toBe("chrome-android");
  });

  it("recognizes iOS regardless of the wrapper browser", () => {
    expect(detectPushBrowser(env({ userAgent: SAFARI_IOS, platform: "iPhone" }))).toBe(
      "safari-ios",
    );
    expect(
      detectPushBrowser(
        env({ userAgent: SAFARI_IOS.replace("Version/18.0", "CriOS/126.0"), platform: "iPhone" }),
      ),
    ).toBe("safari-ios");
  });

  it("recognizes iPad reporting itself as MacIntel", () => {
    expect(
      detectPushBrowser(
        env({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
          platform: "MacIntel",
          maxTouchPoints: 5,
        }),
      ),
    ).toBe("safari-ios");
  });

  it("recognizes desktop Chromium and Firefox", () => {
    expect(detectPushBrowser(env({ userAgent: CHROME_DESKTOP, maxTouchPoints: 0 }))).toBe(
      "chromium-desktop",
    );
    expect(detectPushBrowser(env({ userAgent: FIREFOX_DESKTOP, maxTouchPoints: 0 }))).toBe(
      "firefox",
    );
  });

  it("gives Chrome Android its own instruction, never the Safari one", () => {
    const message = pushPermissionDeniedMessage(detectPushBrowser(env()));
    expect(message).toContain("Chrome");
    expect(message).not.toContain("Safari");
  });

  it("mentions iPhone settings for iOS", () => {
    const message = pushPermissionDeniedMessage(
      detectPushBrowser(env({ userAgent: SAFARI_IOS, platform: "iPhone" })),
    );
    expect(message).toContain("iPhone");
  });
});

describe("detectPushBlocker", () => {
  it("passes a secure Android Chrome", () => {
    expect(detectPushBlocker(env())).toBeNull();
  });

  it("blocks a plain-HTTP origin", () => {
    expect(detectPushBlocker(env({ secureContext: false }))).toBe("insecure-context");
    expect(pushBlockerMessage("insecure-context")).toContain("HTTPS");
  });

  it("asks iOS users to install the app first", () => {
    const blocker = detectPushBlocker(env({ userAgent: SAFARI_IOS, platform: "iPhone" }));
    expect(blocker).toBe("ios-needs-install");
    expect(pushBlockerMessage("ios-needs-install")).toContain("Домой");
  });

  it("passes an installed iOS PWA", () => {
    expect(
      detectPushBlocker(env({ userAgent: SAFARI_IOS, platform: "iPhone", standalone: true })),
    ).toBeNull();
  });

  it("reports a browser without PushManager", () => {
    expect(detectPushBlocker(env({ hasPushManager: false }))).toBe("unsupported");
  });
});
