import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { OrganizerAdmin } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { SearchInput } from "@/components/admin/SearchInput";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  isAdminUser,
  useAdminParsers,
  useCreateOrganizer,
  useDeleteOrganizer,
  useDeleteOrganizerLogo,
  useMe,
  useOrganizersAdmin,
  useUpdateOrganizer,
  useUploadOrganizerLogo,
} from "@/features/admin/hooks";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  slug: string;
  site: string;
  telegram: string;
  schedule_parser_id: string;
  structure_parser_id: string;
};

const emptyForm = (): FormState => ({
  name: "",
  slug: "",
  site: "",
  telegram: "",
  schedule_parser_id: "",
  structure_parser_id: "",
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
    schedule_parser_id: org.schedule_parser_id ?? "",
    structure_parser_id: org.structure_parser_id ?? "",
  };
}

function linksLabel(links: Record<string, string>): string {
  const parts: string[] = [];
  if (links.site || links.website) parts.push("сайт");
  if (links.telegram) parts.push("telegram");
  return parts.join(" · ") || "—";
}

/** Аббревиатура в UI — из slug (как на карточках серий). */
function organizerAbbr(slug: string, name: string): string {
  const fromSlug = slug.trim().toUpperCase();
  if (fromSlug) return fromSlug.slice(0, 4);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((part) => part[0]!.toUpperCase()).join("");
  }
  return (parts[0] ?? "").slice(0, 6).toUpperCase();
}

