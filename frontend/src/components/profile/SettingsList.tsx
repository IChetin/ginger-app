import { Link } from "react-router-dom";

type IconName = "mail" | "telegram" | "shield" | "theme" | "list";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    mail: (
      <>
        <path d="M4 8l8 6 8-6" />
        <rect x="4" y="5" width="16" height="14" rx="2" />
      </>
    ),
    telegram: <path d="M21 4 3 11l6 2 2 6 3.5-4.5L19 17z" />,
    shield: <path d="M12 3l7 4v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V7z" />,
    theme: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </>
    ),
    list: <path d="M4 6h16M4 12h16M4 18h16" />,
  };
  return (
    <span className="bg-surface-3 text-gold flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]">
      <svg
        className="h-[18px] w-[18px] fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {paths[name]}
      </svg>
    </span>
  );
}

function Chevron() {
  return (
    <svg
      className="stroke-ink-3 h-4 w-4 shrink-0 fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-4 mt-4">
      <h2 className="text-ink-3 mb-2 text-[13px] font-bold tracking-[0.06em] uppercase">{title}</h2>
      <div className="border-line bg-surface overflow-hidden rounded-md border">{children}</div>
    </section>
  );
}

const rowClass =
  "flex w-full items-center gap-2.5 border-t border-line px-3 py-3.5 text-left first:border-t-0";

export function SettingsList({
  themeLabel,
  scheduleViewLabel,
  pushEnabled,
  pushPending,
  hasPassword,
  onTheme,
  onScheduleView,
  onPassword,
  onPushChange,
  supportUrl,
  staffEntry = null,
}: {
  themeLabel: string;
  scheduleViewLabel: string;
  pushEnabled: boolean;
  pushPending: boolean;
  hasPassword: boolean;
  /** null — пункт «Поддержка в Telegram» скрыт. */
  supportUrl: string | null;
  staffEntry?: { subtitle: string } | null;
  onTheme: () => void;
  onScheduleView: () => void;
  onPassword: () => void;
  onPushChange: (enabled: boolean) => void;
}) {
  return (
    <>
      {staffEntry ? (
        <Group title="Служебное">
          <Link to="/admin" className={rowClass}>
            <Icon name="shield" />
            <span className="text-ink min-w-0 flex-1 text-[14px] leading-[1.35] font-semibold">
              Админка
              <span className="text-ink-3 mt-px block text-[12px] font-normal">
                {staffEntry.subtitle}
              </span>
            </span>
            <Chevron />
          </Link>
        </Group>
      ) : null}

      <Group title="Уведомления">
        <label className={rowClass}>
          <Icon name="mail" />
          <span className="text-ink min-w-0 flex-1 text-[14px] leading-[1.35] font-semibold">
            Push-уведомления
            <span className="text-ink-3 mt-px block text-[12px] font-normal">
              На этом устройстве
            </span>
          </span>
          <span className="relative h-7 w-12 shrink-0">
            <input
              type="checkbox"
              aria-label="Push-уведомления"
              checked={pushEnabled}
              disabled={pushPending}
              className="peer sr-only"
              onChange={(event) => onPushChange(event.target.checked)}
            />
            <span className="bg-surface-3 peer-checked:bg-gold-grad absolute inset-0 cursor-pointer rounded-full transition-colors" />
            <span className="bg-knob shadow-knob pointer-events-none absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </Group>

      <Group title="Оформление">
        <button type="button" className={rowClass} onClick={onTheme}>
          <Icon name="theme" />
          <span className="text-ink min-w-0 flex-1 text-[14px] leading-[1.35] font-semibold">
            Тема
            <span className="text-ink-3 mt-px block text-[12px] font-normal">
              На этом устройстве
            </span>
          </span>
          <span className="text-ink-2 text-[13px] font-semibold">{themeLabel}</span>
          <Chevron />
        </button>
        <button type="button" className={rowClass} onClick={onScheduleView}>
          <Icon name="list" />
          <span className="text-ink min-w-0 flex-1 text-[14px] leading-[1.35] font-semibold">
            Вид расписания
            <span className="text-ink-3 mt-px block text-[12px] font-normal">
              Карточки или таблица турниров
            </span>
          </span>
          <span className="text-ink-2 text-[13px] font-semibold">{scheduleViewLabel}</span>
          <Chevron />
        </button>
      </Group>

      <Group title="Аккаунт">
        <button type="button" className={rowClass} onClick={onPassword}>
          <Icon name="shield" />
          <span className="text-ink min-w-0 flex-1 text-[14px] leading-[1.35] font-semibold">
            {hasPassword ? "Изменить пароль" : "Задать пароль"}
            <span className="text-ink-3 mt-px block text-[12px] font-normal">
              Чтобы входить быстрее, без письма
            </span>
          </span>
          <Chevron />
        </button>
      </Group>

      <Group title="О приложении">
        {supportUrl ? (
          <a href={supportUrl} target="_blank" rel="noreferrer" className={rowClass}>
            <Icon name="telegram" />
            <span className="text-ink flex-1 text-[15px] font-semibold">Поддержка в Telegram</span>
            <Chevron />
          </a>
        ) : null}
        <Link to="/privacy" className={rowClass}>
          <Icon name="shield" />
          <span className="text-ink flex-1 text-[15px] font-semibold">
            Политика конфиденциальности
          </span>
          <Chevron />
        </Link>
      </Group>
    </>
  );
}
