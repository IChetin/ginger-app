import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const iconClass =
  "h-[22px] w-[22px] stroke-current fill-none [stroke-width:1.4] [stroke-linecap:round] [stroke-linejoin:round]";

function IconHome() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconChips() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

function IconDialogs() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: () => JSX.Element;
  /** Префиксы путей, на которых пункт подсвечен; пустой список — только точный путь. */
  sections: string[];
};

// Четыре пункта — больше на телефон не помещается без потери читаемости (экраны §1).
const items: NavItem[] = [
  { to: "/", label: "Главная", icon: IconHome, sections: [] },
  { to: "/chips", label: "Фишки", icon: IconChips, sections: ["/chips"] },
  { to: "/dialogs", label: "Диалоги", icon: IconDialogs, sections: ["/dialogs"] },
  {
    to: "/more",
    label: "Ещё",
    icon: IconMore,
    sections: ["/more", "/tournaments", "/cash", "/clubs", "/profile", "/referral", "/offline"],
  },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.sections.length === 0) return pathname === item.to;
  return item.sections.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Открытая переписка: /dialogs/<id>, но не список и не «Написать».
const THREAD_PATH = /^\/dialogs\/(?!new$)[^/]+$/;

export function BottomNav({ dialogsUnread = 0 }: { dialogsUnread?: number }) {
  const { pathname } = useLocation();

  // Внутри переписки меню не показываем — как в мессенджерах, низ экрана отдан полю ввода.
  if (THREAD_PATH.test(pathname)) {
    return null;
  }

  // Ар-деко: меню прибито к низу, сверху двойная золотая линия, активный пункт — золото и ромб.
  return (
    <nav
      data-mobile-nav
      className={cn(
        "fixed bottom-0 left-1/2 z-30 flex w-full max-w-[420px] -translate-x-1/2",
        "bg-bg border-t border-[var(--frame-outer)] px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))]",
        "shadow-[inset_0_3px_0_var(--bg),inset_0_4px_0_var(--frame-inner)]",
      )}
      aria-label="Основная навигация"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(pathname, item);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-0 pt-1.5 pb-1",
              "text-ink-3 font-display text-[9.5px] font-semibold tracking-[0.16em] uppercase",
              active && "text-gold",
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.to === "/dialogs" && dialogsUnread > 0 ? (
              <span className="num bg-gold-grad text-ink-ongold absolute top-0.5 right-[calc(50%-22px)] flex h-4 min-w-4 items-center justify-center rounded-none px-1 text-[10px] font-extrabold tracking-normal">
                {dialogsUnread}
              </span>
            ) : null}
            <Icon />
            {item.label}
            <span
              aria-hidden="true"
              className={cn("h-[5px] w-[5px] rotate-45", active ? "bg-gold" : "bg-transparent")}
            />
          </Link>
        );
      })}
    </nav>
  );
}
