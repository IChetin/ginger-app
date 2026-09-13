import { useState } from "react";
import { Link } from "react-router-dom";

import type { ChipRequestAdmin, RequestScope } from "@/features/admin/chips/api";
import { nextActionLabel } from "@/features/admin/chips/format";
import { useAdminChipRequests, usePendingAccounts } from "@/features/admin/chips/hooks";
import { StatusBadge } from "@/features/chips/components/RequestRow";
import { formatDateMsk, formatMoney, formatNumber } from "@/features/chips/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL = { credit: "кредит", deposit: "депозит" } as const;

function QueueRow({ request }: { request: ChipRequestAdmin }) {
  const action = nextActionLabel(request);
  const urgent = request.status === "sent" || request.status === "paid";
  return (
    <Link
      to={`/admin/chips/${request.id}`}
      data-testid="admin-chip-row"
      className={cn(
        "bg-surface block rounded-md border px-2.5 py-2",
        urgent ? "border-line-gold" : "border-line",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
          {request.player.nickname}
          <span className="text-ink-3 ml-1 text-[11px] font-semibold">
            {KIND_LABEL[request.player.kind]}
          </span>
        </span>
        <StatusBadge status={request.status} kind={request.kind} />
      </div>
      <div className="text-ink-2 mt-0.5 truncate text-[12.5px]">
        {request.kind === "withdrawal" ? "Вывод · " : ""}
        {request.items.map((item) => `${item.club.name} ${formatNumber(item.amount)}`).join(", ")}
      </div>
      <div className="text-ink-3 mt-0.5 flex justify-between gap-2 text-[11.5px]">
        <span>
          {formatDateMsk(request.created_at)}
          {action ? <span className="text-gold ml-1.5 font-bold">→ {action}</span> : null}
        </span>
        <span className="num">
          {request.totals
            .map((total) => formatMoney(total.amount, total.currency_symbol, total.currency_code))
            .join(" · ")}
        </span>
      </div>
    </Link>
  );
}

/** Очередь заявок на фишки. Экран менеджера — чаще с телефона, поэтому список, а не таблица. */
export function AdminChipRequestsPage() {
  const [scope, setScope] = useState<RequestScope>("open");
  const requests = useAdminChipRequests(scope);
  const pending = usePendingAccounts();
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-chip-requests">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-[20px] font-extrabold">Заявки на фишки</h1>
        <div className="bg-surface-2 flex rounded-md p-0.5 text-[12px] font-bold">
          {(["open", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                "h-8 rounded-[6px] px-3",
                scope === value ? "bg-surface text-ink" : "text-ink-3",
              )}
            >
              {value === "open" ? "Открытые" : "Все"}
            </button>
          ))}
        </div>
      </div>

      {pendingCount > 0 ? (
        <Link
          to="/admin/players"
          className="border-line-gold bg-gold-soft text-ink mt-2 block rounded-md border px-3 py-2 text-[13px] font-bold"
        >
          Аккаунты на подтверждении: {pendingCount} →
        </Link>
      ) : null}

      {requests.isPending ? <div className="bg-surface mt-3 h-32 rounded-md" /> : null}
      {requests.isError ? (
        <p role="alert" className="text-danger mt-3 text-[13px] font-semibold">
          Не удалось загрузить заявки
        </p>
      ) : null}
      {requests.data?.length === 0 ? (
        <p className="text-ink-3 mt-6 text-center text-[13px]">
          {scope === "open" ? "Открытых заявок нет" : "Заявок пока не было"}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-1.5">
        {requests.data?.map((request) => (
          <QueueRow key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
}
