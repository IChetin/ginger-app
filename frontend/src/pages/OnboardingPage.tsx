import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { InstallSteps } from "@/features/onboarding/InstallSteps";
import { isStandalone, markOnboardingDone } from "@/features/onboarding/platform";
import { isPushSupported, usePushSubscription, useSubscribePush } from "@/features/push/hooks";
import { pushErrorMessage } from "@/features/push/lib/pushErrorMessage";

type Step = "welcome" | "install" | "notifications";

/**
 * Онбординг после регистрации (экраны §3.1): что это → установка на экран → уведомления.
 * PIN из черновика не нужен: вход по коду из письма (решение 2026-09-09).
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const push = usePushSubscription();
  const subscribe = useSubscribePush();

  const finish = () => {
    markOnboardingDone();
    navigate("/", { replace: true });
  };
  const next = () => {
    if (step === "welcome") setStep(isStandalone() ? "notifications" : "install");
    else if (step === "install") setStep("notifications");
    else finish();
  };

  return (
    <main
      className="bg-bg text-ink mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-4 pt-8 pb-6"
      data-testid="onboarding"
    >
      <div className="flex-1">
        {step === "welcome" ? (
          <>
            <img src="/icons/ginger-mark-96.png" alt="" className="h-16 w-16 rounded-full" />
            <h1 className="mt-4 text-[26px] leading-tight font-extrabold tracking-tight">
              Ginger — фишки, расписание, связь
            </h1>
            <ul className="text-ink-2 mt-3 space-y-1.5 text-[15px]">
              <li>♣ Фишки в клубы — заявкой в пару касаний</li>
              <li>🏆 Турниры всех клубов с напоминаниями</li>
              <li>💬 Вопросы менеджеру без Telegram</li>
            </ul>
          </>
        ) : null}

        {step === "install" ? (
          <>
            <h1 className="text-[23px] font-extrabold tracking-tight">Поставьте Ginger на экран</h1>
            <p className="text-ink-2 mt-1.5 mb-3 text-[14px]">
              Как обычное приложение: открывается с иконки, работает без Telegram, присылает
              уведомления.
            </p>
            <InstallSteps />
          </>
        ) : null}

        {step === "notifications" ? (
          <>
            <h1 className="text-[23px] font-extrabold tracking-tight">Уведомления</h1>
            <p className="text-ink-2 mt-1.5 text-[15px]">
              Чтобы узнать, что фишки выданы, реквизиты пришли или турнир вот-вот начнётся. Рекламы
              и рассылок не будет.
            </p>
            {push.data ? (
              <p className="border-live/35 bg-live-soft mt-3 rounded-md border px-3 py-2.5 text-[14px] font-semibold">
                Уведомления включены
              </p>
            ) : isPushSupported() ? (
              <button
                type="button"
                disabled={subscribe.isPending}
                onClick={() =>
                  void subscribe
                    .mutateAsync()
                    .then(finish)
                    .catch(() => undefined)
                }
                className="bg-gold-grad text-ink-ongold mt-4 h-12 w-full rounded-md text-[15px] font-bold disabled:opacity-45"
              >
                Разрешить уведомления
              </button>
            ) : (
              <p className="border-line bg-surface text-ink-2 mt-3 rounded-md border px-3 py-2.5 text-[14px]">
                Здесь уведомления не работают. На iPhone они приходят только в приложении,
                установленном на экран «Домой».
              </p>
            )}
            {subscribe.isError ? (
              <p role="alert" className="text-danger mt-2 text-[13px] font-semibold">
                {pushErrorMessage(subscribe.error)}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-6 flex gap-2">
        {step !== "welcome" ? (
          <button
            type="button"
            onClick={next}
            className="text-ink-3 h-12 flex-1 rounded-md text-[15px] font-bold"
          >
            {step === "notifications" ? "Позже" : "Пропустить"}
          </button>
        ) : null}
        {step !== "notifications" || push.data ? (
          <button
            type="button"
            onClick={next}
            className="bg-gold-grad text-ink-ongold h-12 flex-[1.5] rounded-md text-[15px] font-bold"
          >
            {step === "notifications" ? "В приложение" : "Дальше"}
          </button>
        ) : null}
      </div>
    </main>
  );
}
