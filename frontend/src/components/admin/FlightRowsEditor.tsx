import { cn } from "@/lib/utils";

export const adminInputClass =
  "h-[38px] w-full rounded-[10px] border border-line-strong bg-surface-2 px-[11px] text-sm text-ink outline-none focus:border-gold";

export interface FlightRowValue {
  id?: string;
  label: string;
  date: string;
  time: string;
}

interface Props {
  rows: FlightRowValue[];
  onChange: (rows: FlightRowValue[]) => void;
  className?: string;
}

export function FlightRowsEditor({ rows, onChange, className }: Props) {
  function updateRow(index: number, patch: Partial<FlightRowValue>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, { label: "", date: "", time: "" }]);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((row, index) => (
        <div key={row.id ?? `new-${index}`} className="flex items-center gap-2.5">
          <input
            value={row.label}
            onChange={(event) => updateRow(index, { label: event.target.value })}
            placeholder="Day 1A"
            className={cn(adminInputClass, "max-w-[100px]")}
            aria-label={`Метка флайта ${index + 1}`}
          />
          <input
            type="date"
            value={row.date}
            onChange={(event) => updateRow(index, { date: event.target.value })}
            className={cn(adminInputClass, "num")}
            aria-label={`Дата флайта ${index + 1}`}
          />
          <input
            type="time"
            value={row.time}
            onChange={(event) => updateRow(index, { time: event.target.value })}
            className={cn(adminInputClass, "num max-w-[90px]")}
            aria-label={`Время флайта ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={rows.length <= 1}
            title="Удалить флайт"
            className={cn(
              "border-line-strong text-ink-2 inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-transparent",
              "hover:enabled:bg-surface-2 hover:enabled:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <svg
              className="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink mt-1.5 inline-flex h-8 w-fit items-center justify-center rounded-[8px] border bg-transparent px-[11px] text-[13px] font-bold"
      >
        + Флайт
      </button>
    </div>
  );
}
