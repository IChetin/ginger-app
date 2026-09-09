import { cn } from "@/lib/utils";

interface Props {
  offset: number;
  limit: number;
  total: number;
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
  limitOptions?: number[];
  className?: string;
}

export function Pagination({
  offset,
  limit,
  total,
  onOffsetChange,
  onLimitChange,
  limitOptions = [20, 50, 100],
  className,
}: Props) {
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className={cn("mt-3.5 flex items-center gap-2.5", className)}>
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        className={adminGhostBtnClass}
      >
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Назад
      </button>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onOffsetChange(offset + limit)}
        className={adminGhostBtnClass}
      >
        Вперёд
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div className="flex-1" />
      <select
        value={limit}
        onChange={(event) => onLimitChange(Number(event.target.value))}
        className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
        aria-label="Размер страницы"
      >
        {limitOptions.map((option) => (
          <option key={option} value={option}>
            {option} на странице
          </option>
        ))}
      </select>
    </div>
  );
}

const adminGhostBtnClass = cn(
  "inline-flex h-[31px] items-center justify-center gap-1.5 rounded-[8px] border border-line-strong",
  "bg-transparent px-[11px] text-[13px] font-bold text-ink-2",
  "hover:bg-surface-2 hover:text-ink",
  "disabled:cursor-not-allowed disabled:opacity-45",
  "active:enabled:translate-y-px",
);
