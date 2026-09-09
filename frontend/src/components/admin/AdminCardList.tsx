import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminCardField {
  label: string;
  value: ReactNode;
}

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  fields?: AdminCardField[];
  badge?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
}

function CardBody({
  title,
  subtitle,
  fields,
  badge,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  fields: AdminCardField[];
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold">{title}</div>
          {subtitle ? <div className="text-ink-3 mt-0.5 text-xs">{subtitle}</div> : null}
        </div>
        {badge}
      </div>
      {fields.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {fields.map((field) => (
            <div key={field.label}>
              <div className="text-ink-3 text-[11px] font-bold tracking-[0.04em] uppercase">
                {field.label}
              </div>
              <div className="text-ink-2 mt-0.5 text-[13px] font-semibold">{field.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </>
  );
}

export function AdminCardList({
  title,
  subtitle,
  fields = [],
  badge,
  footer,
  onClick,
  className,
}: Props) {
  const body = (
    <CardBody title={title} subtitle={subtitle} fields={fields} badge={badge} footer={footer} />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "border-line bg-surface w-full cursor-pointer rounded-[14px] border p-3.5 text-left",
          "hover:bg-surface-2 active:translate-y-px",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "border-line bg-surface w-full rounded-[14px] border p-3.5 text-left",
        className,
      )}
    >
      {body}
    </div>
  );
}

interface ListProps {
  children: ReactNode;
  className?: string;
  empty?: ReactNode;
  loading?: boolean;
}

export function AdminCardListStack({ children, className, empty, loading = false }: ListProps) {
  if (loading) {
    return (
      <div className="border-line bg-surface text-ink-3 rounded-[14px] border px-3.5 py-2.5 text-sm">
        Загрузка…
      </div>
    );
  }

  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (items.length === 0) {
    return (
      <div className="border-line bg-surface text-ink-3 rounded-[14px] border px-3.5 py-2.5 text-sm">
        {empty ?? "Нет данных"}
      </div>
    );
  }

  return <div className={cn("flex flex-col gap-2.5", className)}>{items}</div>;
}
