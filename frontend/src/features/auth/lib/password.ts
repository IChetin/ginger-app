import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export type PasswordStrength = "weak" | "medium" | "strong";

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN) {
    return "weak";
  }
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score >= 4) return "strong";
  if (score >= 2) return "medium";
  return "weak";
}

export function passwordStrengthLabel(level: PasswordStrength): string {
  switch (level) {
    case "weak":
      return "Слабый";
    case "medium":
      return "Средний";
    case "strong":
      return "Надёжный";
  }
}

export const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Минимум ${PASSWORD_MIN} символов`)
  .max(PASSWORD_MAX, `Максимум ${PASSWORD_MAX} символов`)
  .refine((value) => value.trim() === value, "Без пробелов в начале и конце");

export const passwordLoginSchema = z.object({
  email: z.string().trim().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export const registerCompleteSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(2, "Минимум 2 символа")
      .max(32, "Максимум 32 символа"),
    password: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export const setPasswordSchema = z
  .object({
    password: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.newPassword === data.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });
