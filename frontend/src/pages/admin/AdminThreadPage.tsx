import { Link, useParams } from "react-router-dom";

import { adminAttachmentUrl } from "@/features/admin/threads/api";
import { useAdminThread, useAdminThreadAction } from "@/features/admin/threads/hooks";
import { Conversation } from "@/features/threads/components/Conversation";
import { TOPIC_LABELS, statusLabel } from "@/features/threads/lib/format";

export function AdminThreadPage() {
  const { threadId = "" } = useParams();
  const thread = useAdminThread(threadId);
  const action = useAdminThreadAction(threadId);

  if (thread.isPending) return <div className="bg-surface mx-3 mt-4 h-48 rounded-md" />;
  if (thread.isError) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-3 py-4">
        <p className="text-ink text-[15px] font-bold">Диалог не найден</p>
        <Link to="/admin/threads" className="text-gold mt-2 inline-block text-[13px] font-bold">
          К диалогам
        </Link>
      </div>
    );
  }
  const data = thread.data;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 pt-4" data-testid="admin-thread">
      <div className="flex items-center gap-2">
        <Link to="/admin/threads" className="text-gold text-[13px] font-bold">
          ← Диалоги
        </Link>
        <span className="flex-1" />
        <span className="text-ink-3 text-[12px] font-semibold">
          {statusLabel(data.status, "manager")}
        </span>
        {data.status !== "closed" ? (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: "close" })}
            className="border-line-strong bg-surface-2 text-ink h-8 rounded-md border px-2.5 text-[12px] font-bold disabled:opacity-45"
          >
            Закрыть
          </button>
        ) : null}
      </div>
      <h1 className="mt-1 text-[18px] font-extrabold">
        {data.player_nickname}
        <span className="text-ink-3 ml-1.5 text-[12px] font-semibold">
          {data.player_kind === "deposit" ? "депозитный" : "кредитный"} · {TOPIC_LABELS[data.topic]}
        </span>
      </h1>
      <p className="text-ink-2 text-[13px]">{data.subject}</p>
      {data.chip_request_id ? (
        <Link
          to={`/admin/chips/${data.chip_request_id}`}
          className="text-gold text-[12px] font-bold"
        >
          Открыть заявку →
        </Link>
      ) : null}
      <Conversation
        thread={data}
        viewer="manager"
        attachmentUrl={(attachmentId) => adminAttachmentUrl(data.id, attachmentId)}
        pending={action.isPending}
        error={action.error}
        onSend={(vars) =>
          action.mutateAsync(
            vars.file
              ? {
                  type: "image",
                  file: vars.file,
                  filename: vars.filename ?? "image.jpg",
                  body: vars.body,
                }
              : { type: "message", body: vars.body ?? "" },
          )
        }
      />
    </div>
  );
}
