import type { EventStatus, SeriesStatus } from "@/api/types/schedule";
import { SERIES_STATUS_LABELS } from "@/lib/statusLabels";
import { cn } from "@/lib/utils";

const SERIES_META: Record<SeriesStatus, { className: string; withDot?: boolean }> = {
  running: {
    className: "bg-live-soft text-live",
    withDot: true,
  },
  schedule_published: {
    className: "bg-gold-soft text-gold",
  },
  announced: {
    className: "bg-info-soft text-info",
  },
  finished: {
    className: "bg-surface-3 text-ink-3",
  },
  cancelled: {
    className: "bg-danger-soft text-danger",
  },
};

const EVENT_META: Record<EventStatus, { label: string; className: string; withDot?: boolean }> = {
  scheduled: {
    label: "Опубликован",
    className: "bg-gold-soft text-gold",
  },
  changed: {
    label: "Изменён",
    className: "bg-warn-soft text-warn",
    withDot: true,
  },
  cancelled: {
    label: "Отменён",
    className: "bg-danger-soft text-danger",
  },
};

interface SeriesProps {
  kind: "series";
  status: SeriesStatus;
  className?: string;
}

interface EventProps {
  kind: "event";
  status: EventStatus;
  className?: string;
}

type Props = SeriesProps | EventProps;

export function StatusBadge(props: Props) {
  const meta =
    props.kind === "series"
      ? { label: SERIES_STATUS_LABELS[props.status], ...SERIES_META[props.status] }
      : EVENT_META[props.status];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-[9px] text-[11px] font-bold whitespace-nowrap",
        meta.className,
        props.className,
      )}
    >
      {meta.withDot ? <span className="size-[5px] rounded-full bg-current" /> : null}
      {meta.label}
    </span>
  );
}
