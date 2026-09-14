import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { PlayerKind, PlayerStatus } from "@/api/types/chips";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useUpdateAdminPlayer } from "@/features/admin/chips/hooks";
import type { PlayerCrmCard } from "@/features/admin/crm/crmApi";
import { formatAgo, formatBirthdaySoon, usePlayerCard } from "@/features/admin/crm/hooks";
import { isAdminUser, useMe } from "@/features/admin/hooks";
import { statusLabel } from "@/features/chips/lib/format";
import { APP_ICONS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PlayerKind, string> = { credit: "Кредитный", deposit: "Депозитный" };
const THREAD_STATUS: Record<"open" | "answered" | "closed", string> = {
  open: "ждёт ответа",
  answered: "отвечен",
  closed: "закрыт",
};

const inputClass =
  "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px] disabled:opacity-60";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-line bg-surface mt-3 rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-ink-3 text-[11px] font-bold tracking-[0.08em] uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-md px-2.5 py-2">
      <p className="text-ink-3 text-[11px] font-semibold">{label}</p>
      <p className="num text-ink text-[15px] font-bold">{value}</p>
    </div>
  );
}

/** «Кто» (ТЗ §9а.3): имя, контакты, день рождения, откуда пришёл. */
function ContactsForm({ player, canEdit }: { player: PlayerCrmCard; canEdit: boolean }) {
  const update = useUpdateAdminPlayer();
  const [realName, setRealName] = useState(player.real_name ?? "");
  const [phone, setPhone] = useState(player.phone ?? "");
  const [telegram, setTelegram] = useState(player.telegram ?? "");
  const [birthday, setBirthday] = useState(player.birthday ?? "");
  const [source, setSource] = useState(player.source ?? "");
  const dirty =
    realName !== (player.real_name ?? "") ||
    phone !== (player.phone ?? "") ||
    telegram !== (player.telegram ?? "") ||
    birthday !== (player.birthday ?? "") ||
    source !== (player.source ?? "");

  return (
    <form
      className="grid grid-cols-2 gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({
          id: player.id,
          body: {
            real_name: realName,
            phone,
            telegram,
            birthday: birthday || null,
            source,
          },
        });
      }}
    >
      <input
        aria-label="Имя"
        placeholder="Имя и фамилия"
        value={realName}
        disabled={!canEdit}
        onChange={(event) => setRealName(event.target.value)}
        className={cn(inputClass, "col-span-2")}
      />
      <input
        aria-label="Телефон"
        placeholder="Телефон"
        inputMode="tel"
        value={phone}
        disabled={!canEdit}
        onChange={(event) => setPhone(event.target.value)}
        className={inputClass}
      />
      <input
        aria-label="Telegram"
        placeholder="@telegram"
        value={telegram}
        disabled={!canEdit}
        onChange={(event) => setTelegram(event.target.value)}
        className={inputClass}
      />
      <label className="text-ink-3 text-[11px] font-semibold">
        День рождения
        <input
          aria-label="День рождения"
          type="date"
          value={birthday}
          disabled={!canEdit}
          onChange={(event) => setBirthday(event.target.value)}
          className={cn(inputClass, "mt-0.5")}
        />
      </label>
      <label className="text-ink-3 text-[11px] font-semibold">
        Откуда пришёл
        <input
          aria-label="Откуда пришёл"
          placeholder="Турнир, друг, Telegram…"
          value={source}
          disabled={!canEdit}
          onChange={(event) => setSource(event.target.value)}
          className={cn(inputClass, "mt-0.5")}
        />
      </label>
      {canEdit ? (
        <button
          type="submit"
          disabled={!dirty || update.isPending}
          className="bg-gold-grad text-ink-ongold col-span-2 mt-1 h-10 rounded-md text-[14px] font-bold disabled:opacity-40"
        >
          {update.isPending ? "Сохраняем…" : "Сохранить"}
        </button>
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-danger col-span-2 text-[12px] font-semibold">
          {update.error instanceof ApiError ? update.error.message : "Не удалось сохранить"}
        </p>
      ) : null}
    </form>
  );
}

