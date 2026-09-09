import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "live" | "soon" | "announced" | "muted";

const variantClass: Record<StatusBadgeVariant, string> = {
  live: "bg-live-soft text-live",
  soon: "bg-gold-soft text-gold",
  announced: "bg-info-soft text-info",
  muted: "bg-surface-2 text-ink-3",
};

export function StatusBadge({
  variant,
  children,
  pulse = false,
}: {
  variant: StatusBadgeVariant;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
        variantClass[variant],
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-day2-pulse")}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
