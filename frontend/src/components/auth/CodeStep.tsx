import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { MOCK_CAPTCHA_TOKEN, SmartCaptcha } from "@/features/auth/components/SmartCaptcha";
import { authErrorMessage } from "@/features/auth/lib/authErrors";
import { useCountdown } from "@/hooks/useCountdown";
import { formatCountdown, maskEmail } from "@/lib/email";
import { cn } from "@/lib/utils";

const CELL_COUNT = 6;

type Props = {
  email: string;
  initialRetryAfter: number;
  onChangeEmail: () => void;
  onNetworkError: () => void;
  submitLabel?: string;
  verifyCode: (code: string) => Promise<void>;
  resendCode: (captchaToken?: string) => Promise<{ retry_after: number }>;
  isVerifying?: boolean;
  isResending?: boolean;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, CELL_COUNT);
}

export function CodeStep({
  email,
  initialRetryAfter,
  onChangeEmail,
  onNetworkError,
  submitLabel = "Войти",
  verifyCode,
  resendCode,
  isVerifying = false,
  isResending = false,
}: Props) {
  const [cells, setCells] = useState<string[]>(() => Array.from({ length: CELL_COUNT }, () => ""));
  const [error, setError] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [expired, setExpired] = useState(false);
  const [retryAfter, setRetryAfter] = useState(initialRetryAfter);
  const [retryToken, setRetryToken] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const submittingRef = useRef(false);

  const { remaining, isFinished } = useCountdown(retryAfter, retryToken);
  const code = cells.join("");
  const canSubmit = code.length === CELL_COUNT && !isVerifying;

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const setCodeDigits = (digits: string) => {
    const next = Array.from({ length: CELL_COUNT }, (_, index) => digits[index] ?? "");
    setCells(next);
    setDanger(false);
    setError(null);
    const focusIndex = Math.min(digits.length, CELL_COUNT - 1);
    inputsRef.current[focusIndex]?.focus();
    return next.join("");
  };

  const verify = async (value: string) => {
    if (value.length !== CELL_COUNT || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError(null);
    setDanger(false);
    try {
      await verifyCode(value);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        onNetworkError();
        return;
      }
      if (err.code === "otp_expired") {
        setExpired(true);
        setError("Код истёк");
        setDanger(true);
        return;
      }
      if (err.code === "otp_invalid") {
        const left = err.attemptsLeft ?? 0;
        setError(`Неверный код, осталось ${left} попыток`);
        setDanger(true);
        return;
      }
      if (err.status === 429) {
        setError(authErrorMessage(err));
        setDanger(true);
        if (err.retryAfter) {
          setRetryAfter(err.retryAfter);
          setRetryToken((token) => token + 1);
        }
        return;
      }
      if (err.status === 0 || err.message.toLowerCase().includes("failed to fetch")) {
        onNetworkError();
        return;
      }
      setError(authErrorMessage(err));
      setDanger(true);
    } finally {
      submittingRef.current = false;
    }
  };

  const resend = async (token?: string | null) => {
    setError(null);
    setExpired(false);
    setDanger(false);
    setCells(Array.from({ length: CELL_COUNT }, () => ""));
    try {
      const result = await resendCode(token ?? captchaToken ?? undefined);
      setCaptchaRequired(false);
      setRetryAfter(result.retry_after ?? 60);
      setRetryToken((t) => t + 1);
      inputsRef.current[0]?.focus();
    } catch (err) {
      if (!(err instanceof ApiError)) {
        onNetworkError();
        return;
      }
      if (err.code === "captcha_required") {
        setCaptchaRequired(true);
        setCaptchaToken(
          import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? null : MOCK_CAPTCHA_TOKEN,
        );
        setError("Подтвердите, что вы не робот");
        return;
      }
      if (err.status === 429) {
        setRetryAfter(err.retryAfter ?? 60);
        setRetryToken((t) => t + 1);
        setError(authErrorMessage(err));
        return;
      }
      setError(authErrorMessage(err));
    }
  };

  useEffect(() => {
    if (code.length === CELL_COUNT) {
      void verify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only auto-submit when code completes
  }, [code]);

  return (
    <div data-testid="code-step">
      <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">Код из письма</h1>
      <p className="num text-ink-2 mt-1.5 max-w-[320px] text-sm">
        Отправили код на <b className="text-ink">{maskEmail(email)}</b>{" "}
        <button
          type="button"
          className="text-gold px-1 text-[13px] font-bold"
          onClick={onChangeEmail}
        >
          Изменить
        </button>
      </p>
      <p className="text-ink-3 mt-2 max-w-[320px] text-[13px]">
        Письмо приходит в течение минуты. Проверьте папку «Спам»
      </p>

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <div className="flex gap-1.5" data-testid="otp-cells">
          {cells.map((value, index) => (
            <input
              key={index}
              ref={(node) => {
                inputsRef.current[index] = node;
              }}
              className={cn(
                "num bg-surface text-ink h-[60px] min-w-0 flex-1 rounded-md border px-0 text-center text-2xl font-extrabold",
                "focus:outline-none",
                danger ? "border-danger" : "border-line-strong focus:border-gold",
              )}
              size={1}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={value}
              aria-label={`Цифра ${index + 1}`}
              onChange={(event) => {
                const digit = digitsOnly(event.target.value).slice(-1);
                const next = [...cells];
                next[index] = digit;
                setCells(next);
                setDanger(false);
                setError(null);
                if (digit && index < CELL_COUNT - 1) {
                  inputsRef.current[index + 1]?.focus();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !cells[index] && index > 0) {
                  inputsRef.current[index - 1]?.focus();
                }
              }}
              onPaste={(event) => {
                const pasted = digitsOnly(event.clipboardData.getData("text"));
                if (!pasted) {
                  return;
                }
                event.preventDefault();
                setCodeDigits(pasted);
              }}
            />
          ))}
        </div>

        {captchaRequired ? (
          <div className="space-y-2">
            <p className="text-ink-2 text-sm">Подтвердите, что вы не робот</p>
            <SmartCaptcha onToken={setCaptchaToken} />
            {!import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? (
              <button
                type="button"
                className="text-gold text-sm font-bold"
                onClick={() => {
                  setCaptchaToken(MOCK_CAPTCHA_TOKEN);
                  void resend(MOCK_CAPTCHA_TOKEN);
                }}
              >
                Использовать mock-токен
              </button>
            ) : null}
            {captchaToken && import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? (
              <button
                type="button"
                className="text-gold text-sm font-bold"
                onClick={() => void resend()}
              >
                Отправить код
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-danger text-center text-sm" data-testid="code-error">
            {error}
          </p>
        ) : null}

        {!captchaRequired && (expired || (isFinished && !isVerifying)) ? (
          <button
            type="button"
            className="text-gold text-center text-[13px] font-bold"
            disabled={isResending}
            onClick={() => void resend()}
            data-testid="resend-code"
          >
            {isResending ? "Отправляем…" : "Отправить новый"}
          </button>
        ) : !captchaRequired ? (
          <p className="text-ink-3 text-center text-[13px]" data-testid="resend-timer">
            Отправить ещё раз можно через{" "}
            <b className="num text-ink-2 font-bold">{formatCountdown(remaining)}</b>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "flex h-[52px] w-full items-center justify-center rounded-md text-base font-extrabold tracking-[0.01em]",
            "active:translate-y-px motion-reduce:transition-none",
            canSubmit
              ? "bg-gold-grad text-ink-ongold shadow-sheen-glow"
              : "bg-surface-2 text-ink-3 cursor-not-allowed",
          )}
        >
          {isVerifying ? "Проверяем…" : submitLabel}
        </button>
      </form>
    </div>
  );
}
