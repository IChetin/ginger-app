import { describe, expect, it } from "vitest";

import { formatCountdown, isValidEmail, maskEmail, normalizeEmail } from "@/lib/email";

describe("email utils", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  Ivan@Mail.RU ")).toBe("ivan@mail.ru");
  });

  it("validates email format", () => {
    expect(isValidEmail("player@example.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
  });

  it("masks email for display", () => {
    expect(maskEmail("ivan@mail.ru")).toBe("i••••@mail.ru");
    expect(maskEmail("a@b.co")).toBe("a••••@b.co");
    expect(maskEmail("not-an-email")).toBe("••••");
  });

  it("formats countdown at boundaries", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(5 * 3600)).toBe("300:00");
  });
});
