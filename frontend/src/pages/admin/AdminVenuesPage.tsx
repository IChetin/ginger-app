import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { VenueAdmin } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { SearchInput } from "@/components/admin/SearchInput";
import { TimezoneSelect } from "@/components/admin/TimezoneSelect";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { countryFlag } from "@/components/series/seriesDisplay";
import { SEED_COUNTRIES } from "@/features/admin/constants";
import {
  isAdminUser,
  useCreateVenue,
  useDeleteVenue,
  useMe,
  useUpdateVenue,
  useVenuesAdmin,
} from "@/features/admin/hooks";
import { pluralRu } from "@/lib/plural";
import { formatUtcOffset } from "@/lib/timezoneOffset";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  slug: string;
  country_code: string;
  city: string;
  zone: string;
  timezone: string;
  address: string;
  lat: string;
  lng: string;
  logo_url: string;
};

const emptyForm = (): FormState => ({
  name: "",
  slug: "",
  country_code: "RU",
  city: "",
  zone: "",
  timezone: "Europe/Moscow",
  address: "",
  lat: "",
  lng: "",
  logo_url: "",
});

function formFromVenue(venue: VenueAdmin): FormState {
  return {
    name: venue.name,
    slug: venue.slug,
    country_code: venue.country_code,
    city: venue.city,
    zone: venue.zone ?? "",
    timezone: venue.timezone,
    address: venue.address ?? "",
    lat: venue.lat ?? "",
    lng: venue.lng ?? "",
    logo_url: venue.logo_url ?? "",
  };
}

