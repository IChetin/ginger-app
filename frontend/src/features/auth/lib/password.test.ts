import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  passwordLoginSchema,
  passwordStrength,
  setPasswordSchema,
} from "@/features/auth/lib/password";

describe("password schemas", () => {
  it("accepts valid set-password payload", () => {
    const parsed = setPasswordSchema.safeParse({
      password: "correcthorse1",
      passwordConfirm: "correcthorse1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects short password and mismatched confirm", () => {
    const short = setPasswordSchema.safeParse({
      password: "short",
      passwordConfirm: "short",
    });
    expect(short.success).toBe(false);

    const mismatch = setPasswordSchema.safeParse({
      password: "correcthorse1",
      passwordConfirm: "correcthorse2",
    });
    expect(mismatch.success).toBe(false);
  });

  it("requires email for login and change password fields", () => {
    expect(passwordLoginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpassword12",
        newPassword: "correcthorse1",
        passwordConfirm: "correcthorse1",
      }).success,
    ).toBe(true);
  });

  it("classifies password strength", () => {
    expect(passwordStrength("short")).toBe("weak");
    expect(passwordStrength("abcdefgh")).toBe("weak");
    expect(passwordStrength("abcdefghij12")).toBe("medium");
    expect(passwordStrength("Abcdefghij12!")).toBe("strong");
  });
});
