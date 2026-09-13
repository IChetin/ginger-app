import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import type { Thread } from "@/api/types/threads";
import { compressImage } from "@/features/chips/lib/compressImage";
import { messageTime } from "@/features/threads/lib/format";
import { cn } from "@/lib/utils";

export type ConversationViewer = "player" | "manager";

export interface SendVars {
  body?: string;
  file?: Blob;
  filename?: string;
}

/**
 * Переписка в треде — общая для игрока и менеджера. Свои сообщения справа, чужие слева.
 * Картинка сжимается на телефоне до отправки: скриншот раздачи с камеры весит мегабайты.
 */
export function Conversation({
  thread,
  viewer,
  attachmentUrl,
  onSend,
  pending,
  error,
  closedHint,
}: {
  thread: Thread;
  viewer: ConversationViewer;
  attachmentUrl: (attachmentId: string) => string;
  onSend: (vars: SendVars) => Promise<unknown>;
  pending: boolean;
  error: unknown;
  closedHint?: string;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [thread.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await onSend({ body });
      setText("");
    } catch {
      // текст остаётся в поле, ошибка — под ним
    }
  };

  return (
    <div className="flex flex-col" data-testid="conversation">
      <div className="flex flex-col gap-1.5 py-2">
        {thread.messages.map((message) => {
          const mine = viewer === "manager" ? message.from_manager : !message.from_manager;
          return (
            <div
              key={message.id}
              data-testid="thread-message"
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-[14px] px-3 py-2 text-[14px] leading-snug",
                  mine
                    ? "bg-gold-soft text-ink rounded-br-[4px]"
                    : "bg-surface border-line text-ink rounded-bl-[4px] border",
                )}
              >
                {!mine && message.from_manager && viewer === "player" ? (
                  <p className="text-gold mb-0.5 text-[11px] font-bold">Менеджер</p>
                ) : null}
                {!mine && !message.from_manager && viewer === "manager" ? (
                  <p className="text-gold mb-0.5 text-[11px] font-bold">
                    {message.author_nickname ?? "Игрок"}
                  </p>
                ) : null}
                {message.attachment_id ? (
                  <a
                    href={attachmentUrl(message.attachment_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={attachmentUrl(message.attachment_id)}
                      alt="Вложение"
                      className="mb-1 max-h-56 rounded-[10px]"
                    />
                  </a>
                ) : null}
                {message.body ? (
                  <p className="font-sans break-words whitespace-pre-wrap">{message.body}</p>
                ) : null}
                <p className="text-ink-3 mt-0.5 text-right text-[10.5px]">
                  {messageTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {closedHint && thread.status === "closed" ? (
        <p className="text-ink-3 pb-1.5 text-center text-[12px]">{closedHint}</p>
      ) : null}

      <div className="border-line bg-bg/95 sticky bottom-0 flex items-end gap-1.5 border-t pt-2 pb-2 backdrop-blur-[12px]">
        <button
          type="button"
          aria-label="Приложить картинку"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="border-line-strong bg-surface text-ink-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-[18px] disabled:opacity-45"
        >
          📎
        </button>
        <textarea
          aria-label="Сообщение"
          placeholder="Сообщение или история раздачи"
          value={text}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          onChange={(event) => setText(event.target.value)}
          className="border-line-strong bg-surface text-ink min-h-10 flex-1 resize-none rounded-md border px-2.5 py-2 text-[14px] outline-none"
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() => void send()}
          className="bg-gold-grad text-ink-ongold h-10 shrink-0 rounded-md px-3 text-[14px] font-bold disabled:opacity-45"
        >
          {pending ? "…" : "Отправить"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label="Картинка"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void (async () => {
              const blob = await compressImage(file);
              try {
                await onSend({
                  file: blob,
                  filename: file.name || "image.jpg",
                  body: text.trim() || undefined,
                });
                setText("");
              } catch {
                // ошибка показывается ниже
              }
            })();
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger pb-2 text-[12px] font-semibold">
          {error instanceof ApiError ? error.message : "Не удалось отправить"}
        </p>
      ) : null}
    </div>
  );
}
