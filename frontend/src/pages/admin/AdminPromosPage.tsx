import { useRef, useState, type ReactNode } from "react";

import { ApiError } from "@/api/client";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { usePublicClubs } from "@/features/chips/hooks";
import {
  useAdminPromos,
  useCreatePromo,
  useDeletePromo,
  usePromoFromImage,
  usePromoFromText,
  useUpdatePromo,
  useUploadPromoImage,
  type PromoAdmin,
} from "@/features/promos/api";
import { UNCERTAIN_FIELD, toForm, toPayload, type PromoForm } from "@/features/promos/form";
import { PromoCard } from "@/features/promos/PromoCard";
import { cn } from "@/lib/utils";

const inputClass =
  "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px]";

const EMPTY: PromoForm = {
  clubId: "",
  kind: "leaderboard",
  title: "",
  prizeFund: "",
  prizeExtra: "",
  currencyCode: "RUB",
  startsAt: "",
  endsAt: "",
  recurrence: "none",
  game: "mtt",
  buyinMin: "",
  buyinMax: "",
  prizes: "",
  windows: "",
  uncertain: [],
};

const stamp = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Moscow",
});

function stateOf(promo: PromoAdmin, now: Date): "draft" | "live" | "soon" | "ended" {
  if (!promo.is_published) return "draft";
  if (promo.ends_at && new Date(promo.ends_at) <= now) return "ended";
  if (promo.starts_at && new Date(promo.starts_at) > now) return "soon";
  return "live";
}

const STATE_LABEL = { draft: "черновик", live: "идёт", soon: "скоро", ended: "закончилась" };

function Field({
  label,
  doubt,
  children,
  wide = false,
}: {
  label: string;
  doubt: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("block", wide && "col-span-2")}>
      <span className="text-ink-3 flex items-center gap-1.5 text-[11.5px] font-semibold">
        {label}
        {doubt ? <span className="text-warn font-bold">⚠ проверить</span> : null}
      </span>
      <span className={cn("mt-0.5 block", doubt && "[&>*]:border-warn [&>*]:bg-warn-soft")}>
        {children}
      </span>
    </label>
  );
}

/**
 * Акции клубов плашками (Иван, 30.09). Пост союза или афишу превращаем в черновик:
 * текст разбирается на сервере, картинка — через распознавание текста. Подсвеченное
 * «проверить» разборщик угадал не наверняка; публикует всегда человек.
 */
