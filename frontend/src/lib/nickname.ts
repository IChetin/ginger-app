import { z } from "zod";

/** Any Unicode (letters, spaces, punctuation, emoji). Length + not digits-only. */
export const NICKNAME_LENGTH_MSG = "От 2 до 32 символов";
export const NICKNAME_DIGITS_MSG = "Ник не может состоять только из цифр";
export const NICKNAME_TAKEN_MSG = "Ник занят";
export const NICKNAME_HINT = "Любые символы, в том числе пробелы и emoji";

export const NICKNAME_MIN_LEN = 2;
export const NICKNAME_MAX_LEN = 32;

export function isNicknameDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value);
}

/** Zod field — same rules as backend `app.core.nickname`. */
export const nicknameFieldSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN_LEN, NICKNAME_LENGTH_MSG)
  .max(NICKNAME_MAX_LEN, NICKNAME_LENGTH_MSG)
  .refine((value) => !isNicknameDigitsOnly(value), NICKNAME_DIGITS_MSG);

export const nicknameFormSchema = z.object({
  nickname: nicknameFieldSchema,
});
