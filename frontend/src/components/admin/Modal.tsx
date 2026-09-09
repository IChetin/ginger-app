import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  titleAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  titleAction,
  children,
  footer,
  className,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Закрыть"
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className={cn(
          "fixed top-1/2 left-1/2 z-[51] max-h-[88vh] w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
          "border-line-strong bg-surface rounded-[14px] border p-5",
          className,
        )}
      >
        <div className={cn("flex items-start gap-2", subtitle ? "mb-1" : "mb-4")}>
          <div id="admin-modal-title" className="min-w-0 flex-1 text-[17px] font-extrabold">
            {title}
          </div>
          {titleAction}
        </div>
        {subtitle ? <div className="text-ink-2 mb-4 text-[13px]">{subtitle}</div> : null}
        {children}
        {footer ? <div className="mt-[18px] flex w-full justify-end gap-2.5">{footer}</div> : null}
      </div>
    </>
  );
}