export function AdminOrganizersPage() {
  const isDesktop = useAdminDesktop();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const canWrite = isAdminUser(me);
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";

  const query = useOrganizersAdmin({ limit: 100, search: search || undefined });
  const parsersQuery = useAdminParsers();
  const createMutation = useCreateOrganizer();
  const updateMutation = useUpdateOrganizer();
  const deleteMutation = useDeleteOrganizer();
  const uploadLogoMutation = useUploadOrganizerLogo();
  const deleteLogoMutation = useDeleteOrganizerLogo();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizerAdmin | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExistingLogo, setRemoveExistingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = query.data?.items ?? [];
  const scheduleParsers = useMemo(() => {
    const all = parsersQuery.data ?? [];
    return all.filter(
      (parser) =>
        parser.kind === "schedule" &&
        parser.is_available &&
        (parser.is_active || parser.id === form.schedule_parser_id),
    );
  }, [parsersQuery.data, form.schedule_parser_id]);
  const structureParsers = useMemo(() => {
    const all = parsersQuery.data ?? [];
    return all.filter(
      (parser) =>
        parser.kind === "structures" &&
        parser.is_available &&
        (parser.is_active || parser.id === form.structure_parser_id),
    );
  }, [parsersQuery.data, form.structure_parser_id]);
  const withParsers = useMemo(
    () =>
      items.filter((item) => item.schedule_parser_id || item.structure_parser_id).length,
    [items],
  );

  const shownLogoUrl = pendingFile
    ? previewUrl
    : removeExistingLogo
      ? null
      : (editing?.logo_url ?? null);

  const resetLogoState = () => {
    setPendingFile(null);
    setRemoveExistingLogo(false);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    resetLogoState();
    setError(null);
    setOpen(true);
  };

  const openEdit = (org: OrganizerAdmin) => {
    setEditing(org);
    setForm(formFromOrganizer(org));
    resetLogoState();
    setError(null);
    setOpen(true);
  };

  const onPickFile = (file: File | null) => {
    setError(null);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setPendingFile(file);
    setRemoveExistingLogo(false);
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
      schedule_parser_id: form.schedule_parser_id || null,
      structure_parser_id: form.structure_parser_id || null,
    };
    try {
      let organizerId = editing?.id ?? null;
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, body: payload });
      } else {
        const created = await createMutation.mutateAsync(payload);
        organizerId = created.id;
      }

      if (organizerId && removeExistingLogo && editing?.logo_url && !pendingFile) {
        await deleteLogoMutation.mutateAsync(organizerId);
      }
      if (organizerId && pendingFile) {
        await uploadLogoMutation.mutateAsync({ id: organizerId, file: pendingFile });
      }

      setOpen(false);
      resetLogoState();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  };

  const remove = async () => {
    if (!editing) return;
    const seriesCount = editing.series_count;
    const seriesPhrase =
      seriesCount > 0
        ? `С организатором связано ${seriesCount} ${pluralRu(seriesCount, "серия", "серии", "серий")}. Удаление может затронуть связанные данные.`
        : "Организатор будет удалён безвозвратно.";
    const ok = await confirm({
      title: "Удалить организатора?",
      description: seriesPhrase,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(editing.id);
      setOpen(false);
      resetLogoState();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  };

  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadLogoMutation.isPending ||
    deleteLogoMutation.isPending;

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Организаторы</div>
          <div className="text-ink-3 text-xs">
            {query.data?.total ?? 0} операторов · {withParsers} с готовыми парсерами
          </div>
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
                subtitle={organizerAbbr(org.slug, org.name)}
                fields={[
                  { label: "Slug", value: org.slug },
                  { label: "Ссылки", value: linksLabel(org.links) },
                  {
                    label: "Парсер",
                    value: org.schedule_parser_title ?? "авто / ИИ",
                  },
                  { label: "Серий", value: String(org.series_count) },
                ]}
                onClick={canWrite ? () => openEdit(org) : undefined}
              />
            ))}
          </AdminCardListStack>
        ) : (
          <>
            <AdminTable
              rows={items}
              rowKey={(org) => org.id}
              empty="Пусто"
              onRowClick={canWrite ? openEdit : undefined}
              columns={[
                {
                  key: "name",
                  header: "Организатор",
                  cell: (org) => (
                    <div className="flex items-center gap-2.5">
                      {org.logo_url ? (
                        <img
                          src={org.logo_url}
                          alt=""
                          className="border-line-strong bg-surface-3 h-9 w-9 rounded-[10px] border object-contain p-1"
                        />
                      ) : (
                        <div className="border-line-strong bg-surface-3 text-gold flex h-9 w-9 items-center justify-center rounded-[10px] border text-[11px] font-extrabold">
                          {organizerAbbr(org.slug, org.name)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{org.name}</div>
                        <div className="text-ink-3 text-xs">{organizerAbbr(org.slug, org.name)}</div>
                      </div>
                    </div>
                  ),
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
                  key: "parser",
                  header: "Парсер расписаний",
                  cell: (org) =>
                    org.schedule_parser_title ? (
                      <span className="bg-live-soft text-live inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold">
                        {org.schedule_parser_title}
                      </span>
                    ) : (
                      <span className="text-ink-3 text-[12.5px]">авто / ИИ</span>
                    ),
                },
                {
                  key: "series",
                  header: "Серий",
                  className: "num text-right",
                  cell: (org) => org.series_count,
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
            <p className="text-ink-3 text-[11px]">
              Парсер выбирается вручную в карточке организатора. Названия задаются в разделе
              «Парсеры».
            </p>
          </>
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
                className={adminInputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Slug</span>
              <input
                className={cn(adminInputClass, "font-mono")}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <span className="text-ink-3 text-[11px]">Латиница, используется в ссылках</span>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Парсер расписаний</span>
              <select
                className={adminInputClass}
                value={form.schedule_parser_id}
                onChange={(e) => setForm((f) => ({ ...f, schedule_parser_id: e.target.value }))}
              >
                <option value="">Автоопределение</option>
                {scheduleParsers.map((parser) => (
                  <option key={parser.id} value={parser.id}>
                    {parser.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Парсер структур</span>
              <select
                className={adminInputClass}
                value={form.structure_parser_id}
                onChange={(e) => setForm((f) => ({ ...f, structure_parser_id: e.target.value }))}
              >
                <option value="">Автоопределение</option>
                {structureParsers.map((parser) => (
                  <option key={parser.id} value={parser.id}>
                    {parser.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Сайт</span>
              <input
                className={adminInputClass}
                value={form.site}
                placeholder="https://"
                onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
              />
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Telegram-канал</span>
              <input
                className={adminInputClass}
                value={form.telegram}
                placeholder="@channel"
                onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
              />
            </label>

            <div className="mb-3">
              <div className="text-ink-2 mb-1.5 text-xs font-semibold">Логотип</div>
              <div className="border-line flex items-center gap-3 rounded-[10px] border p-2.5">
                {shownLogoUrl ? (
                  <img
                    src={shownLogoUrl}
                    alt="Превью логотипа"
                    className="border-line-strong bg-surface-3 h-16 w-16 rounded-[12px] border object-contain p-1.5"
                  />
                ) : (
                  <div className="border-line-strong bg-surface-3 text-gold flex h-16 w-16 items-center justify-center rounded-[12px] border text-sm font-extrabold">
                    {organizerAbbr(form.slug, form.name) || "—"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/svg+xml,.png,.webp,.svg"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="border-line-strong hover:bg-surface-2 h-[34px] w-full rounded-[10px] border px-3 text-[13px] font-bold"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {shownLogoUrl ? "Заменить изображение" : "Загрузить изображение"}
                  </button>
                  <p className="text-ink-3 mt-1.5 text-[11px]">PNG / SVG / WebP · до 1 МБ · мин. 120×120</p>
                  {shownLogoUrl ? (
                    <button
                      type="button"
                      className="text-danger mt-1.5 text-[12.5px] font-bold"
                      onClick={() => {
                        onPickFile(null);
                        if (editing?.logo_url) setRemoveExistingLogo(true);
                      }}
                    >
                      Удалить логотип
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-line bg-surface-2 text-ink-2 mb-1 rounded-[10px] border p-2.5 text-[12.5px]">
              При импорте сначала пробуется выбранный парсер; если файл не подходит — автоподбор, затем
              ИИ-фолбэк.
            </div>
            {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
          </Modal>
        ) : null}
      </div>
    </>
  );
}
