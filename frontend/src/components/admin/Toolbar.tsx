import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: Props) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2.5", className)}>{children}</div>
  );
}

export function ToolbarSpacer({ className }: { className?: string }) {
  return <div className={cn("flex-1", className)} />;
}

export function ToolbarHint({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("num text-ink-3 text-[11px]", className)}>{children}</span>;
}
