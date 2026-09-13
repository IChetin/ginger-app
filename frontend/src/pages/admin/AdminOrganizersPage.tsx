import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { OrganizerAdmin } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { Modal } from "@/components/admin/Modal";
import { SearchInput } from "@/components/admin/SearchInput";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  isAdminUser,
  useCreateOrganizer,
  useDeleteOrganizer,
  useMe,
  useOrganizersAdmin,
  useUpdateOrganizer,
} from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

const inputClass =
  "h-[38px] w-full rounded-[10px] border border-line-strong bg-surface-2 px-[11px] text-sm text-ink outline-none focus:border-gold";

type FormState = {
  name: string;
  slug: string;
  site: string;
  telegram: string;
};

const emptyForm = (): FormState => ({
  name: "",
  slug: "",
  site: "",
  telegram: "",
});

function normalizeTelegram(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  return `https://t.me/${handle}`;
}

function formFromOrganizer(org: OrganizerAdmin): FormState {
  return {
    name: org.name,
    slug: org.slug,
    site: org.links.site ?? org.links.website ?? "",
    telegram: org.links.telegram ?? "",
  };
}

function linksLabel(links: Record<string, string>): string {
  const parts: string[] = [];
  if (links.site || links.website) parts.push("сайт");
  if (links.telegram) parts.push("telegram");
  return parts.join(" · ") || "—";
}

export function AdminOrganizersPage() {
  const isDesktop = useAdminDesktop();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const canWrite = isAdminUser(me);
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";

  const query = useOrganizersAdmin({ limit: 100, search: search || undefined });
  const createMutation = useCreateOrganizer();
  const updateMutation = useUpdateOrganizer();
  const deleteMutation = useDeleteOrganizer();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizerAdmin | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const items = query.data?.items ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  };

  const openEdit = (org: OrganizerAdmin) => {
    setEditing(org);
    setForm(formFromOrganizer(org));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setError(null);
    const links: Record<string, string> = {};
    if (form.site.trim()) links.site = form.site.trim();
    const telegram = normalizeTelegram(form.telegram);
    if (telegram) links.telegram = telegram;

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      links,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, body: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: "Удалить организатора?",
      description: "Организатор будет удалён безвозвратно.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(editing.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Организаторы</div>
          <div className="text-ink-3 text-xs">Союзы клубов · {query.data?.total ?? 0}</div>
        </div>
        <div className="flex-1" />
        {canWrite && isDesktop ? (
          <button
            type="button"
            onClick={openCreate}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center rounded-[10px] px-4 text-sm font-extrabold"
          >
            + Новый организатор
          </button>
        ) : null}
      </header>

      <div className="flex-1 space-y-4 px-6 pt-5 pb-10">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(value) => {
              const next = new URLSearchParams(params);
              if (value) next.set("search", value);
              else next.delete("search");
              setParams(next, { replace: true });
            }}
            placeholder="Поиск по названию"
          />
          <ToolbarSpacer />
          <ToolbarHint>{query.data?.total ?? 0} записей</ToolbarHint>
        </Toolbar>

        {!isDesktop ? (
          <AdminCardListStack>
            {items.map((org) => (
              <AdminCardList
                key={org.id}
                title={org.name}
                subtitle={org.slug}
                fields={[{ label: "Ссылки", value: linksLabel(org.links) }]}
                onClick={canWrite ? () => openEdit(org) : undefined}
              />
            ))}
          </AdminCardListStack>
        ) : (
          <AdminTable
            rows={items}
            rowKey={(org) => org.id}
            empty="Пусто"
            onRowClick={canWrite ? openEdit : undefined}
            columns={[
              {
                key: "name",
                header: "Организатор",
                cell: (org) => <div className="font-bold">{org.name}</div>,
              },
              {
                key: "slug",
                header: "Slug",
                className: "font-mono text-[12.5px] text-ink-2",
                cell: (org) => org.slug,
              },
              {
                key: "links",
                header: "Ссылки",
                className: "text-ink-3",
                cell: (org) => linksLabel(org.links),
              },
              {
                key: "actions",
                header: "",
                className: "w-12",
                cell: (org) =>
                  canWrite ? (
                    <button
                      type="button"
                      className="text-ink-3 hover:text-ink px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(org);
                      }}
                    >
                      ✎
                    </button>
                  ) : null,
              },
            ]}
          />
        )}

        {canWrite && isDesktop ? (
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Организатор"
            footer={
              <div className="flex w-full items-center gap-2">
                {editing ? (
                  <button
                    type="button"
                    className="border-danger/40 text-danger h-[31px] rounded-lg border px-3 text-[13px] font-bold"
                    onClick={() => void remove()}
                  >
                    Удалить
                  </button>
                ) : null}
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
                  disabled={saving}
                  className="bg-gold-grad text-ink-ongold h-[38px] rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-60"
                  onClick={() => void save()}
                >
                  Сохранить
                </button>
              </div>
            }
          >
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Название</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Slug</span>
              <input
                className={cn(inputClass, "font-mono")}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <span className="text-ink-3 text-[11px]">Латиница, используется в ссылках</span>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Сайт</span>
              <input
                className={inputClass}
                value={form.site}
                placeholder="https://"
                onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
              />
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Telegram-канал</span>
              <input
                className={inputClass}
                value={form.telegram}
                placeholder="@channel"
                onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
              />
            </label>
            {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
          </Modal>
        ) : null}
      </div>
    </>
  );
}
