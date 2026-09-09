import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

import { ApiError } from "@/api/client";
import {
  useLogin,
  useMe,
  usePasswordLogin,
  useRequestCode,
  useSetPassword,
  isStaffUser,
} from "@/api/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { CodeStep } from "@/components/auth/CodeStep";
import { OfferPasswordStep } from "@/components/auth/OfferPasswordStep";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { MOCK_CAPTCHA_TOKEN, SmartCaptcha } from "@/features/auth/components/SmartCaptcha";
import { authErrorMessage } from "@/features/auth/lib/authErrors";
import { passwordLoginSchema } from "@/features/auth/lib/password";
import {
  guestSafePath,
  resolveReturnTo,
  type LoginLocationState,
} from "@/features/auth/lib/redirect";
import { normalizeEmail } from "@/lib/email";
import { cn } from "@/lib/utils";

type Step = "credentials" | "code" | "offer-password";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: user } = useMe();
  const passwordLogin = usePasswordLogin();
  const requestCode = useRequestCode();
  const otpLogin = useLogin();
  const setPassword = useSetPassword();

  const returnTo = resolveReturnTo(
    location.state as LoginLocationState | null,
    searchParams.get("next"),
  );

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [retryAfter, setRetryAfter] = useState(60);
  const [offerPassword, setOfferPassword] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountMissing, setAccountMissing] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const form = useForm<z.infer<typeof passwordLoginSchema>>({
    resolver: standardSchemaResolver(passwordLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user && step !== "offer-password" && step !== "code") {
    const target = returnTo.startsWith("/admin") && !isStaffUser(user) ? "/" : returnTo;
    return <Navigate to={target} replace />;
  }

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const leave = () => {
    navigate(guestSafePath(returnTo), { replace: true });
  };

  const startCodeFlow = async (nextEmail: string, fromForgot: boolean, token?: string | null) => {
    setFormError(null);
    setAccountMissing(false);
    setEmail(nextEmail);
    if (fromForgot) {
      setOfferPassword(true);
    }
    try {
      const result = await requestCode.mutateAsync({
        email: nextEmail,
        captchaToken: token ?? captchaToken ?? undefined,
      });
      setCaptchaRequired(false);
      setRetryAfter(result.retry_after ?? 60);
      setStep("code");
    } catch (error) {
      if (!(error instanceof ApiError)) {
        showToast("Нет соединения, попробуйте ещё раз");
        return;
      }
      if (error.code === "account_not_found") {
        setAccountMissing(true);
        setFormError(authErrorMessage(error));
        setStep("credentials");
        return;
      }
      if (error.code === "captcha_required") {
        setCaptchaRequired(true);
        setCaptchaToken(
          import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? null : MOCK_CAPTCHA_TOKEN,
        );
        setFormError("Подтвердите, что вы не робот");
        return;
      }
      showToast(authErrorMessage(error));
      setFormError(authErrorMessage(error));
    }
  };

  return (
    <AuthShell
      toast={toast}
      onBack={
        step === "code"
          ? () => {
              setOfferPassword(false);
              setStep("credentials");
            }
          : step === "offer-password"
            ? () => navigate(returnTo, { replace: true })
            : leave
      }
    >
      {step === "credentials" ? (
        <div data-testid="login-credentials">
          <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">Вход</h1>
          <p className="text-ink-2 mt-1.5 max-w-[300px] text-sm">
            Закладки, напоминания и статистика будут доступны на всех устройствах.
          </p>

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              setFormError(null);
              setAccountMissing(false);
              const normalized = normalizeEmail(values.email);
              try {
                await passwordLogin.mutateAsync({
                  email: normalized,
                  password: values.password,
                });
                navigate(returnTo, { replace: true });
              } catch (error) {
                if (!(error instanceof ApiError)) {
                  showToast("Нет соединения, попробуйте ещё раз");
                  return;
                }
                if (error.status === 429) {
                  setFormError(authErrorMessage(error));
                  return;
                }
                setFormError("Неверный email или пароль");
              }
            })}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-ink-2 text-[13px] font-semibold">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={cn(
                  "border-line-strong bg-surface text-ink h-[52px] w-full rounded-md border px-4 text-[17px]",
                  "placeholder:text-ink-3 focus:border-gold focus:outline-none",
                )}
                placeholder="you@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-danger text-[12px]">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-ink-2 text-[13px] font-semibold">
                Пароль
              </label>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-danger text-[12px]">{form.formState.errors.password.message}</p>
              ) : null}
            </div>

            {captchaRequired ? (
              <div className="space-y-2">
                <p className="text-ink-2 text-sm">Подтвердите, что вы не робот</p>
                <SmartCaptcha onToken={setCaptchaToken} />
                {!import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? (
                  <button
                    type="button"
                    className="text-gold text-sm font-bold"
                    onClick={() => setCaptchaToken(MOCK_CAPTCHA_TOKEN)}
                  >
                    Использовать mock-токен
                  </button>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <p className="text-danger text-sm" data-testid="login-error">
                {formError}
              </p>
            ) : null}

            {accountMissing ? (
              <Link
                to="/register"
                className="bg-gold-grad text-ink-ongold flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold"
              >
                Зарегистрироваться
              </Link>
            ) : null}

            <button
              type="submit"
              disabled={passwordLogin.isPending}
              className={cn(
                "flex h-[52px] w-full items-center justify-center rounded-md text-base font-extrabold tracking-[0.01em]",
                passwordLogin.isPending
                  ? "bg-surface-2 text-ink-3 cursor-not-allowed"
                  : "bg-gold-grad text-ink-ongold shadow-sheen-glow",
              )}
            >
              {passwordLogin.isPending ? "Входим…" : "Войти"}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-center text-[13px]">
            <button
              type="button"
              className="text-gold font-semibold"
              disabled={requestCode.isPending}
              onClick={() => {
                const nextEmail = normalizeEmail(form.getValues("email"));
                if (!nextEmail || !nextEmail.includes("@")) {
                  setFormError("Введите корректный email");
                  return;
                }
                void startCodeFlow(nextEmail, false);
              }}
            >
              Войти по коду из письма
            </button>
            <button
              type="button"
              className="text-gold font-semibold"
              disabled={requestCode.isPending}
              onClick={() => {
                const nextEmail = normalizeEmail(form.getValues("email"));
                if (!nextEmail || !nextEmail.includes("@")) {
                  setFormError("Введите корректный email");
                  return;
                }
                void startCodeFlow(nextEmail, true);
              }}
            >
              Забыли пароль?
            </button>
            <button type="button" className="text-ink-3 font-semibold" onClick={leave}>
              Продолжить без входа
            </button>
          </div>

          <p className="text-ink-3 mt-6 text-center text-[13px]">
            Нет аккаунта?{" "}
            <Link to="/register" className="text-gold font-bold no-underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      ) : null}

      {step === "code" ? (
        <CodeStep
          email={email}
          initialRetryAfter={retryAfter}
          isVerifying={otpLogin.isPending}
          isResending={requestCode.isPending}
          onChangeEmail={() => {
            setOfferPassword(false);
            setStep("credentials");
          }}
          onNetworkError={() => showToast("Нет соединения, попробуйте ещё раз")}
          verifyCode={async (code) => {
            const loggedIn = await otpLogin.mutateAsync({ email, code });
            if (!loggedIn.has_password || offerPassword) {
              setOfferPassword(true);
              setStep("offer-password");
              return;
            }
            navigate(returnTo, { replace: true });
          }}
          resendCode={async (captchaTokenArg) => {
            const result = await requestCode.mutateAsync({
              email,
              captchaToken: captchaTokenArg,
            });
            return { retry_after: result.retry_after ?? 60 };
          }}
        />
      ) : null}

      {step === "offer-password" ? (
        <OfferPasswordStep
          isPending={setPassword.isPending}
          onSkip={() => navigate(returnTo, { replace: true })}
          onSave={async (password) => {
            await setPassword.mutateAsync({ password });
            navigate(returnTo, { replace: true });
          }}
        />
      ) : null}
    </AuthShell>
  );
}
