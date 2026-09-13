import { useMemo, useState } from "react";

import type { ParserInfo } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { isAdminUser, useAdminParsers, useMe, useUpdateParser } from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

type FormState = {
  title: string;
  is_active: boolean;
  notes: string;
};

function formFromParser(parser: ParserInfo): FormState {
  return {
    title: parser.title,
    is_active: parser.is_active,
    notes: parser.notes ?? "",
  };
}

function kindLabel(kind: string): string {
  return kind === "structures" ? "Структуры" : "Расписание";
}

export function AdminParsersPage() {
  const isDesktop = useAdminDesktop();
  const { data: me } = useMe();
  const canWrite = isAdminUser(me);
  const query = useAdminParsers();
  const updateMutation = useUpdateParser();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ParserInfo | null>(null);
  const [form, setForm] = useState<FormState>({ title: "", is_active: true, notes: "" });
  const [error, setError] = useState<string | null>(null);

  const items = query.data ?? [];
  const activeCount = useMemo(() => items.filter((item) => item.is_active).length, [items]);

  const openEdit = (parser: ParserInfo) => {
    setEditing(parser);
    setForm(formFromParser(parser));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        body: {
          title: form.title.trim(),
          is_active: form.is_active,
          notes: form.notes.trim() || null,
        },
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  };

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Парсеры</div>
          <div className="text-ink-3 text-xs">
            {items.length} в реестре · {activeCount} активных
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-6 pt-5 pb-10">
        <Toolbar>
          <ToolbarHint>
            Названия выбираются в карточке организатора. Код парсера задаётся в коде приложения.
          </ToolbarHint>
          <ToolbarSpacer />
          <ToolbarHint>{items.length} записей</ToolbarHint>
        </Toolbar>

        {!isDesktop ? (
          <AdminCardListStack>
            {items.map((parser) => (
              <AdminCardList
                key={parser.id}
                title={parser.title}
                subtitle={`${parser.name} · ${kindLabel(parser.kind)}`}
                fields={[
                  {
                    label: "Форматы",
                    value: parser.supported_types.join(", ") || "—",
                  },
                  {
                    label: "Статус",
                    value: !parser.is_available
                      ? "нет в коде"
                      : parser.is_active
                        ? "активен"
                        : "выкл.",
                  },
                  {
                    label: "Организаторы",
                    value: parser.organizers.length
                      ? parser.organizers.map((org) => org.name).join(", ")
                      : "—",
                  },
                ]}
                onClick={canWrite ? () => openEdit(parser) : undefined}
              />
            ))}
          </AdminCardListStack>
        ) : (
          <AdminTable
            rows={items}
            rowKey={(parser) => parser.id}
            onRowClick={canWrite ? openEdit : undefined}
            columns={[
              {
                key: "title",
                header: "Название",
                cell: (parser) => (
                  <div>
                    <div className="font-bold">{parser.title}</div>
                    <div className="text-ink-3 font-mono text-[11px]">{parser.name}</div>
                  </div>
                ),
              },
              {
                key: "kind",
                header: "Тип",
                cell: (parser) => kindLabel(parser.kind),
              },
              {
                key: "types",
                header: "Форматы",
                cell: (parser) => parser.supported_types.join(", ") || "—",
              },
              {
                key: "organizers",
                header: "Организаторы",
                cell: (parser) =>
                  parser.organizers.length
                    ? parser.organizers.map((org) => org.name).join(", ")
                    : "—",
              },
              {
                key: "active",
                header: "Статус",
                cell: (parser) => (
                  <span
                    className={cn(
                      "text-[12px] font-bold",
                      !parser.is_available
                        ? "text-danger"
                        : parser.is_active
                          ? "text-gold"
                          : "text-ink-3",
                    )}
                  >
                    {!parser.is_available ? "нет в коде" : parser.is_active ? "активен" : "выкл."}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                className: "w-12",
                cell: (parser) =>
                  canWrite ? (
                    <button
                      type="button"
                      className="text-ink-3 hover:text-ink px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(parser);
                      }}
                    >
                      ✎
                    </button>
                  ) : null,
              },
            ]}
          />
        )}

        {canWrite && editing ? (
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Парсер"
            footer={
              <div className="flex w-full items-center gap-2">
                <div className="flex-1" />
                <button
                  type="button"
                  className="border-line-strong h-[38px] rounded-[10px] border px-4 text-sm font-bold"
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={updateMutation.isPending || !form.title.trim()}
                  className="bg-gold-grad text-ink-ongold h-[38px] rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-60"
                  onClick={() => void save()}
                >
                  Сохранить
                </button>
              </div>
            }
          >
            <div className="text-ink-3 mb-3 font-mono text-[12px]">
              {editing.name} · {kindLabel(editing.kind)}
              {editing.supported_types.length ? ` · ${editing.supported_types.join(", ")}` : ""}
            </div>
            {editing.description ? (
              <p className="text-ink-2 mb-3 text-[12.5px]">{editing.description}</p>
            ) : null}
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Название</span>
              <input
                className={adminInputClass}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              <span className="text-ink-3 text-[11px]">
                Это имя выбирается в карточке организатора и в импорте
              </span>
            </label>
            <label className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-ink-2 text-sm font-semibold">Активен</span>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Заметка</span>
              <textarea
                className={cn(adminInputClass, "min-h-[72px] resize-y")}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            {editing.organizers.length ? (
              <p className="text-ink-3 text-[12px]">
                Привязан к: {editing.organizers.map((org) => org.name).join(", ")}
              </p>
            ) : (
              <p className="text-ink-3 text-[12px]">Пока ни к одному организатору не привязан</p>
            )}
            {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
          </Modal>
        ) : null}
      </div>
    </>
  );
}
