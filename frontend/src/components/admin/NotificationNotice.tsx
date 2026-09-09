import type { NotificationPreviewImpact } from "@/api/types/notifications";
import { cn } from "@/lib/utils";

interface Props {
  impacts: NotificationPreviewImpact[];
  totalRecipients: number;
  notify: boolean;
  onNotifyChange: (value: boolean) => void;
  className?: string;
}

export function NotificationNotice({
  impacts,
  totalRecipients,
  notify,
  onNotifyChange,
  className,
}: Props) {
  const headline =
    totalRecipients > 0
      ? `${totalRecipients.toLocaleString("ru-RU")} подписчиков получат уведомление`
      : "Подписчиков нет — рассылка никого не затронет";

  return (
    <div
      className={cn(
        "border-warn/30 bg-warn-soft mt-3.5 flex gap-2.5 rounded-[10px] border p-3 text-[13px]",
        className,
      )}
      role="status"
    >
      <svg
        className="text-warn mt-0.5 size-[18px] shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
      <div className="min-w-0 flex-1">
        <b className="mb-0.5 block font-bold">{headline}</b>
        {impacts.length > 0 ? (
          <ul className="text-ink-2 mt-1.5 list-disc space-y-1 pl-4 text-xs">
            {impacts.map((impact) => (
              <li key={`${impact.type}-${impact.title}-${impact.body}`}>
                «{impact.title}
                {impact.body ? `: ${impact.body}` : ""}»
              </li>
            ))}
          </ul>
        ) : null}
        <label className="mt-2 flex cursor-pointer items-center gap-[7px] text-xs font-semibold">
          <input
            type="checkbox"
            checked={notify}
            onChange={(event) => onNotifyChange(event.target.checked)}
            className="accent-[var(--gold)]"
            disabled={totalRecipients === 0}
          />
          Отправить уведомление подписчикам
        </label>
      </div>
    </div>
  );
}
