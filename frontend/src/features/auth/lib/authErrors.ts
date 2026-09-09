import { ApiError } from "@/api/client";

/** Human-readable auth errors; never show raw English server strings. */
export function authErrorMessage(error: ApiError): string {
  switch (error.code) {
    case "rate_limited": {
      const retry = error.retryAfter;
      if (retry != null && retry >= 3600) {
        const hours = Math.max(1, Math.ceil(retry / 3600));
        return `Слишком много запросов кода. Попробуйте через ${hours} ч. или войдите по паролю`;
      }
      if (error.message && /[А-Яа-яЁё]/.test(error.message)) {
        return error.message;
      }
      return "Слишком много запросов. Попробуйте позже";
    }
    case "captcha_required":
    case "captcha_invalid":
      return "Подтвердите, что вы не робот";
    case "otp_invalid": {
      const left = error.attemptsLeft;
      if (left != null) {
        return `Неверный код, осталось ${left} попыток`;
      }
      return "Неверный код";
    }
    case "otp_expired":
      return "Код истёк";
    case "account_not_found":
      return "Аккаунт с таким email не найден. Зарегистрируйтесь";
    case "account_exists":
      return "Аккаунт с таким email уже есть. Войдите";
    case "invalid_credentials":
      return "Неверный email или пароль";
    case "invalid_token":
      return "Код подтверждения истёк. Начните регистрацию заново";
    default:
      if (error.message && /[А-Яа-яЁё]/.test(error.message)) {
        return error.message;
      }
      return "Не удалось выполнить запрос. Попробуйте ещё раз";
  }
}