export function AdminVenuesPage() {
  const isDesktop = useAdminDesktop();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const canWrite = isAdminUser(me);
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const country = params.get("country_code") ?? "";

  const query = useVenuesAdmin({
    limit: 100,
    search: search || undefined,
    country_code: country || undefined,
  });
  const createMutation = useCreateVenue();
  const updateMutation = useUpdateVenue();
  const deleteMutation = useDeleteVenue();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VenueAdmin | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const items = query.data?.items ?? [];
  const countryCount = useMemo(() => new Set(items.map((item) => item.country_code)).size, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  };

  const openEdit = (venue: VenueAdmin) => {
    setEditing(venue);
    setForm(formFromVenue(venue));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setError(null);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      country_code: form.country_code,
      city: form.city.trim(),
      zone: form.zone.trim() || null,
      timezone: form.timezone,
      address: form.address.trim() || null,
      lat: form.lat.trim() || null,
      lng: form.lng.trim() || null,
      logo_url: form.logo_url.trim() || null,
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
    const seriesCount = editing.series_count;
    const seriesPhrase =
      seriesCount > 0
        ? `С площадкой связано ${seriesCount} ${pluralRu(seriesCount, "серия", "серии", "серий")}. Удаление может затронуть связанные данные.`
        : "Площадка будет удалена безвозвратно.";
    const ok = await confirm({
      title: "Удалить площадку?",
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Площадки</div>
          <div className="text-ink-3 text-xs">
            {query.data?.total ?? 0} площадок
            {countryCount ? ` · ${countryCount} стран` : ""}
          </div>
        </div>
        <div className="flex-1" />
        {canWrite && isDesktop ? (
          <button
            type="button"
            onClick={openCreate}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-sm font-extrabold"
          >
            + Новая площадка
          </button>
        ) : null}
      </header>

      <div className="flex-1 space-y-4 px-6 pt-5 pb-10">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(value) => setFilter("search", value)}
            placeholder="Поиск по названию или городу"
          />
          <select
            className={cn(adminInputClass, "h-9 w-auto min-w-[140px]")}
            value={country}
            onChange={(event) => setFilter("country_code", event.target.value)}
          >
            <option value="">Все страны</option>
            {SEED_COUNTRIES.map((item) => (
              <option key={item.code} value={item.code}>
                {countryFlag(item.code)} {item.name_ru}
              </option>
            ))}
          </select>
          <ToolbarSpacer />
          <ToolbarHint>{query.data?.total ?? 0} записей</ToolbarHint>
        </Toolbar>

        {!isDesktop ? (
          <AdminCardListStack>
            {items.map((venue) => (
              <AdminCardList
                key={venue.id}
                title={venue.name}
                subtitle={venue.slug}
                fields={[
                  { label: "Город", value: `${countryFlag(venue.country_code)} ${venue.city}` },
                  { label: "Пояс", value: `${venue.timezone} ${formatUtcOffset(venue.timezone)}` },
                  { label: "Серий", value: String(venue.series_count) },
                ]}
              />
            ))}
            {items.length === 0 ? <p className="text-ink-3 text-sm">Пусто</p> : null}
          </AdminCardListStack>
        ) : (
          <AdminTable
            rows={items}
            rowKey={(venue) => venue.id}
            empty="Пусто"
            onRowClick={canWrite ? openEdit : undefined}
            columns={[
              {
                key: "name",
                header: "Площадка",
                cell: (venue) => (
                  <div>
                    <div className="font-bold">{venue.name}</div>
                    <div className="text-ink-3 text-xs">{venue.slug}</div>
                  </div>
                ),
              },
              {
                key: "city",
                header: "Город",
                cell: (venue) => (
                  <>
                    {countryFlag(venue.country_code)} {venue.city}
                  </>
                ),
              },
              {
                key: "zone",
                header: "Зона",
                className: "text-ink-3",
                cell: (venue) => venue.zone ?? "—",
              },
              {
                key: "timezone",
                header: "Часовой пояс",
                cell: (venue) => (
                  <span className="border-line-strong bg-surface-3 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 font-mono text-xs">
                    {venue.timezone} <b className="text-gold">{formatUtcOffset(venue.timezone)}</b>
                  </span>
                ),
              },
              {
                key: "series",
                header: "Серий",
                headerClassName: "text-right",
                className: "text-right font-variant-numeric tabular-nums",
                cell: (venue) => venue.series_count,
              },
              {
                key: "actions",
                header: "",
                headerClassName: "text-right",
                className: "text-right",
                cell: (venue) =>
                  canWrite ? (
                    <button
                      type="button"
                      className="border-line-strong inline-flex size-[31px] items-center justify-center rounded-lg border"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(venue);
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
            title={editing ? "Площадка" : "Новая площадка"}
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
                  className="bg-gold-grad text-ink-ongold h-[38px] rounded-[10px] px-4 text-sm font-extrabold"
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
                placeholder="авто из названия"
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </label>
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Страна</span>
                <select
                  className={adminInputClass}
                  value={form.country_code}
                  onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value }))}
                >
                  {SEED_COUNTRIES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {countryFlag(item.code)} {item.name_ru}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Город</span>
                <input
                  className={adminInputClass}
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>
            </div>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">
                Игорная зона <span className="text-ink-3">· необязательно</span>
              </span>
              <input
                className={adminInputClass}
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
              />
            </label>
            <div className="mb-3">
              <div className="text-ink-2 mb-1 text-xs font-semibold">Часовой пояс (IANA)</div>
              <TimezoneSelect
                value={form.timezone}
                onChange={(timezone) => setForm((f) => ({ ...f, timezone }))}
              />
            </div>
            <div className="border-line-gold bg-gold-soft text-ink-2 mb-3 flex gap-2 rounded-[10px] border p-2.5 text-[12.5px]">
              От часового пояса зависит время всех турниров этой площадки и время отправки
              напоминаний. Смена пояса пересчитает показ времени у пользователей.
            </div>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Адрес</span>
              <input
                className={adminInputClass}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Широта</span>
                <input
                  className={adminInputClass}
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Долгота</span>
                <input
                  className={adminInputClass}
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                />
              </label>
            </div>
            <label className="mb-1 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Логотип (URL)</span>
              <input
                className={adminInputClass}
                value={form.logo_url}
                placeholder="https://"
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
              />
            </label>
            {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
          </Modal>
        ) : null}

        {error && !open ? <p className="text-danger text-sm">{error}</p> : null}
      </div>
    </>
  );
}
