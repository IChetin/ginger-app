import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { NotificationListItem } from "@/api/types/notifications";
import { StickyHeader } from "@/components/layout/StickyHeader";
import {
  formatHistoryTime,
  groupHistoryByLocalDay,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import {
  useInfiniteNotifications,
  useMarkNotificationsRead,
  useUnreadNotificationCount,
} from "@/features/notifications/hooks";
import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";
import { cn } from "@/lib/utils";

type Tab = "all" | "reminders" | "changes" | "unread";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "Все" },
  { id: "reminders", label: "Напоминания" },
  { id: "changes", label: "Изменения" },
  { id: "unread", label: "Непрочитанные" },
];

function parseTab(value: string | null): Tab {
  if (value === "reminders" || value === "changes" || value === "unread") {
    return value;
  }
  return "all";
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconWarn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function IconCancel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconPublish({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

type IconKind = "reminder" | "change" | "cancel" | "publish";

function iconKind(type: string): IconKind {
  switch (type) {
    case "reminder":
    case "series_starting":
      return "reminder";
    case "event_cancelled":
    case "series_cancelled":
      return "cancel";
    case "schedule_published":
      return "publish";
    default:
      return "change";
  }
}

function NotificationIcon({ type }: { type: string }) {
  const kind = iconKind(type);
  const iconClass = "h-[17px] w-[17px] stroke-current fill-none [stroke-width:1.8]";
  if (kind === "reminder") {
    return (
      <span className="bg-gold-grad text-ink-ongold flex h-9 w-9 shrink-0 -rotate-[4deg] items-center justify-center rounded-[11px] text-[14px] font-extrabold">
        2
      </span>
    );
  }
  if (kind === "cancel") {
    return (
      <span className="bg-danger-soft text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]">
        <IconCancel className={iconClass} />
      </span>
    );
  }
  if (kind === "publish") {
    return (
      <span className="bg-info-soft text-info flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]">
        <IconPublish className={iconClass} />
      </span>
    );
  }
  const ChangeIcon = type === "guarantee_changed" ? IconWarn : IconClock;
  return (
    <span className="bg-warn-soft text-warn flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]">
      <ChangeIcon className={iconClass} />
    </span>
  );
}

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const markRead = useMarkNotificationsRead();
  const unreadCount = useUnreadNotificationCount();
  const markedOnOpen = useRef(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const filters = useMemo(() => {
    if (tab === "reminders") {
      return { type: "reminders" as const };
    }
    if (tab === "changes") {
      return { type: "changes" as const };
    }
    if (tab === "unread") {
      return { unread_only: true };
    }
    return {};
  }, [tab]);

  const list = useInfiniteNotifications(filters);
  const items = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  );
  const groups = useMemo(
    () =>
      groupHistoryByLocalDay(
        items.map((item) => ({
          ...item,
          created_at: item.sent_at ?? new Date(0).toISOString(),
        })),
      ),
    [items],
  );

  useEffect(() => {
    markedOnOpen.current = false;
  }, [tab]);

  useEffect(() => {
    if (markedOnOpen.current || items.length === 0) {
      return;
    }
    const unreadIds = items.filter((item) => item.is_unread).map((item) => item.id);
    if (unreadIds.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      markedOnOpen.current = true;
      markRead.mutate({ ids: unreadIds });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [items, markRead]);

  useEffect(() => {
    if (!list.hasNextPage || !sentinel.current || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        void list.fetchNextPage();
      }
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.fetchNextPage, items.length]);

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true });
  };

  const hasUnread = (unreadCount.data?.count ?? 0) > 0;

  return (
    <div className="bg-bg flex min-h-screen flex-col" data-testid="notifications-page">
      <StickyHeader
        compactible={false}
        title={<span className="text-[21px] font-extrabold tracking-[-0.01em]">Уведомления</span>}
        actions={
          <>
            {hasUnread ? (
              <button
                type="button"
                className="text-gold whitespace-nowrap text-[13px] font-bold"
                onClick={() => markRead.mutate({ all: true })}
              >
                Прочитать всё
              </button>
            ) : null}
            <Link
              to="/profile"
              className="bg-surface-2 text-ink-2 inline-flex h-9 w-9 items-center justify-center rounded-[11px]"
              aria-label="Настройки уведомлений"
            >
              <IconSettings className="h-[18px] w-[18px] stroke-current fill-none [stroke-width:1.8]" />
            </Link>
          </>
        }
      />

      <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "border-line-strong bg-surface text-ink-2 h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold",
              tab === item.id && "bg-gold-soft border-line-gold text-gold",
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {list.isLoading ? (
          <div className="space-y-2 px-4 pt-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface-3 h-16 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : null}

        {!list.isLoading && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-[30px] py-16 text-center">
            <div className="text-[16px] font-bold">Пока нет уведомлений</div>
            <div className="text-ink-2 text-[13.5px]">
              Они появятся, когда вы добавите серию или турнир в закладки — напомним о старте и
              сообщим об изменениях
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.key}>
            <div className="text-ink-3 px-4 pt-4 pb-1.5 text-[12px] font-bold">{group.label}</div>
            {group.items.map((item, index) => (
              <NotificationRow
                key={item.id}
                item={item}
                showSep={index < group.items.length - 1}
              />
            ))}
          </section>
        ))}

        <div ref={sentinel} className="h-4" />
        {list.isFetchingNextPage ? (
          <div className="text-ink-3 py-3 text-center text-[12px]">Загрузка…</div>
        ) : null}
      </div>
    </div>
  );
}

function NotificationRow({
  item,
  showSep,
}: {
  item: NotificationListItem & { created_at?: string };
  showSep: boolean;
}) {
  const when = item.sent_at ?? item.created_at ?? "";
  const href = resolveNotificationClickUrl(item.url);
  return (
    <>
      <Link
        to={href}
        className={cn(
          "relative flex items-start gap-3 px-4 py-3",
          item.is_unread && "bg-gold-soft",
          item.is_unread &&
            "before:bg-gold before:absolute before:top-1/2 before:left-1.5 before:h-[5px] before:w-[5px] before:-translate-y-1/2 before:rounded-full",
        )}
        data-testid="notification-item"
        data-type={item.type}
        data-unread={item.is_unread ? "1" : "0"}
      >
        <NotificationIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-bold">{item.title}</div>
          <div className="num text-ink-2 mt-px text-[12.5px]">{item.body}</div>
          {item.diff ? (
            <div className="bg-surface-3 num mt-1.5 inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-0.5 text-[12px]">
              <span className="text-ink-3 line-through">{item.diff.old}</span>
              <span className="text-gold">→</span>
              <span>{item.diff.new}</span>
            </div>
          ) : null}
        </div>
        {when ? (
          <span className="num text-ink-3 shrink-0 pt-0.5 text-[11px]">{formatHistoryTime(when)}</span>
        ) : null}
      </Link>
      {showSep ? <div className="bg-line mx-4 h-px" /> : null}
    </>
  );
}
