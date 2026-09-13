import { describe, expect, it } from "vitest";

import { NICKNAME_DIGITS_MSG, NICKNAME_LENGTH_MSG, nicknameFieldSchema } from "@/lib/nickname";

// Keep in sync with backend/tests/test_nickname.py (parity cases).
const VALID_NICKNAMES = [
  "Ваня_МТТ",
  "alex-grinder",
  "Игрок2026",
  "ab",
  "a_b-c",
  "Ваня",
  "Ёжик",
  "Player_1",
  "ваня петров",
  "ник😀",
  "pro.player",
  "nick name",
  "♠A♥",
] as const;

const INVALID_NICKNAMES: ReadonlyArray<readonly [string, string]> = [
  ["1234", NICKNAME_DIGITS_MSG],
  ["a", NICKNAME_LENGTH_MSG],
  ["x".repeat(33), NICKNAME_LENGTH_MSG],
  ["", NICKNAME_LENGTH_MSG],
];

describe("nicknameFieldSchema (parity with backend)", () => {
  it.each(VALID_NICKNAMES)("accepts %s", (nickname) => {
    expect(nicknameFieldSchema.safeParse(nickname).success).toBe(true);
  });

  it.each(INVALID_NICKNAMES)("rejects %s", (nickname, message) => {
    const result = nicknameFieldSchema.safeParse(nickname);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message);
    }
  });

  it("strips surrounding whitespace", () => {
    const result = nicknameFieldSchema.safeParse("  Ваня  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Ваня");
    }
  });
});
