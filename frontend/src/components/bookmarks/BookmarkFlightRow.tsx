import { Link } from "react-router-dom";

import type { BookmarkListItem } from "@/api/types/bookmarks";
import {
  formatCountdownChip,
  formatFlightBookmarkMeta,
  formatFlightBookmarkTitle,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import { formatReminderOffsetsPhrase } from "@/features/bookmarks/lib/reminderPresets";
import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";
import { cn } from "@/lib/utils";

type Props = {
  item: BookmarkListItem;
  showIntervals?: boolean;
  onOpenIntervals?: () => void;
  onDisable: () => void;
};

const iconClass =
  "h-[18px] w-[18px] stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function BookmarkFlightRow({
  item,
  showIntervals = true,
  onOpenIntervals,
  onDisable,
}: Props) {
  const nearest = item.nearest_start_at;
  const chip = nearest ? formatCountdownChip(nearest.utc, nearest.venue_timezone) : null;
  const href = resolveNotificationClickUrl(item.url);

  return (
    <article
      className="border-line bg-surface flex items-start gap-3 rounded-md border p-3.5"
      data-testid="bookmark-flight-row"
    >
      {chip ? (
        <span
          className={cn(
            "num border-line-strong bg-surface-3 text-gold inline-flex h-[46px] min-w-[46px] shrink-0 flex-col items-center justify-center rounded-[12px] border px-2 text-[12px] leading-[1.15] font-extrabold",
            chip.soon &&
              "bg-gold-grad text-ink-ongold shadow-sheen-soft -rotate-[2deg] border-transparent",
          )}
        >
          {chip.kind === "hours" ? (
            chip.primary
          ) : (
            <>
              {chip.primary}
              <span className="text-ink-3 text-[9px]">{chip.secondary}</span>
            </>
          )}
        </span>
      ) : (
        <span className="border-line-strong bg-surface-3 text-ink-3 inline-flex h-[46px] min-w-[46px] shrink-0 items-center justify-center rounded-[12px] border text-[12px] font-extrabold">
          —
        </span>
      )}

      <div className="min-w-0 flex-1">
        <Link to={href} className="text-ink hover:text-gold block text-[15px] font-bold">
          {formatFlightBookmarkTitle(item)}
        </Link>
        <p className="num text-ink-2 mt-0.5 text-[12px]">{formatFlightBookmarkMeta(item)}</p>
        {showIntervals ? (
          <button
            type="button"
            className="border-line-gold bg-gold-soft text-gold mt-2 inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold"
            onClick={onOpenIntervals}
          >
            <svg className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            {formatReminderOffsetsPhrase(item.reminder_offsets)}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Отключить напоминание"
        className="bg-gold-soft text-gold inline-flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-md"
        onClick={onDisable}
      >
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z" fill="currentColor" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      </button>
    </article>
  );
}
