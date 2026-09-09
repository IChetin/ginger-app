import type { NotificationPreviewResponse } from "@/api/types/notifications";
import { Modal } from "@/components/admin/Modal";

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type NotificationPreviewDialogProps = {
  open: boolean;
  preview: NotificationPreviewResponse | null;
  isConfirming?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
};

export function NotificationPreviewDialog({
  open,
  preview,
  isConfirming = false,
  errorMessage = null,
  onOpenChange,
  onConfirm,
}: NotificationPreviewDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Подтверждение рассылки"
      subtitle="Проверьте изменения и получателей перед сохранением. После подтверждения уведомления попадут в очередь."
      className="w-[min(520px,92vw)]"
      footer={
        <>
          <button
            type="button"
            className="border-line-strong text-ink hover:bg-surface-2 inline-flex h-[38px] items-center justify-center rounded-[10px] border bg-transparent px-4 text-sm font-bold"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!preview || isConfirming}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50"
            onClick={() => void onConfirm()}
          >
            {isConfirming ? "Сохранение…" : "Подтвердить"}
          </button>
        </>
      }
    >
      {preview ? (
        <div className="space-y-4 text-sm">
          <p className="text-ink-2">
            Получателей: <span className="text-ink font-bold">{preview.total_recipients}</span>
          </p>

          {preview.total_recipients === 0 ? (
            <p className="border-line-gold bg-warn-soft text-warn rounded-[10px] border px-3 py-2.5 text-[13px]">
              Подписчиков нет — рассылка никого не затронет.
            </p>
          ) : null}

          {preview.diffs.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-ink text-[13px] font-extrabold">Изменения</h3>
              <ul className="space-y-2">
                {preview.diffs.map((diff) => (
                  <li
                    key={`${diff.field}-${formatPreviewValue(diff.old_value)}-${formatPreviewValue(diff.new_value)}`}
                    className="border-line bg-surface-2 rounded-[10px] border px-3 py-2.5"
                  >
                    <p className="text-ink-2 text-[12px] font-bold">{diff.field}</p>
                    <p className="text-ink mt-1 font-medium tabular-nums">
                      <span className="text-ink-3">{formatPreviewValue(diff.old_value)}</span>
                      {" → "}
                      {formatPreviewValue(diff.new_value)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.impacts.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-ink text-[13px] font-extrabold">Уведомления</h3>
              <ul className="space-y-2">
                {preview.impacts.map((impact) => (
                  <li
                    key={`${impact.type}-${impact.title}-${impact.recipient_count}`}
                    className="border-line bg-surface-2 rounded-[10px] border px-3 py-2.5"
                  >
                    <p className="text-ink-3 text-[11px] font-bold tracking-wide uppercase">
                      {impact.type} · {impact.recipient_count} получ.
                    </p>
                    <p className="text-ink mt-1 font-extrabold">{impact.title}</p>
                    <p className="text-ink-2 mt-1 text-[13px]">{impact.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-ink-3 text-[13px]">Уведомления не будут отправлены.</p>
          )}
        </div>
      ) : null}

      {errorMessage ? <p className="text-danger mt-3 text-sm">{errorMessage}</p> : null}
    </Modal>
  );
}
