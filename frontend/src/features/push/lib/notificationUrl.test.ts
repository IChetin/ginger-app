import { describe, expect, it } from "vitest";

import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";

describe("resolveNotificationClickUrl", () => {
  it("returns fallback for empty values", () => {
    expect(resolveNotificationClickUrl(null)).toBe("/");
    expect(resolveNotificationClickUrl(undefined)).toBe("/");
    expect(resolveNotificationClickUrl("")).toBe("/");
  });

  it("accepts safe internal paths", () => {
    expect(resolveNotificationClickUrl("/events/abc")).toBe("/events/abc");
    expect(resolveNotificationClickUrl("  /series/1  ")).toBe("/series/1");
  });

  it("rejects protocol-relative and external urls", () => {
    expect(resolveNotificationClickUrl("//evil.com")).toBe("/");
    expect(resolveNotificationClickUrl("https://evil.com")).toBe("/");
    expect(resolveNotificationClickUrl("javascript:alert(1)")).toBe("/");
  });
});