export function AdminPromosPage() {
  const promos = useAdminPromos();
  const clubs = usePublicClubs();
  const create = useCreatePromo();
  const update = useUpdatePromo();
  const remove = useDeletePromo();
  const fromText = usePromoFromText();
  const fromImage = usePromoFromImage();
  const uploadImage = useUploadPromoImage();
  const confirm = useConfirm();
  const imageInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<PromoAdmin | null>(null);
  const [form, setForm] = useState<PromoForm | null>(null);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const now = new Date();

  const open = (promo: PromoAdmin | null) => {
    setEditing(promo);
    setForm(promo ? toForm(promo) : EMPTY);
    window.scrollTo({ top: 0 });
  };
  const close = () => {
    setEditing(null);
    setForm(null);
  };
  const set = <K extends keyof PromoForm>(key: K, value: PromoForm[K]) =>
    setForm((current) => {
      if (!current) return current;
      // Поправил поле — сомнение снято.
      const doubts = Object.entries(UNCERTAIN_FIELD)
        .filter(([, field]) => field === key)
        .map(([name]) => name);
      return {
        ...current,
        [key]: value,
        uncertain: current.uncertain.filter((name) => !doubts.includes(name)),
      };
    });
  const doubt = (field: keyof PromoForm) =>
    !!form && form.uncertain.some((name) => UNCERTAIN_FIELD[name] === field);

  const save = (publish: boolean) => {
    if (!form || !form.title.trim()) return;
    const body = toPayload(form, publish);
    if (editing) {
      update.mutate({ id: editing.id, body }, { onSuccess: close });
    } else {
      create.mutate(body, { onSuccess: close });
    }
  };

  const error = [
    create.error,
    update.error,
    fromText.error,
    fromImage.error,
    uploadImage.error,
  ].find(Boolean);
  const list = promos.data ?? [];
  const groups = (["draft", "live", "soon", "ended"] as const).map((state) => ({
    state,
    items: list.filter((promo) => stateOf(promo, now) === state),
  }));
  const preview = form && editing ? { ...editing, ...previewOf(form, editing) } : null;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-promos">
      <h1 className="text-[20px] font-extrabold">Акции</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Лидерборды и фрироллы клубов в разделе PROMO. Вставьте пост союза или афишу — поля
        заполнятся сами; «⚠ проверить» — то, в чём разбор не уверен. После окончания акция пропадает
        сама, у ежемесячной появляется черновик на следующий месяц.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowPaste((value) => !value)}
          className="bg-gold-grad text-ink-ongold h-10 rounded-md px-3 text-[14px] font-bold"
        >
          Из текста поста
        </button>
        <button
          type="button"
          disabled={fromImage.isPending}
          onClick={() => imageInput.current?.click()}
          className="bg-gold-grad text-ink-ongold h-10 rounded-md px-3 text-[14px] font-bold disabled:opacity-50"
        >
          {fromImage.isPending ? "Распознаём…" : "Из картинки"}
        </button>
        <button
          type="button"
          onClick={() => open(null)}
          className="border-line-gold text-gold h-10 rounded-md border px-3 text-[14px] font-bold"
        >
          Вручную
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          aria-label="Афиша или скрин акции"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) fromImage.mutate(file, { onSuccess: (promo) => open(promo) });
          }}
        />
      </div>

      {showPaste ? (
        <div className="border-line bg-surface mt-2 rounded-md border px-3 py-2.5">
          <textarea
            aria-label="Текст поста союза"
            placeholder="Вставьте пост союза целиком — с призами и датами"
            value={pasted}
            rows={6}
            onChange={(event) => setPasted(event.target.value)}
            className="border-line-strong bg-surface-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
          />
          <button
            type="button"
            disabled={pasted.trim().length < 10 || fromText.isPending}
            onClick={() =>
              fromText.mutate(pasted, {
                onSuccess: (promo) => {
                  setPasted("");
                  setShowPaste(false);
                  open(promo);
                },
              })
            }
            className="bg-gold-grad text-ink-ongold mt-2 h-10 rounded-md px-4 text-[14px] font-bold disabled:opacity-50"
          >
            Разобрать
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger mt-2 text-[13px] font-semibold">
          {error instanceof ApiError ? error.message : "Не получилось"}
        </p>
      ) : null}

      {form ? (
        <form
          className="border-line bg-surface mt-3 grid grid-cols-2 gap-2 rounded-md border px-3 py-3"
          data-testid="promo-form"
          onSubmit={(event) => {
            event.preventDefault();
            save(true);
          }}
        >
          <p className="text-ink col-span-2 text-[15px] font-bold">
            {editing ? (editing.is_published ? "Правка акции" : "Черновик акции") : "Новая акция"}
            {editing?.renewed_from_id ? (
              <span className="text-warn ml-2 text-[12px]">новый месяц — сверьте призы</span>
            ) : null}
          </p>
          <Field label="Клуб" doubt={doubt("clubId")}>
            <select
              aria-label="Клуб"
              value={form.clubId}
              onChange={(event) => set("clubId", event.target.value)}
              className={inputClass}
            >
              <option value="">— выберите —</option>
              {clubs.data?.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Тип" doubt={false}>
            <select
              aria-label="Тип"
              value={form.kind}
              onChange={(event) => set("kind", event.target.value as PromoForm["kind"])}
              className={inputClass}
            >
              <option value="leaderboard">Leaderboard</option>
              <option value="freeroll">Фриролл</option>
              <option value="bonus">Бонус</option>
              <option value="other">Другое</option>
            </select>
          </Field>
          <Field label="Название" doubt={doubt("title")} wide>
            <input
              aria-label="Название"
              value={form.title}
              maxLength={120}
              onChange={(event) => set("title", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Призовой фонд" doubt={doubt("prizeFund")}>
            <input
              aria-label="Призовой фонд"
              inputMode="decimal"
              value={form.prizeFund}
              onChange={(event) => set("prizeFund", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Валюта" doubt={doubt("currencyCode")}>
            <select
              aria-label="Валюта"
              value={form.currencyCode}
              onChange={(event) => set("currencyCode", event.target.value)}
              className={inputClass}
            >
              <option value="RUB">₽ рубли</option>
              <option value="USD">$ доллары</option>
              <option value="USDT">USDT</option>
            </select>
          </Field>
          <Field label="Начало (МСК)" doubt={doubt("startsAt")}>
            <input
              aria-label="Начало"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Окончание (МСК)" doubt={doubt("endsAt")}>
            <input
              aria-label="Окончание"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Игра" doubt={false}>
            <select
              aria-label="Игра"
              value={form.game}
              onChange={(event) => set("game", event.target.value as PromoForm["game"])}
              className={inputClass}
            >
              <option value="mtt">MTT</option>
              <option value="cash">CASH</option>
              <option value="any">MTT и CASH</option>
            </select>
          </Field>
          <Field label="Повтор" doubt={false}>
            <select
              aria-label="Повтор"
              value={form.recurrence}
              onChange={(event) => set("recurrence", event.target.value as PromoForm["recurrence"])}
              className={inputClass}
            >
              <option value="none">разовая</option>
              <option value="monthly">каждый месяц</option>
            </select>
          </Field>
          <Field label="Бай-ин от" doubt={false}>
            <input
              aria-label="Бай-ин от"
              inputMode="decimal"
              value={form.buyinMin}
              onChange={(event) => set("buyinMin", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Бай-ин до" doubt={false}>
            <input
              aria-label="Бай-ин до"
              inputMode="decimal"
              value={form.buyinMax}
              onChange={(event) => set("buyinMax", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Двойные очки (МСК), например 10:00–12:00" doubt={doubt("windows")} wide>
            <input
              aria-label="Двойные очки"
              value={form.windows}
              onChange={(event) => set("windows", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Призы: строка на место — «1 — 250 000» или «10 — Black VIP Card»"
            doubt={doubt("prizes")}
            wide
          >
            <textarea
              aria-label="Призы"
              value={form.prizes}
              rows={Math.min(10, Math.max(3, form.prizes.split("\n").length))}
              onChange={(event) => set("prizes", event.target.value)}
              className="border-line-strong bg-surface-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
            />
          </Field>
          <Field label="Приз не деньгами (показывается рядом с фондом)" doubt={false} wide>
            <input
              aria-label="Приз не деньгами"
              value={form.prizeExtra}
              maxLength={80}
              onChange={(event) => set("prizeExtra", event.target.value)}
              className={inputClass}
            />
          </Field>

          {editing ? (
            <div className="col-span-2 flex flex-wrap items-center gap-3 text-[13px]">
              {editing.image_url ? (
                <a
                  href={editing.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold font-bold"
                >
                  Афиша
                </a>
              ) : (
                <span className="text-ink-3">Без афиши</span>
              )}
              <button
                type="button"
                onClick={() => posterInput.current?.click()}
                className="text-gold font-bold"
              >
                {editing.image_url ? "Заменить афишу" : "Добавить афишу"}
              </button>
              <input
                ref={posterInput}
                type="file"
                accept="image/*"
                hidden
                aria-label="Афиша"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    uploadImage.mutate(
                      { id: editing.id, file },
                      { onSuccess: (promo) => setEditing(promo) },
                    );
                }}
              />
            </div>
          ) : null}
          {editing?.source_text ? (
            <details className="col-span-2 text-[12.5px]">
              <summary className="text-ink-3 cursor-pointer font-semibold">
                Что распознано из исходника
              </summary>
              <pre className="text-ink-2 bg-surface-2 mt-1 max-h-48 overflow-auto px-2 py-1.5 whitespace-pre-wrap">
                {editing.source_text}
              </pre>
            </details>
          ) : null}

          {preview ? (
            <div className="col-span-2">
              <p className="text-ink-3 mb-1 text-[11.5px] font-semibold">Так увидит игрок</p>
              <PromoCard promo={preview} now={now} />
            </div>
          ) : null}

          <div className="col-span-2 flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="bg-gold-grad text-ink-ongold h-10 rounded-md px-4 text-[14px] font-bold disabled:opacity-50"
            >
              Опубликовать
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              className="border-line-gold text-gold h-10 rounded-md border px-4 text-[14px] font-bold"
            >
              {editing?.is_published ? "Снять с показа" : "Сохранить черновик"}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-ink-3 h-10 px-2 text-[14px] font-bold"
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      {promos.isPending ? <div className="bg-surface mt-4 h-24 rounded-md" /> : null}
      {groups.map(({ state, items }) =>
        items.length === 0 ? null : (
          <section key={state} className="mt-4">
            <h2 className="text-ink-3 text-[12px] font-bold tracking-[0.1em] uppercase">
              {state === "draft"
                ? "Черновики"
                : state === "live"
                  ? "Идут"
                  : state === "soon"
                    ? "Скоро"
                    : "Закончились"}
            </h2>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {items.map((promo) => (
                <div
                  key={promo.id}
                  className={cn(
                    "border-line bg-surface flex items-center gap-2 rounded-md border px-3 py-2",
                    state === "ended" && "opacity-60",
                  )}
                  data-testid="admin-promo-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-[14px] font-bold">{promo.title}</p>
                    <p className="text-ink-3 truncate text-[12px]">
                      {promo.club?.name ?? "клуб не выбран"} · {STATE_LABEL[state]}
                      {promo.starts_at ? ` · ${stamp.format(new Date(promo.starts_at))}` : ""}
                      {promo.ends_at ? ` – ${stamp.format(new Date(promo.ends_at))}` : ""}
                      {promo.uncertain.length > 0 ? " · ⚠ проверить" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => open(promo)}
                    className="text-gold shrink-0 text-[13px] font-bold"
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void confirm({
                        title: "Удалить акцию?",
                        description: promo.title,
                        confirmLabel: "Удалить",
                        cancelLabel: "Отмена",
                        variant: "danger",
                      }).then((ok) => {
                        if (ok) remove.mutate(promo.id);
                      })
                    }
                    className="text-ink-3 shrink-0 text-[13px] font-bold"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

/** Предпросмотр плашки по текущей форме — без сохранения. */
function previewOf(form: PromoForm, base: PromoAdmin): Partial<PromoAdmin> {
  const payload = toPayload(form, base.is_published);
  const symbols: Record<string, string> = { RUB: "₽", USD: "$", USDT: "$" };
  return {
    title: payload.title,
    kind: payload.kind,
    prize_fund: payload.prize_fund,
    prize_extra: payload.prize_extra,
    currency_code: payload.currency_code,
    currency_symbol: payload.currency_code ? (symbols[payload.currency_code] ?? null) : null,
    starts_at: payload.starts_at,
    ends_at: payload.ends_at,
    recurrence: payload.recurrence,
    game: payload.game,
    buyin_min: payload.buyin_min,
    buyin_max: payload.buyin_max,
    prizes: payload.prizes,
    boost_windows: payload.boost_windows,
  };
}
