import type { HandActionType } from "@/api/types/hands";
import {
  actionBadgeClass,
  actionTone,
  type ActionBadgeVariant,
} from "@/features/hands/lib/actionTone";
import { cn } from "@/lib/utils";

export function ActionBadge({
  action,
  variant = "inline",
  children,
  className,
}: {
  action: HandActionType;
  variant?: ActionBadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const tone = actionTone(action);
  return (
    <span
      data-testid="action-badge"
      data-action={action}
      data-tone={tone}
      data-variant={variant}
      className={cn("num whitespace-nowrap", actionBadgeClass(variant, tone), className)}
    >
      {children}
    </span>
  );
}
