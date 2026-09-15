import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fetchTelegramStatus, startTelegramLink, unlinkTelegram } from "@/features/telegram/api";

const STATUS_KEY = ["me", "telegram"] as const;

/**
 * Telegram как второй канал уведомлений (решение Ивана 15.09). Без настроек: подключил —
 * важное (заявки, ответы менеджера, колокольчики, новости клуба) приходит и пушем, и в бот.
 */
export function TelegramBlock() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchTelegramStatus,
    // Пока игрок жмёт «Старт» в боте — проверяем, привязался ли чат.
    refetchInterval: linkUrl ? 3000 : false,
  });
  const start = useMutation({
    mutationFn: startTelegramLink,
    onSuccess: (data) => setLinkUrl(data.url),
  });
  const unlink = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const linked = status.data?.linked ?? false;
  useEffect(() => {
    if (linked) setLinkUrl(null);
  }, [linked]);

  if (!status.data?.available) return null;

  return (
    <section
      className="border-line bg-surface mx-4 mt-4 rounded-md border p-3"
      data-testid="telegram-block"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink text-[15px] font-bold">Telegram</span>
        {linked ? (
          <span className="rounded-full bg-[var(--live-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--action-live-fg)]">
            подключён
          </span>
        ) : null}
      </div>

      {linked ? (
        <>
          <p className="text-ink-2 mt-1 text-[13px]">
            {status.data.username ? `@${status.data.username} · ` : ""}важные уведомления приходят и
            сюда, и в бот.
          </p>
          <button
            type="button"
            disabled={unlink.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Отключить Telegram?",
                description: "Уведомления останутся в приложении.",
                confirmLabel: "Отключить",
                cancelLabel: "Отмена",
              });
              if (ok) unlink.mutate();
            }}
            className="border-line-strong text-ink-2 mt-2 h-10 rounded-md border px-3 text-[13px] font-bold disabled:opacity-40"
          >
            Отключить
          </button>
        </>
      ) : linkUrl ? (
        <>
          <p className="text-ink-2 mt-1 text-[13px]">
            Откройте бота и нажмите «Старт» — Telegram подключится сам.
          </p>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gold-grad text-ink-ongold mt-2 flex h-11 items-center justify-center rounded-md text-[14px] font-bold"
          >
            Открыть бота
          </a>
        </>
      ) : (
        <>
          <p className="text-ink-2 mt-1 text-[13px]">
            Дублировать важные уведомления в Telegram: заявки на фишки, ответы менеджера,
            напоминания о турнирах.
          </p>
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => start.mutate()}
            className="border-line-strong text-ink mt-2 h-10 rounded-md border px-3 text-[13px] font-bold disabled:opacity-40"
          >
            Подключить Telegram
          </button>
          {start.isError ? (
            <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
              Не удалось получить ссылку — попробуйте ещё раз
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
