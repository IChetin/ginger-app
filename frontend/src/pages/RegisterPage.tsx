import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

import { ApiError } from "@/api/client";
import {
  useMe,
  useRegisterComplete,
  useRegisterStart,
  useRegisterVerify,
  useRegistrationMode,
} from "@/api/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { CodeStep } from "@/components/auth/CodeStep";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { MOCK_CAPTCHA_TOKEN, SmartCaptcha } from "@/features/auth/components/SmartCaptcha";
import { forgetInvite, readInvite } from "@/features/chips/lib/invite";
import { authErrorMessage } from "@/features/auth/lib/authErrors";
import { registerCompleteSchema } from "@/features/auth/lib/password";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { cn } from "@/lib/utils";

type Step = "email" | "code" | "profile" | "about";

// Клавиатура на телефоне закрывает нижнюю половину экрана: поднимаем поле в середину.
const keepVisible = (event: { target: EventTarget & HTMLElement }) => {
  window.setTimeout(() => {
    event.target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 250);
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Ginger — закрытый клуб: регистрация только по приглашению (ТЗ §5, ответ 11.8).
  const [inviteToken] = useState(() => readInvite(searchParams.get("invite")));
  const { data: user } = useMe();
  const registrationMode = useRegistrationMode();
  const mode = registrationMode.data;
  const registerStart = useRegisterStart();
  const registerVerify = useRegisterVerify();
  const registerComplete = useRegisterComplete();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [retryAfter, setRetryAfter] = useState(60);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Анкета самостоятельной регистрации (24.09) — её видит менеджер в очереди модерации.
  const [realName, setRealName] = useState("");
  const [playNickname, setPlayNickname] = useState("");
  const [source, setSource] = useState("");

  const form = useForm<z.infer<typeof registerCompleteSchema>>({
    resolver: standardSchemaResolver(registerCompleteSchema),
    defaultValues: { nickname: "", password: "", passwordConfirm: "" },
  });
  const passwordValue = form.watch("password");

  if (user) {
    return <Navigate to="/" replace />;
  }

  // Без приглашения человек заводит аккаунт сам, если это разрешено на сервере (24.09):
  // доступ к кассе даёт менеджер после модерации.
  const selfSignup = !inviteToken && !(mode?.invite_required ?? true);
  const moderatedSignup = selfSignup && (mode?.moderated ?? false);

  // Пока режим не пришёл — не мигаем формой; если не ответил, считаем клуб закрытым.
  if (!inviteToken && registrationMode.isPending) {
    return (
      <AuthShell toast={null} onBack={() => navigate("/login", { replace: true })}>
        <div className="bg-surface-2 mt-[18px] h-24 rounded-md" aria-hidden />
      </AuthShell>
    );
  }

  if (!inviteToken && !selfSignup) {
    return (
      <AuthShell toast={null} onBack={() => navigate("/login", { replace: true })}>
        <div data-testid="register-invite-required">
          <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">
            Регистрация по приглашению
          </h1>
          <p className="text-ink-2 mt-2 text-[14px]">
            Ginger — закрытый клуб. Попросите ссылку-приглашение у друга, который уже играет, или у
            менеджера и откройте её.
          </p>
          <Link to="/login" className="text-gold mt-4 inline-block text-[14px] font-bold">
            Уже есть аккаунт — войти
          </Link>
        </div>
      </AuthShell>
    );
  }

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  /** Создание аккаунта: анкета уходит вместе с паролем и никнеймом одним запросом. */
  const createAccount = async (questionnaire = true) => {
    if (!registrationToken) {
      setFieldError("Код подтверждения истёк. Начните регистрацию заново");
      setStep("email");
      return;
    }
    const values = form.getValues();
    const answer = (value: string) =>
      selfSignup && questionnaire ? value.trim() || undefined : undefined;
    setFieldError(null);
    try {
      await registerComplete.mutateAsync({
        registration_token: registrationToken,
        password: values.password,
        nickname: values.nickname,
        invite_token: inviteToken ?? undefined,
        real_name: answer(realName),
        play_nickname: answer(playNickname),
        source: answer(source),
      });
      forgetInvite();
      navigate("/welcome", { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        showToast("Нет соединения, попробуйте ещё раз");
        return;
      }
      setFieldError(authErrorMessage(error));
    }
  };

  const startRegistration = async (nextEmail: string, token?: string | null) => {
    setFieldError(null);
    setAccountExists(false);
    try {
      const result = await registerStart.mutateAsync({
        email: nextEmail,
        privacy_consent: true,
        invite_token: inviteToken ?? undefined,
        captcha_token: token ?? captchaToken ?? undefined,
      });
      setEmail(nextEmail);
      setCaptchaRequired(false);
      setRetryAfter(result.retry_after ?? 60);
      setStep("code");
    } catch (error) {
      if (!(error instanceof ApiError)) {
        showToast("Нет соединения, попробуйте ещё раз");
        return;
      }
      if (error.code === "account_exists") {
        setAccountExists(true);
        setFieldError(authErrorMessage(error));
        return;
      }
      if (error.code === "captcha_required") {
        setCaptchaRequired(true);
        setCaptchaToken(
          import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ? null : MOCK_CAPTCHA_TOKEN,
        );
        setFieldError("Подтвердите, что вы не робот");
        return;
      }
      if (error.status === 429) {
        setFieldError(authErrorMessage(error));
        return;
      }
      setFieldError(authErrorMessage(error));
    }
  };

  return (
    <AuthShell
      toast={toast}
      onBack={
        step === "code"
          ? () => setStep("email")
          : step === "profile"
            ? () => setStep("code")
            : step === "about"
              ? () => setStep("profile")
              : () => navigate("/login", { replace: true })
      }
    >
      {step === "email" ? (
        <div data-testid="register-email-step">
          <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">Регистрация</h1>
          <p className="text-ink-2 mt-1.5 max-w-[300px] text-sm">
            Подтвердим email кодом из письма, затем зададите пароль и никнейм.
          </p>

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!consent) {
                setFieldError("Нужно согласие на обработку персональных данных");
                return;
              }
              if (!isValidEmail(email)) {
                setFieldError("Введите корректный email");
                return;
              }
              void startRegistration(normalizeEmail(email));
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-email" className="text-ink-2 text-[13px] font-semibold">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={cn(
                  "border-line-strong bg-surface text-ink h-[52px] w-full rounded-md border px-4 text-[17px]",
                  "placeholder:text-ink-3 focus:border-gold focus:outline-none",
                )}
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldError(null);
                  setAccountExists(false);
                }}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className={cn(
                  "border-line-strong bg-surface mt-0.5 h-5 w-5 shrink-0 appearance-none rounded-[6px] border-[1.5px]",
                  "checked:bg-gold-grad checked:border-transparent",
                  "relative checked:after:absolute checked:after:top-[2px] checked:after:left-[6px]",
                  "checked:after:h-2.5 checked:after:w-[5px] checked:after:rotate-45",
                  "checked:after:border-ink-ongold checked:after:border-r-2 checked:after:border-b-2",
                )}
              />
              <span className="text-ink-3 text-xs">
                Соглашаюсь с{" "}
                <Link to="/privacy" className="text-gold font-semibold no-underline">
                  политикой конфиденциальности
                </Link>{" "}
                и даю согласие на обработку персональных данных
              </span>
            </label>

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

            {fieldError ? (
              <p className="text-danger text-sm" data-testid="register-error">
                {fieldError}
              </p>
            ) : null}

            {accountExists ? (
              <Link
                to="/login"
                className="bg-gold-grad text-ink-ongold flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold"
              >
                Войти
              </Link>
            ) : (
              <button
                type="submit"
                disabled={registerStart.isPending || (captchaRequired && !captchaToken)}
                className={cn(
                  "flex h-[52px] w-full items-center justify-center rounded-md text-base font-extrabold",
                  registerStart.isPending
                    ? "bg-surface-2 text-ink-3 cursor-not-allowed"
                    : "bg-gold-grad text-ink-ongold shadow-sheen-glow",
                )}
              >
                {registerStart.isPending ? "Отправляем…" : "Продолжить"}
              </button>
            )}
          </form>

          <p className="text-ink-3 mt-6 text-center text-[13px]">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="text-gold font-bold no-underline">
              Войти
            </Link>
          </p>
        </div>
      ) : null}

      {step === "code" ? (
        <CodeStep
          email={email}
          initialRetryAfter={retryAfter}
          submitLabel="Подтвердить"
          isVerifying={registerVerify.isPending}
          isResending={registerStart.isPending}
          onChangeEmail={() => setStep("email")}
          onNetworkError={() => showToast("Нет соединения, попробуйте ещё раз")}
          verifyCode={async (code) => {
            const result = await registerVerify.mutateAsync({ email, code });
            setRegistrationToken(result.registration_token);
            setStep("profile");
          }}
          resendCode={async (captchaTokenArg) => {
            const result = await registerStart.mutateAsync({
              email,
              privacy_consent: true,
              invite_token: inviteToken ?? undefined,
              captcha_token: captchaTokenArg,
            });
            return { retry_after: result.retry_after ?? 60 };
          }}
        />
      ) : null}

      {step === "profile" ? (
        <div data-testid="register-profile-step">
          {selfSignup ? (
            <p className="text-ink-3 mt-[18px] text-[11px] font-bold tracking-[0.08em] uppercase">
              Шаг 2 из 3
            </p>
          ) : null}
          <h1
            className={cn(
              "text-[23px] font-extrabold tracking-[-0.02em]",
              selfSignup ? "mt-1" : "mt-[18px]",
            )}
          >
            Пароль и никнейм
          </h1>
          <p className="text-ink-2 mt-1.5 max-w-[300px] text-sm">
            Email подтверждён. Задайте пароль для входа и никнейм.
          </p>

          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={form.handleSubmit(async () => {
              // Анкета — отдельным экраном: шесть полей под клавиатурой не помещаются.
              if (selfSignup) {
                setFieldError(null);
                setStep("about");
                return;
              }
              await createAccount();
            })}
          >
            <label className="text-ink-2 text-[13px] font-semibold" htmlFor="register-nickname">
              Никнейм
            </label>
            <input
              id="register-nickname"
              autoComplete="nickname"
              enterKeyHint="next"
              className="tracker-input"
              {...form.register("nickname")}
              onFocus={keepVisible}
            />
            {form.formState.errors.nickname ? (
              <p className="text-danger text-[12px]">{form.formState.errors.nickname.message}</p>
            ) : null}

            <label
              className="text-ink-2 mt-2 text-[13px] font-semibold"
              htmlFor="register-password"
            >
              Пароль
            </label>
            <PasswordInput
              id="register-password"
              autoComplete="new-password"
              enterKeyHint="next"
              showStrength
              onFocus={keepVisible}
              value={passwordValue}
              onChange={(event) => {
                form.setValue("password", event.target.value, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }}
              onBlur={() => {
                void form.trigger("password");
              }}
              name="password"
            />
            {form.formState.errors.password ? (
              <p className="text-danger text-[12px]">{form.formState.errors.password.message}</p>
            ) : null}

            <label
              className="text-ink-2 mt-2 text-[13px] font-semibold"
              htmlFor="register-password-confirm"
            >
              Повтор пароля
            </label>
            <PasswordInput
              id="register-password-confirm"
              autoComplete="new-password"
              enterKeyHint="done"
              {...form.register("passwordConfirm")}
              onFocus={keepVisible}
            />
            {form.formState.errors.passwordConfirm ? (
              <p className="text-danger text-[12px]">
                {form.formState.errors.passwordConfirm.message}
              </p>
            ) : null}

            {fieldError ? <p className="text-danger text-[13px]">{fieldError}</p> : null}

            <button
              type="submit"
              disabled={registerComplete.isPending}
              className={cn(
                "bg-gold-grad text-ink-ongold mt-2 flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold",
                registerComplete.isPending && "opacity-60",
              )}
            >
              {selfSignup ? "Далее" : registerComplete.isPending ? "Создаём…" : "Создать аккаунт"}
            </button>
          </form>
        </div>
      ) : null}

      {step === "about" ? (
        <div data-testid="register-about-step">
          <p className="text-ink-3 mt-[18px] text-[11px] font-bold tracking-[0.08em] uppercase">
            Шаг 3 из 3
          </p>
          <h1 className="mt-1 text-[23px] font-extrabold tracking-[-0.02em]">Чтобы вас узнали</h1>
          <p className="text-ink-2 mt-1.5 max-w-[320px] text-sm">
            По этим ответам менеджер откроет доступ к кассе. Можно пропустить — тогда он спросит в
            диалоге.
          </p>

          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void createAccount();
            }}
          >
            <label className="text-ink-2 text-[13px] font-semibold" htmlFor="register-real-name">
              Как вас зовут
            </label>
            <input
              id="register-real-name"
              aria-label="Как вас зовут"
              placeholder="Иван"
              className="tracker-input"
              autoComplete="name"
              enterKeyHint="next"
              maxLength={120}
              value={realName}
              onFocus={keepVisible}
              onChange={(event) => setRealName(event.target.value)}
            />

            <label
              className="text-ink-2 mt-2 text-[13px] font-semibold"
              htmlFor="register-play-nick"
            >
              Ник в покерном приложении
            </label>
            <input
              id="register-play-nick"
              aria-label="Ник в покерном приложении"
              placeholder="Под каким ником играете"
              className="tracker-input"
              enterKeyHint="next"
              maxLength={64}
              value={playNickname}
              onFocus={keepVisible}
              onChange={(event) => setPlayNickname(event.target.value)}
            />

            <label className="text-ink-2 mt-2 text-[13px] font-semibold" htmlFor="register-source">
              Откуда узнали о клубе
            </label>
            <input
              id="register-source"
              aria-label="Откуда узнали о клубе"
              placeholder="Друг, турнир, Telegram…"
              className="tracker-input"
              enterKeyHint="done"
              maxLength={64}
              value={source}
              onFocus={keepVisible}
              onChange={(event) => setSource(event.target.value)}
            />

            {fieldError ? <p className="text-danger text-[13px]">{fieldError}</p> : null}

            {moderatedSignup ? (
              <p className="text-ink-3 text-[12.5px]">
                Расписание откроется сразу. Касса и привязка аккаунтов — после того, как менеджер
                подтвердит заявку; он напишет вам в диалоге.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={registerComplete.isPending}
              className={cn(
                "bg-gold-grad text-ink-ongold mt-2 flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold",
                registerComplete.isPending && "opacity-60",
              )}
            >
              {registerComplete.isPending ? "Создаём…" : "Создать аккаунт"}
            </button>
            <button
              type="button"
              disabled={registerComplete.isPending}
              className="text-ink-3 h-10 text-[13px] font-bold"
              onClick={() => void createAccount(false)}
            >
              Пропустить
            </button>
          </form>
        </div>
      ) : null}
    </AuthShell>
  );
}
