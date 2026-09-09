import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  message?: string;
  onUndo: () => void;
  className?: string;
};

export function UndoToast({ open, message = "Закладка удалена", onUndo, className }: Props) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-[92px] left-1/2 z-40 flex w-[calc(100%-32px)] max-w-[388px] -translate-x-1/2",
        "border-line-strong bg-surface-2 shadow-elevated items-center justify-between gap-3 rounded-md border px-3.5 py-3",
        className,
      )}
      role="status"
      data-testid="undo-toast"
    >
      <span className="text-ink text-[13px] font-semibold">{message}</span>
      <button type="button" className="text-gold text-[13px] font-extrabold" onClick={onUndo}>
        Отменить
      </button>
    </div>
  );
}
