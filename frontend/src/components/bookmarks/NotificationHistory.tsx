import { Link } from "react-router-dom";

import type { NotificationHistoryItem } from "@/api/types/notifications";
import {
  formatHistoryTime,
  groupHistoryByLocalDay,
  notificationIconGlyph,
  notificationIconVariant,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";
import { cn } from "@/lib/utils";

type Props = {
  items: NotificationHistoryItem[];
};

const variantClass = {
  gold: "bg-gold-grad text-ink-ongold -rotate-[4deg] shadow-sheen",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
} as const;

export function NotificationHistory({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-ink-2 px-4 py-8 text-center text-[13px]" data-testid="history-empty">
        За последние 30 дней уведомлений не было.
      </p>
    );
  }

  const groups = groupHistoryByLocalDay(items);

  return (
    <div data-testid="notification-history">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="text-ink-3 mx-4 mt-[18px] mb-2 text-[13px] font-bold tracking-[0.06em] uppercase">
            {group.label}
          </h3>
          <div>
            {group.items.map((item, index) => {
              const variant = notificationIconVariant(item.type);
              const when = item.sent_at ?? item.created_at;
              const href = resolveNotificationClickUrl(item.url);
              return (
                <Link
                  key={item.id}
                  to={href}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3",
                    index > 0 && "border-line border-t",
                  )}
                  data-testid="history-item"
                  data-type={item.type}
                >
                  <span
                    className={cn(
                      "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[14px] font-extrabold",
                      variantClass[variant],
                    )}
                  >
                    {notificationIconGlyph(item.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink text-[14px] font-bold">{item.title}</div>
                    <div className="num text-ink-2 mt-px text-[12px]">{item.body}</div>
                  </div>
                  <span className="num text-ink-3 shrink-0 pt-0.5 text-[11px]">
                    {formatHistoryTime(when)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
