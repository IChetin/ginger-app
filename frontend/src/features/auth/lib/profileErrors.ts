import { ApiError } from "@/api/client";
import {
  NICKNAME_DIGITS_MSG,
  NICKNAME_LENGTH_MSG,
  NICKNAME_TAKEN_MSG,
} from "@/lib/nickname";

/**
 * Real reason for a failed nickname save. The generic "Не удалось сохранить"
 * hid 422/401/429 answers, so a user could not tell a taken nickname from an
 * expired session or a dropped connection.
 */
export function nicknameErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (!(error instanceof ApiError)) {
    return "Нет соединения — никнейм не сохранён, попробуйте ещё раз";
  }
  if (error.status === 409) {
    return NICKNAME_TAKEN_MSG;
  }
  if (error.status === 422) {
    const msg = error.message;
    if (/от 2 до 32|length/i.test(msg)) {
      return NICKNAME_LENGTH_MSG;
    }
    if (/только из цифр|digits only|isdigit/i.test(msg)) {
      return NICKNAME_DIGITS_MSG;
    }
    return `Сервер отклонил никнейм: ${error.message}`;
  }
  if (error.status === 401) {
    return "Сессия истекла — войдите снова";
  }
  if (error.status === 429) {
    return "Слишком много попыток, подождите немного";
  }
  if (error.status >= 500) {
    return `Сервер не смог сохранить никнейм (ошибка ${error.status})`;
  }
  return `Не удалось сохранить никнейм (ошибка ${error.status})`;
}
