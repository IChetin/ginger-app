import { Link } from "react-router-dom";

import type { BookmarkListItem } from "@/api/types/bookmarks";
import {
  formatSeriesBookmarkMeta,
  organizerAbbrevFromSlug,
  seriesShowsSchedulePending,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import { resolveNotificationClickUrl } from "@/features/push/lib/notificationUrl";

type Props = {
  item: BookmarkListItem;
  /** When true, show the announce pending note (not the generic schedule pill). */
  showPendingNote?: boolean;
  onDisable: () => void;
};

const iconClass =
  "h-[18px] w-[18px] stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function BookmarkSeriesRow({ item, showPendingNote = true, onDisable }: Props) {
  const href = resolveNotificationClickUrl(item.url);
  const abbrev = organizerAbbrevFromSlug(item.organizer_slug, item.organizer_name);
  const pending = seriesShowsSchedulePending(item.series_status);

  return (
    <article
      className="border-line bg-surface flex items-start gap-3 rounded-md border p-3.5"
      data-testid="bookmark-series-row"
    >
      <span className="border-line-strong bg-surface-3 text-gold inline-flex h-[46px] min-w-[46px] shrink-0 items-center justify-center rounded-[12px] border px-2 text-[12px] font-extrabold">
        {abbrev}
      </span>

      <div className="min-w-0 flex-1">
        <Link to={href} className="text-ink hover:text-gold block text-[15px] font-bold">
          {item.series_name}
        </Link>
        <p className="num text-ink-2 mt-0.5 text-[12px]">{formatSeriesBookmarkMeta(item)}</p>
        {showPendingNote && pending ? (
          <span className="bg-info-soft text-info mt-2 inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold">
            <svg className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            сообщим, когда выйдет сетка
          </span>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Отключить"
        className="bg-gold-soft text-gold inline-flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-md"
        onClick={onDisable}
      >
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4h12v17l-6-4-6 4z" fill="currentColor" />
        </svg>
      </button>
    </article>
  );
}