function TagsEditor({ player, canEdit }: { player: PlayerCrmCard; canEdit: boolean }) {
  const update = useUpdateAdminPlayer();
  const [draft, setDraft] = useState("");
  const save = (tags: string[]) => update.mutate({ id: player.id, body: { tags } });

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {player.tags.map((tag) => (
          <span
            key={tag}
            className="bg-gold-soft text-gold inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-[12px] font-bold"
          >
            {tag}
            {canEdit ? (
              <button
                type="button"
                aria-label={`Убрать тег ${tag}`}
                disabled={update.isPending}
                onClick={() => save(player.tags.filter((item) => item !== tag))}
                className="hover:bg-surface-3 flex size-5 items-center justify-center rounded-full"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {player.tags.length === 0 ? (
          <span className="text-ink-3 text-[12.5px]">Тегов нет — по ним строятся рассылки</span>
        ) : null}
      </div>
      {canEdit ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const tag = draft.trim().replace(/^#/, "");
            if (!tag) return;
            save([...player.tags, tag]);
            setDraft("");
          }}
        >
          <input
            aria-label="Новый тег"
            placeholder="vip, хайроллер, должник…"
            value={draft}
            maxLength={32}
            onChange={(event) => setDraft(event.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!draft.trim() || update.isPending}
            className="border-line-strong bg-surface-2 text-ink h-10 shrink-0 rounded-md border px-3 text-[13px] font-bold disabled:opacity-40"
          >
            Добавить
          </button>
        </form>
      ) : null}
    </div>
  );
}

function NotesEditor({ player, canEdit }: { player: PlayerCrmCard; canEdit: boolean }) {
  const update = useUpdateAdminPlayer();
  const [notes, setNotes] = useState(player.notes ?? "");
  const dirty = notes !== (player.notes ?? "");
  return (
    <div>
      <textarea
        aria-label="Заметки"
        placeholder="Размены, сколько можно в долг, история, чем полезен — всё, чего нет в полях"
        value={notes}
        rows={5}
        disabled={!canEdit}
        onChange={(event) => setNotes(event.target.value)}
        className="border-line-strong bg-surface-2 block w-full rounded-md border px-2.5 py-2 text-[14px] disabled:opacity-60"
      />
      {canEdit ? (
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate({ id: player.id, body: { notes } })}
          className="bg-gold-grad text-ink-ongold mt-1.5 h-10 w-full rounded-md text-[14px] font-bold disabled:opacity-40"
        >
          Сохранить заметку
        </button>
      ) : null}
    </div>
  );
}

function StatusControls({ player }: { player: PlayerCrmCard }) {
  const update = useUpdateAdminPlayer();
  const confirm = useConfirm();
  const patch = (body: Parameters<typeof update.mutate>[0]["body"]) =>
    update.mutate({ id: player.id, body });

  return (
    <div className="grid grid-cols-2 gap-1.5 text-[12.5px]">
      <label className="font-bold">
        Тип
        <select
          aria-label="Тип игрока"
          value={player.kind}
          disabled={update.isPending}
          onChange={(event) => patch({ kind: event.target.value as PlayerKind })}
          className={cn(inputClass, "mt-0.5 font-normal")}
        >
          <option value="credit">Кредитный</option>
          <option value="deposit">Депозитный</option>
        </select>
      </label>
      <label className="font-bold">
        Статус
        <select
          aria-label="Статус игрока"
          value={player.status}
          disabled={update.isPending}
          onChange={async (event) => {
            const status = event.target.value as PlayerStatus;
            if (status === "blocked") {
              const ok = await confirm({
                title: `Заблокировать ${player.nickname}?`,
                description: "Игрок не сможет оставлять заявки на фишки.",
                confirmLabel: "Заблокировать",
                cancelLabel: "Отмена",
                variant: "danger",
              });
              if (!ok) return;
            }
            patch({ status });
          }}
          className={cn(inputClass, "mt-0.5 font-normal")}
        >
          <option value="active">Активен</option>
          <option value="blocked">Заблокирован</option>
          <option value="archived">В архиве</option>
        </select>
      </label>
      <label className="col-span-2 flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          checked={player.offline_access}
          disabled={update.isPending}
          onChange={(event) => patch({ offline_access: event.target.checked })}
          className="size-4"
        />
        Доступ к офлайн-блоку
      </label>
    </div>
  );
}

/** Карточка человека (ТЗ §9а.3): кто, статус, откуда, активность, теги, заметки, история. */
export function AdminPlayerPage() {
  const { playerId = "" } = useParams();
  const { data: me } = useMe();
  const card = usePlayerCard(playerId);
  const canEdit = isAdminUser(me);

  if (card.isPending) {
    return <div className="bg-surface mx-auto mt-4 h-60 max-w-[720px] rounded-lg" />;
  }
  if (card.isError) {
    return (
      <div className="mx-auto max-w-[720px] px-3 py-6 text-center">
        <p className="text-ink text-[15px] font-bold">Игрок не найден</p>
        <Link to="/admin/players" className="text-gold mt-2 inline-block text-[13px] font-bold">
          ← К игрокам
        </Link>
      </div>
    );
  }

  const player = card.data;
  const birthdaySoon = formatBirthdaySoon(player.days_to_birthday);

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-player">
      <Link to="/admin/players" className="text-gold text-[13px] font-bold">
        ← Игроки
      </Link>
      <header className="mt-2 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] leading-tight font-bold">{player.nickname}</h1>
          <p className="text-ink-2 text-[13px]">
            {player.real_name ? `${player.real_name} · ` : ""}
            <span className="select-all">{player.email}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="bg-surface-3 text-ink-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
            {KIND_LABEL[player.kind]}
          </span>
          {player.status !== "active" ? (
            <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-bold">
              {player.status === "blocked" ? "Заблокирован" : "В архиве"}
            </span>
          ) : null}
          {player.sleeping ? (
            <span className="bg-warn-soft text-warn rounded-full px-2 py-0.5 text-[11px] font-bold">
              Спит
            </span>
          ) : null}
          {birthdaySoon && (player.days_to_birthday ?? 99) <= 14 ? (
            <span className="bg-gold-soft text-gold rounded-full px-2 py-0.5 text-[11px] font-bold">
              {birthdaySoon}
            </span>
          ) : null}
        </div>
      </header>
      {canEdit ? (
        <Link
          to={`/admin/broadcasts?player=${player.id}&nick=${encodeURIComponent(player.nickname)}`}
          className="border-line-strong bg-surface text-ink mt-2 inline-flex h-9 items-center rounded-md border px-3 text-[13px] font-bold"
        >
          Отправить пуш игроку
        </Link>
      ) : null}

      <Section title="Активность">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Stat label="Последний заход" value={formatAgo(player.last_seen_at)} />
          <Stat
            label="Последняя заявка"
            value={player.last_request_at ? formatAgo(player.last_request_at) : "не было"}
          />
          <Stat label="Заявок за 30 дней" value={player.requests_30d} />
          <Stat label="Выдач всего" value={player.completed_topups} />
        </div>
        <p className="text-ink-3 mt-2 text-[12px]">
          С нами с {new Date(player.created_at).toLocaleDateString("ru-RU")}
          {player.referrer_nickname ? ` · привёл ${player.referrer_nickname}` : ""}
          {player.invited_players > 0 ? ` · пригласил ${player.invited_players}` : ""}
        </p>
      </Section>

      <Section title="Кто">
        <ContactsForm
          key={`${player.id}-${player.real_name}-${player.phone}`}
          player={player}
          canEdit={canEdit}
        />
      </Section>

      <Section title="Теги">
        <TagsEditor player={player} canEdit={canEdit} />
      </Section>

      <Section title="Заметки">
        <NotesEditor key={player.notes ?? ""} player={player} canEdit={canEdit} />
      </Section>

      <Section title="Статус">
        {canEdit ? (
          <StatusControls player={player} />
        ) : (
          <p className="text-ink-3 text-[12.5px]">Тип и статус меняет администратор.</p>
        )}
      </Section>

      <Section title={`Аккаунты · ${player.accounts.length}`}>
        <ul className="flex flex-col gap-1">
          {player.accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-2 text-[13px]">
              {APP_ICONS[account.club.app] ? (
                <img src={APP_ICONS[account.club.app]} alt="" className="h-5 w-5 rounded-[22%]" />
              ) : null}
              <span className="text-ink font-bold">{account.club.name}</span>
              <span className="text-ink-2 select-all">
                {account.nickname} · ID {account.app_account_id}
              </span>
              {account.status !== "confirmed" ? (
                <span className="text-warn text-[11.5px]">
                  {account.status === "pending" ? "на проверке" : "отклонён"}
                </span>
              ) : null}
            </li>
          ))}
          {player.accounts.length === 0 ? (
            <li className="text-ink-3 text-[12.5px]">Аккаунтов нет</li>
          ) : null}
        </ul>
      </Section>

      <Section title="Заявки">
        <ul className="flex flex-col">
          {player.requests.map((request) => (
            <li key={request.id} className="border-line border-t first:border-t-0">
              <Link
                to={`/admin/chips/${request.id}`}
                className="flex items-center gap-2 py-1.5 text-[13px]"
              >
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">
                  {request.summary}
                </span>
                <span className="text-ink-3 shrink-0 text-[11.5px]">
                  {statusLabel(request.status, request.kind)} · {dateTime(request.created_at)}
                </span>
              </Link>
            </li>
          ))}
          {player.requests.length === 0 ? (
            <li className="text-ink-3 text-[12.5px]">Заявок не было</li>
          ) : null}
        </ul>
      </Section>

      <Section title="Диалоги">
        <ul className="flex flex-col">
          {player.threads.map((thread) => (
            <li key={thread.id} className="border-line border-t first:border-t-0">
              <Link
                to={`/admin/threads/${thread.id}`}
                className="flex items-center gap-2 py-1.5 text-[13px]"
              >
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">
                  {thread.subject}
                </span>
                <span className="text-ink-3 shrink-0 text-[11.5px]">
                  {THREAD_STATUS[thread.status]} · {dateTime(thread.last_message_at)}
                </span>
              </Link>
            </li>
          ))}
          {player.threads.length === 0 ? (
            <li className="text-ink-3 text-[12.5px]">Диалогов не было</li>
          ) : null}
        </ul>
      </Section>
    </div>
  );
}
