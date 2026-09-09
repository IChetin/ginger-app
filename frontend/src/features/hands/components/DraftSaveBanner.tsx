import type { DraftSaveVisible } from "@/features/hands/lib/useDraftSaveIndicator";
import { cn } from "@/lib/utils";

export function DraftSaveBanner({
  status,
  onRetry,
  placement = "header",
}: {
  status: DraftSaveVisible;
  onRetry: () => void;
  placement?: "header" | "sticky";
}) {
  if (status === "hidden") return null;
  const sticky = placement === "sticky";
  return (
    <div
      data-testid="draft-save-status"
      data-status={status}
      className={cn(
        "pointer-events-none z-30 flex justify-center px-3",
        sticky ? "fixed inset-x-0" : "absolute inset-x-0 top-full",
      )}
      style={sticky ? { top: "var(--sticky-h, 3.25rem)" } : undefined}
    >
      {status === "error" ? (
        <button
          type="button"
          data-testid="draft-save-retry"
          className="pointer-events-auto mt-1 rounded-full border border-[rgba(232,93,93,0.35)] bg-[#2A1212] px-2.5 py-1 text-[11.5px] font-extrabold text-[#F0A8A8]"
          onClick={onRetry}
        >
          Не удалось сохранить · Повторить
        </button>
      ) : (
        <p className="bg-surface-2/95 text-ink-3 border-line mt-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold">
          {status === "offline" ? "Офлайн · сохранено на устройстве" : "Сохраняется…"}
        </p>
      )}
    </div>
  );
}
