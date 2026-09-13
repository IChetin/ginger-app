import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/client";
import { nicknameErrorMessage } from "@/features/auth/lib/profileErrors";
import { NICKNAME_DIGITS_MSG, NICKNAME_LENGTH_MSG, NICKNAME_TAKEN_MSG } from "@/lib/nickname";

// BUG-6: every failure looked like «Не удалось сохранить никнейм».
describe("nicknameErrorMessage", () => {
  it("has nothing to say without an error", () => {
    expect(nicknameErrorMessage(null)).toBeNull();
  });

  it("names a taken nickname", () => {
    expect(nicknameErrorMessage(new ApiError(409, "conflict", "Ник занят"))).toBe(
      NICKNAME_TAKEN_MSG,
    );
  });

  it("translates the server validation reasons", () => {
    expect(
      nicknameErrorMessage(
        new ApiError(422, "validation_error", `body.nickname: Value error, ${NICKNAME_LENGTH_MSG}`),
      ),
    ).toBe(NICKNAME_LENGTH_MSG);
    expect(
      nicknameErrorMessage(
        new ApiError(422, "validation_error", `body.nickname: Value error, ${NICKNAME_DIGITS_MSG}`),
      ),
    ).toBe(NICKNAME_DIGITS_MSG);
  });

  it("passes an unknown validation message through", () => {
    expect(nicknameErrorMessage(new ApiError(422, "validation_error", "body: nope"))).toBe(
      "Сервер отклонил никнейм: body: nope",
    );
  });

  it("distinguishes an expired session, throttling and server faults", () => {
    expect(nicknameErrorMessage(new ApiError(401, "unauthorized", "Unauthorized"))).toBe(
      "Сессия истекла — войдите снова",
    );
    expect(nicknameErrorMessage(new ApiError(429, "rate_limited", "Too many"))).toBe(
      "Слишком много попыток, подождите немного",
    );
    expect(nicknameErrorMessage(new ApiError(503, "http_error", "Bad gateway"))).toBe(
      "Сервер не смог сохранить никнейм (ошибка 503)",
    );
  });

  it("reports a dropped connection as such", () => {
    expect(nicknameErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Нет соединения — никнейм не сохранён, попробуйте ещё раз",
    );
  });
});
