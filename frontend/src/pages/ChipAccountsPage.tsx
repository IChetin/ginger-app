import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { PublicClub } from "@/api/types/chips";
import type { PokerApp } from "@/api/types/tournaments";
import { ModerationNotice } from "@/features/auth/ModerationNotice";
import {
  useAddAppAccount,
  usePlayerMe,
  usePublicClubs,
  useUpdatePlayerAccount,
} from "@/features/chips/hooks";
import { groupAccounts, type AppAccount } from "@/features/chips/lib/accounts";
import { APP_ICONS, APP_LABELS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const inputClass =
  "border-line bg-surface text-ink h-10 w-full rounded-md border px-2.5 text-[14px] outline-none";

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Не удалось сохранить";
}

function AppIcon({ app, className }: { app: PokerApp; className: string }) {
  const src = APP_ICONS[app];
  return src ? (
    <img src={src} alt="" aria-hidden="true" className={cn("rounded-[22%]", className)} />
  ) : null;
}

/**
 * Карточка аккаунта приложения: ник и ID один раз, клубы — плашками. Недостающий клуб
 * того же приложения добавляется одним тапом, правка ника и ID меняет их во всех клубах.
 */
function AppAccountCard({ account, clubs }: { account: AppAccount; clubs: PublicClub[] }) {
  const add = useAddAppAccount();
  const update = useUpdatePlayerAccount();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(account.nickname);
  const [appId, setAppId] = useState(account.appAccountId);
  const linked = new Set(account.rows.map((row) => row.club.id));
  const missing = clubs.filter((club) => club.app === account.app && !linked.has(club.id));
  const valid = Boolean(nickname.trim() && appId.trim());

  return (
    <div className="border-line bg-surface rounded-md border px-3 py-2.5" data-testid="app-account">
      <div className="flex items-center gap-2">
        <AppIcon app={account.app} className="h-8 w-8 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[14px] font-bold">
            {APP_LABELS[account.app]} · {account.nickname}
          </span>
          <span className="num text-ink-3 block text-[12px]">ID {account.appAccountId}</span>
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Изменить ${APP_LABELS[account.app]} ${account.nickname}`}
            className="text-gold h-8 shrink-0 px-1 text-[13px] font-bold"
          >
            Изменить
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {account.rows.map((row) => (
          <span
            key={row.id}
            className="border-line-gold bg-gold-soft text-gold rounded-full border px-2.5 py-1 text-[12px] font-bold"
          >
            ✓ {row.club.name}
          </span>
        ))}
        {missing.map((club) => (
          <button
            key={club.id}
            type="button"
            disabled={add.isPending}
            aria-label={`Добавить клуб ${club.name}`}
            onClick={() =>
              add.mutate({
                club_ids: [club.id],
                nickname: account.nickname,
                app_account_id: account.appAccountId,
              })
            }
            className="border-line-strong text-ink-2 rounded-full border border-dashed px-2.5 py-1 text-[12px] font-bold disabled:opacity-45"
          >
            + {club.name}
          </button>
        ))}
      </div>
      {add.isError ? (
        <p role="alert" className="text-danger mt-1.5 text-[12.5px] font-semibold">
          {errorText(add.error)}
        </p>
      ) : null}

      {editing ? (
        <form
          className="mt-2 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const first = account.rows[0];
            if (!valid || !first) return;
            update.mutate(
              { id: first.id, nickname: nickname.trim(), app_account_id: appId.trim() },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <input
            aria-label="Ник в приложении"
            className={inputClass}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <input
            aria-label="ID в приложении"
            inputMode="numeric"
            className={inputClass}
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
          />
          <p className="text-ink-3 text-[11.5px]">Поменяется во всех клубах этого приложения.</p>
          {update.isError ? (
            <p role="alert" className="text-danger text-[12.5px] font-semibold">
              {errorText(update.error)}
            </p>
          ) : null}
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={!valid || update.isPending}
              className="bg-gold-grad text-ink-ongold h-10 flex-1 rounded-md text-[14px] font-bold disabled:opacity-45"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNickname(account.nickname);
                setAppId(account.appAccountId);
              }}
              className="text-ink-2 h-10 px-3 text-[13px] font-bold"
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Новый аккаунт: приложение → ID и ник → клубы. Клубы этого приложения отмечены сразу —
 * снять галочку проще, чем вводить ID трижды (Иван, 24.09).
 */
function AddAppAccount({ clubs, onDone }: { clubs: PublicClub[]; onDone?: () => void }) {
  const add = useAddAppAccount();
  const apps = useMemo(() => [...new Set(clubs.map((club) => club.app))], [clubs]);
  const [app, setApp] = useState<PokerApp | null>(apps.length === 1 ? (apps[0] ?? null) : null);
  const [appId, setAppId] = useState("");
  const [nickname, setNickname] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const appClubs = clubs.filter((club) => club.app === app);
  const selected = appClubs.filter((club) => !excluded.has(club.id));
  const valid = Boolean(app && appId.trim() && nickname.trim() && selected.length > 0);

  return (
    <form
      className="border-line bg-surface mt-3 flex flex-col gap-2 rounded-md border p-3"
      data-testid="add-app-account"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        add.mutate(
          {
            club_ids: selected.map((club) => club.id),
            nickname: nickname.trim(),
            app_account_id: appId.trim(),
          },
          {
            onSuccess: () => {
              setAppId("");
              setNickname("");
              setExcluded(new Set());
              onDone?.();
            },
          },
        );
      }}
    >
      <p className="text-ink text-[14px] font-bold">Приложение</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Приложение">
        {apps.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={app === item}
            onClick={() => {
              setApp(item);
              setExcluded(new Set());
            }}
            className={cn(
              "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-bold",
              app === item ? "border-line-gold bg-gold-soft text-gold" : "border-line text-ink-2",
            )}
          >
            <AppIcon app={item} className="h-6 w-6" />
            {APP_LABELS[item]}
          </button>
        ))}
      </div>

      {app ? (
        <>
          <input
            aria-label="ID в приложении"
            placeholder={`ID в ${APP_LABELS[app]}`}
            inputMode="numeric"
            className={inputClass}
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
          />
          <input
            aria-label="Ник в приложении"
            placeholder="Ник"
            className={inputClass}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <p className="text-ink-3 text-[11.5px]">
            ID и ник одни на все клубы {APP_LABELS[app]} — найдёте их в профиле приложения.
          </p>

          <p className="text-ink mt-1 text-[14px] font-bold">
            {appClubs.length > 1 ? "В каких клубах играете" : "Клуб"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {appClubs.map((club) => {
              const on = !excluded.has(club.id);
              return (
                <button
                  key={club.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setExcluded((current) => {
                      const next = new Set(current);
                      if (on) next.add(club.id);
                      else next.delete(club.id);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px] font-bold",
                    on ? "border-line-gold bg-gold-soft text-gold" : "border-line text-ink-3",
                  )}
                >
                  {on ? "✓ " : ""}
                  {club.name}
                  {club.app_club_id ? (
                    <span className="num text-ink-3 ml-1 font-normal">· {club.app_club_id}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {appClubs.some((club) => club.app_club_id) ? (
            <p className="text-ink-3 text-[11.5px]">
              Рядом с клубом — его ID, по нему вступают в клуб в приложении.
            </p>
          ) : null}
        </>
      ) : null}

      {add.isError ? (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {errorText(add.error)}
        </p>
      ) : null}
      {add.isSuccess ? (
        <p role="status" className="text-live text-[13px] font-semibold">
          Готово — можно заказывать фишки
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!valid || add.isPending}
        className="bg-gold-grad text-ink-ongold mt-1 h-11 rounded-md text-[14px] font-bold disabled:opacity-45"
      >
        Привязать
      </button>
    </form>
  );
}

/**
 * Мои аккаунты. С 24.09 менеджер их не проверяет, а ID вводится на приложение, не на
 * клуб: игрок PPPoker вводит его один раз и отмечает клубы.
 */
export function ChipAccountsPage() {
  const player = usePlayerMe();
  const clubs = usePublicClubs();
  const [adding, setAdding] = useState(false);

  const status = player.data?.status;
  // Новичок на модерации аккаунт пока не привязывает — сервер всё равно ответит 403.
  const locked = status === "pending" || status === "rejected";
  const accounts = groupAccounts(player.data?.accounts ?? []);
  const clubList = clubs.data ?? [];

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="chip-accounts-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/chips" className="text-gold text-[13px] font-bold">
          ← Фишки
        </Link>
      </header>
      <h1 className="text-[17px] font-extrabold tracking-tight">Мои аккаунты</h1>
      <p className="text-ink-3 mt-0.5 text-[12.5px]">
        Ник и ID в покерных приложениях — по ним менеджер выдаёт фишки.
      </p>

      <div className="mt-2 flex flex-col gap-1.5">
        {accounts.map((account) => (
          <AppAccountCard key={account.key} account={account} clubs={clubList} />
        ))}
      </div>

      {status === "pending" || status === "rejected" ? (
        <ModerationNotice status={status} className="mt-3" />
      ) : null}

      {locked || !player.isSuccess ? null : accounts.length === 0 || adding ? (
        <AddAppAccount clubs={clubList} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="border-line-strong text-ink-2 mt-3 h-11 w-full rounded-md border border-dashed text-[14px] font-bold"
        >
          + Другой аккаунт или приложение
        </button>
      )}
    </div>
  );
}
