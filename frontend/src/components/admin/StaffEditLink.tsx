import { Link } from "react-router-dom";

import { useIsStaff } from "@/features/auth/useIsStaff";
import { cn } from "@/lib/utils";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  to: string;
  className?: string;
  "aria-label"?: string;
};

/** Pencil → admin. Renders nothing for non-staff (and while /me loads). */
export function StaffEditLink({
  to,
  className,
  "aria-label": ariaLabel = "Редактировать в админке",
}: Props) {
  const isStaff = useIsStaff();
  if (!isStaff) {
    return null;
  }

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={cn("text-gold inline-flex items-center justify-center", className)}
    >
      <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      </svg>
    </Link>
  );
}
