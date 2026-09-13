import { Link } from "react-router-dom";

import type { ChipRequest, ChipRequestStatus, ChipRequestKind } from "@/api/types/chips";
import {
  formatDateMsk,
  formatMoney,
  requestSummary,
  statusLabel,
  statusTone,
} from "@/features/chips/lib/format";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  wait: "bg-surface-3 text-ink-2",
  action: "bg-warn-soft text-warn",
  done: "bg-live-soft text-live",
  fail: "bg-danger-soft text-danger",
} as const;

export function StatusBadge({
  status,
  kind,
  className,
}: {
  status: ChipRequestStatus;
  kind: ChipRequestKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        TONE_CLASS[statusTone(status)],
        className,
      )}
    >
      {statusLabel(status, kind)}
    </span>
  );
}

/** Строка заявки в списке: две строки — телефон первым. */
export function RequestRow({ request }: { request: ChipRequest }) {
  const totals = request.totals
    .map((total) => formatMoney(total.amount, total.currency_symbol, total.currency_code))
    .join(" · ");
  return (
    <Link
      to={`/chips/${request.id}`}
      data-testid="chip-request-row"
      className="bg-surface border-line block rounded-md border px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
          {request.kind === "withdrawal" ? "Вывод · " : ""}
          {requestSummary(request)}
        </span>
        <StatusBadge status={request.status} kind={request.kind} />
      </div>
      <div className="text-ink-3 mt-0.5 flex justify-between text-[11.5px]">
        <span>{formatDateMsk(request.created_at)}</span>
        <span className="num">{totals}</span>
      </div>
    </Link>
  );
}
