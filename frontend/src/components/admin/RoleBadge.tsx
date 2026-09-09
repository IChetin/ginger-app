import type { UserRole } from "@/api/types/auth";
import { cn } from "@/lib/utils";

const ROLE_META: Record<UserRole, { label: string; className: string; withDot?: boolean }> = {
  admin: {
    label: "Администратор",
    className: "border border-line-gold bg-gold-soft text-gold",
    withDot: true,
  },
  editor: {
    label: "Редактор",
    className: "bg-info-soft text-info",
    withDot: true,
  },
  user: {
    label: "Пользователь",
    className: "bg-surface-3 text-ink-3",
  },
};

export function roleLabel(role: UserRole): string {
  return ROLE_META[role].label;
}

interface Props {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className }: Props) {
  const meta = ROLE_META[role];
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full px-[11px] text-xs font-bold whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.withDot ? <span className="size-[5px] rounded-full bg-current" /> : null}
      {meta.label}
    </span>
  );
}
