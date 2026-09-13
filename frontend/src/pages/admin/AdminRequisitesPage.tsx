import { useState } from "react";

import { ApiError } from "@/api/client";
import { useRequisiteTemplates, useSaveRequisiteTemplate } from "@/features/admin/chips/hooks";
import { cn } from "@/lib/utils";

/** Шаблоны реквизитов: менеджер отправляет депозитному игроку в один тап из заявки. */
export function AdminRequisitesPage() {
  const templates = useRequisiteTemplates();
  const save = useSaveRequisiteTemplate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-requisites">
      <h1 className="text-[20px] font-extrabold">Реквизиты</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Выключенный шаблон не предлагается в заявке. Удалять не нужно — история оплат сохраняет
        текст.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {templates.data?.map((template) => (
          <div
            key={template.id}
            data-testid="requisite-template"
            className={cn(
              "border-line bg-surface rounded-md border px-3 py-2",
              !template.is_active && "opacity-60",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
                {template.title}
              </span>
              <label className="text-ink-2 flex items-center gap-1.5 text-[12px] font-semibold">
                <input
                  type="checkbox"
                  checked={template.is_active}
                  disabled={save.isPending}
                  onChange={(event) =>
                    save.mutate({ id: template.id, is_active: event.target.checked })
                  }
                  className="size-4"
                />
                активен
              </label>
            </div>
            <pre className="text-ink-2 mt-0.5 font-sans text-[12.5px] whitespace-pre-wrap">
              {template.body}
            </pre>
          </div>
        ))}
      </div>

      <form
        className="border-line bg-surface mt-3 rounded-md border px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(
            { title: title.trim(), body: body.trim() },
            {
              onSuccess: () => {
                setTitle("");
                setBody("");
              },
            },
          );
        }}
      >
        <p className="text-ink text-[14px] font-bold">Новый шаблон</p>
        <input
          aria-label="Название шаблона"
          placeholder="Название: Т-Банк Иван"
          value={title}
          maxLength={64}
          onChange={(event) => setTitle(event.target.value)}
          className="border-line-strong bg-surface-2 mt-1.5 block h-10 w-full rounded-md border px-2.5 text-[14px]"
        />
        <textarea
          aria-label="Текст реквизитов"
          placeholder="Что увидит игрок: номер карты, банк, получатель"
          value={body}
          maxLength={2000}
          rows={3}
          onChange={(event) => setBody(event.target.value)}
          className="border-line-strong bg-surface-2 mt-1.5 block w-full rounded-md border px-2.5 py-2 text-[14px]"
        />
        <button
          type="submit"
          disabled={save.isPending || !title.trim() || !body.trim()}
          className="bg-gold-grad text-ink-ongold mt-1.5 h-10 w-full rounded-md text-[14px] font-bold disabled:opacity-45"
        >
          Сохранить
        </button>
        {save.isError ? (
          <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
            {save.error instanceof ApiError ? save.error.message : "Не удалось сохранить"}
          </p>
        ) : null}
      </form>
    </div>
  );
}
