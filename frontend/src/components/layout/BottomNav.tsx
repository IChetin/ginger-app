import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const iconClass =
  "h-[22px] w-[22px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

function IconSeries() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M3 9h18M8 13h3M8 17h6" />
    </svg>
  );
}

function IconBookmarks() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  );
}

function IconTracker() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19h16M6 16l4-5 3 3 5-7" />
    </svg>
  );
}

const items = [
  { to: "/", label: "Серии", icon: IconSeries, match: "series" as const },
  { to: "/calendar", label: "Календарь", icon: IconCalendar, match: "exact" as const },
  { to: "/bookmarks", label: "Закладки", icon: IconBookmarks, match: "exact" as const },
  { to: "/tracker", label: "Трекер", icon: IconTracker, match: "prefix" as const },
];

function isItemActive(pathname: string, item: (typeof items)[number]): boolean {
  if (item.match === "series") {
    return pathname === "/" || pathname.startsWith("/series/");
  }
  if (item.match === "prefix") {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
  return pathname === item.to;
}

export function BottomNav({
  bookmarkCount = 0,
  liveActive = false,
}: {
  bookmarkCount?: number;
  liveActive?: boolean;
}) {
  const { pathname } = useLocation();

  return (
    <nav
      data-mobile-nav
      className={cn(
        "fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-32px)] max-w-[388px] -translate-x-1/2",
        "border-line-strong bg-surface/92 shadow-elevated rounded-lg border p-1.5 backdrop-blur-[12px]",
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
              "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-0 py-2",
              "text-ink-3 text-[10px] font-bold",
              active && "bg-gold-soft text-gold",
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.to === "/bookmarks" && bookmarkCount > 0 ? (
              <span className="num bg-gold-grad text-ink-ongold absolute top-1 right-[calc(50%-20px)] flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold">
                {bookmarkCount}
              </span>
            ) : null}
            {item.to === "/tracker" && liveActive ? (
              <span
                className="bg-live absolute top-[5px] right-[calc(50%-15px)] h-[7px] w-[7px] animate-pulse rounded-full"
                aria-label="Идёт турнир"
              />
            ) : null}
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
