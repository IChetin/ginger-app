import { describe, expect, it } from "vitest";

import { isIosSafariInstallPromptVisible, nicknameInitials } from "@/lib/profile";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

describe("profile helpers", () => {
  it("formats initials", () => {
    expect(nicknameInitials("ivan_mtt")).toBe("IM");
  });

  it("shows install banner only in non-standalone iOS Safari", () => {
    expect(
      isIosSafariInstallPromptVisible({
        userAgent: IOS_SAFARI,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(true);
    expect(
      isIosSafariInstallPromptVisible({
        userAgent: IOS_SAFARI,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: true,
      }),
    ).toBe(false);
    expect(
      isIosSafariInstallPromptVisible({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(false);
  });
});
