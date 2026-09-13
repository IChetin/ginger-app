import { useState } from "react";

import {
  canPromptInstall,
  detectPlatform,
  isStandalone,
  promptInstall,
} from "@/features/onboarding/platform";

function Step({ number, title, hint }: { number: number; title: string; hint: string }) {
  return (
    <li className="border-line bg-surface flex gap-3 rounded-md border p-3.5">
      <span className="bg-gold-soft text-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-extrabold">
        {number}
      </span>
      <span>
        <b className="block text-[15px]">{title}</b>
        <span className="text-ink-2 text-[13px]">{hint}</span>
      </span>
    </li>
  );
}

/** Как поставить Ginger на домашний экран — под ОС игрока. */
export function InstallSteps() {
  const platform = detectPlatform();
  const [installed, setInstalled] = useState(isStandalone());
  const [canPrompt] = useState(canPromptInstall());

  if (installed) {
    return (
      <p className="border-live/35 bg-live-soft text-ink rounded-md border px-3 py-2.5 text-[14px] font-semibold">
        Ginger уже на домашнем экране — уведомления будут приходить.
      </p>
    );
  }

  if (platform === "ios") {
    return (
      <ol className="space-y-2" data-testid="install-steps-ios">
        <Step
          number={1}
          title="Нажмите «Поделиться»"
          hint="Кнопка со стрелкой вверх в панели Safari"
        />
        <Step number={2} title="«На экран „Домой“»" hint="Прокрутите список вниз и подтвердите" />
        <Step
          number={3}
          title="Откройте Ginger с иконки"
          hint="Только так на iPhone приходят уведомления"
        />
      </ol>
    );
  }

  if (platform === "android") {
    return (
      <div className="space-y-2" data-testid="install-steps-android">
        {canPrompt ? (
          <button
            type="button"
            onClick={() => void promptInstall().then((accepted) => setInstalled(accepted))}
            className="bg-gold-grad text-ink-ongold h-12 w-full rounded-md text-[15px] font-bold"
          >
            Установить Ginger
          </button>
        ) : (
          <ol className="space-y-2">
            <Step
              number={1}
              title="Откройте меню ⋮"
              hint="Три точки в правом верхнем углу Chrome"
            />
            <Step
              number={2}
              title="«Установить приложение»"
              hint="Или «Добавить на главный экран» — и подтвердите"
            />
          </ol>
        )}
      </div>
    );
  }

  return (
    <p
      className="border-line bg-surface text-ink-2 rounded-md border px-3 py-2.5 text-[14px]"
      data-testid="install-steps-desktop"
    >
      Ginger — приложение для телефона. Откройте ссылку на телефоне и установите его на экран.
    </p>
  );
}
