import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { PlayerAccount } from "@/api/types/chips";
import { ModerationNotice } from "@/features/auth/ModerationNotice";
import {
  useAddPlayerAccount,
  usePlayerMe,
  usePublicClubs,
  useUpdatePlayerAccount,
} from "@/features/chips/hooks";
import { APP_ICONS, APP_LABELS } from "@/features/tournaments/lib/format";

const inputClass =
  "border-line bg-surface text-ink h-10 w-full rounded-md border px-2.5 text-[14px] outline-none";

/** Аккаунт в списке: тап «Изменить» раскрывает правку ника и ID прямо в строке. */
function AccountRow({ account }: { account: PlayerAccount }) {
  const update = useUpdatePlayerAccount();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(account.nickname);
  const [appId, setAppId] = useState(account.app_account_id);
  const icon = APP_ICONS[account.club.app];
  const valid = Boolean(nickname.trim() && appId.trim());

  return (
    <div className="border-line bg-surface rounded-md border px-2.5 py-2" data-testid="account-row">
      <div className="flex items-center gap-2">
        {icon ? (
          <img src={icon} alt="" aria-hidden="true" className="h-7 w-7 rounded-[22%]" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[14px] font-bold">{account.club.name}</span>
          <span className="text-ink-3 block truncate text-[12px]">
            {account.nickname} · ID {account.app_account_id}
          </span>
        </span>
        {account.status === "rejected" ? (
          <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-bold">
            Отклонён
          </span>
        ) : null}
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Изменить ${account.club.name}`}
            className="text-gold h-8 shrink-0 px-1 text-[13px] font-bold"
          >
            Изменить
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="mt-2 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            update.mutate(
              { id: account.id, nickname: nickname.trim(), app_account_id: appId.trim() },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <input
            aria-label="Ник в клубе"
            className={inputClass}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <input
            aria-label="ID аккаунта"
            inputMode="numeric"
            className={inputClass}
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
          />
          {update.isError ? (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {update.error instanceof ApiError ? update.error.message : "Не удалось сохранить"}
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
                setAppId(account.app_account_id);
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
 * Мои аккаунты в клубах. С 24.09 менеджер их не проверяет: привязанный аккаунт сразу в
 * работе, ошибся — игрок сам правит ник и ID.
 */
export function ChipAccountsPage() {
  const player = usePlayerMe();
  const clubs = usePublicClubs();
  const add = useAddPlayerAccount();
  const [clubId, setClubId] = useState("");
  const [nickname, setNickname] = useState("");
  const [appId, setAppId] = useState("");

  const status = player.data?.status;
  // Новичок на модерации аккаунт пока не привязывает — сервер всё равно ответит 403.
  const locked = status === "pending" || status === "rejected";
  const club = clubs.data?.find((item) => item.id === clubId) ?? null;
  const valid = Boolean(clubId && nickname.trim() && appId.trim());
  const accounts = player.data?.accounts ?? [];

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
          <AccountRow key={account.id} account={account} />
        ))}
      </div>

      {status === "pending" || status === "rejected" ? (
        <ModerationNotice status={status} className="mt-3" />
      ) : null}

      {locked ? null : (
        <form
          className="border-line bg-surface mt-3 flex flex-col gap-2 rounded-md border p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            add.mutate(
              { club_id: clubId, nickname: nickname.trim(), app_account_id: appId.trim() },
              {
                onSuccess: () => {
                  setNickname("");
                  setAppId("");
                },
              },
            );
          }}
        >
          <p className="text-ink text-[14px] font-bold">
            {accounts.length > 0 ? "Добавить ещё аккаунт" : "Привязать аккаунт"}
          </p>
          <select
            aria-label="Клуб"
            className={inputClass}
            value={clubId}
            onChange={(event) => setClubId(event.target.value)}
          >
            <option value="">Выберите клуб</option>
            {clubs.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {APP_LABELS[item.app]}
              </option>
            ))}
          </select>
          {club?.app_club_id ? (
            <p className="text-ink-3 text-[12px]">
              ID клуба в {APP_LABELS[club.app]}: <b className="text-ink">{club.app_club_id}</b>
            </p>
          ) : null}
          <input
            aria-label="Ник в клубе"
            placeholder="Ник в клубе"
            className={inputClass}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <input
            aria-label="ID аккаунта"
            placeholder="ID аккаунта в приложении"
            inputMode="numeric"
            className={inputClass}
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
          />
          {add.isError ? (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {add.error instanceof ApiError ? add.error.message : "Не удалось сохранить"}
            </p>
          ) : null}
          {add.isSuccess ? (
            <p role="status" className="text-live text-[13px] font-semibold">
              Готово — можно заказывать фишки в этот клуб
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!valid || add.isPending}
            className="bg-gold-grad text-ink-ongold h-10 rounded-md text-[14px] font-bold disabled:opacity-45"
          >
            Привязать
          </button>
        </form>
      )}
    </div>
  );
}
