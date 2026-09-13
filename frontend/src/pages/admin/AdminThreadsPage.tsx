import { useState } from "react";
import { Link } from "react-router-dom";

import type { InboxScope } from "@/features/admin/threads/api";
import { useAdminThreads } from "@/features/admin/threads/hooks";
import { TOPIC_LABELS, shortTime, statusLabel } from "@/features/threads/lib/format";
import { cn } from "@/lib/utils";

/** Инбокс: все обращения игроков. Непрочитанные сверху (экраны §3.9). */
export function AdminThreadsPage() {
  const [scope, setScope] = useState<InboxScope>("open");
  const threads = useAdminThreads(scope);

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-threads">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-[20px] font-extrabold">Диалоги</h1>
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
      {threads.isPending ? <div className="bg-surface mt-3 h-32 rounded-md" /> : null}
      {threads.data?.length === 0 ? (
        <p className="text-ink-3 mt-6 text-center text-[13px]">Обращений нет</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-1.5">
        {threads.data?.map((thread) => (
          <Link
            key={thread.id}
            to={`/admin/threads/${thread.id}`}
            data-testid="admin-thread-row"
            className={cn(
              "bg-surface block rounded-md border px-2.5 py-2",
              thread.unread ? "border-line-gold" : "border-line",
            )}
          >
            <div className="flex items-center gap-2">
              {thread.unread ? <span className="bg-gold h-2 w-2 shrink-0 rounded-full" /> : null}
              <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
                {thread.player_nickname}
                <span className="text-ink-3 ml-1 text-[11px] font-semibold">
                  {TOPIC_LABELS[thread.topic]}
                </span>
              </span>
              <span className="text-ink-3 shrink-0 text-[11.5px]">
                {shortTime(thread.last_message_at)}
              </span>
            </div>
            <div className="text-ink-3 mt-0.5 flex gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate">
                {thread.subject !== TOPIC_LABELS[thread.topic] ? `${thread.subject} · ` : ""}
                {thread.last_message_preview}
              </span>
              <span
                className={cn("shrink-0 font-semibold", thread.status === "open" && "text-gold")}
              >
                {statusLabel(thread.status, "manager")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
