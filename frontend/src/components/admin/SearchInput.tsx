import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Поиск",
  maxLength,
  className,
}: Props) {
  return (
    <label
      className={cn(
        "border-line-strong bg-surface text-ink-3 flex h-9 min-w-[300px] items-center gap-2 rounded-[10px] border px-3",
        className,
      )}
    >
      <svg
        className="size-[18px] shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="text-ink placeholder:text-ink-3 w-full bg-transparent text-sm outline-none"
      />
    </label>
  );
}
