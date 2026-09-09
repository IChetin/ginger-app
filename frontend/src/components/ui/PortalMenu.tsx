import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { computeMenuPosition, stickyHeaderOffset } from "@/components/ui/portalMenuPosition";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function PortalMenu({
  open,
  onClose,
  anchorRef,
  children,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor) return;

    const place = () => {
      const next = computeMenuPosition(
        anchor.getBoundingClientRect(),
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        stickyHeaderOffset(),
      );
      menu.style.top = `${next.top}px`;
      menu.style.left = `${next.left}px`;
      menu.style.maxHeight = `${next.maxHeight}px`;
      menu.style.visibility = "visible";
    };

    menu.style.visibility = "hidden";
    place();
  }, [open, anchorRef, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      data-testid="portal-menu"
      className={cn(
        "border-line bg-surface-2 fixed z-40 flex min-w-[160px] flex-col overflow-y-auto rounded-md border py-1 text-[13px] font-semibold shadow-lg",
        className,
      )}
      style={{ top: 0, left: 0, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
