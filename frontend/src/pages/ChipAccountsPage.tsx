import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { PlayerAccountStatus } from "@/api/types/chips";
import { useAddPlayerAccount, usePlayerMe, usePublicClubs } from "@/features/chips/hooks";
import { APP_LABELS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<PlayerAccountStatus, { label: string; className: string }> = {
  pending: { label: "На проверке", className: "bg-surface-3 text-ink-2" },
  confirmed: { label: "Подтверждён", className: "bg-live-soft text-live" },
  rejected: { label: "Отклонён", className: "bg-danger-soft text-danger" },
};

const inputClass =
  "border-line bg-surface text-ink h-10 w-full rounded-md border px-2.5 text-[14px] outline-none";

/** Игрок сам указывает аккаунт, менеджер подтверждает (ответ 11.9). */
export function ChipAccountsPage() {
  const player = usePlayerMe();
  const clubs = usePublicClubs();
  const add = useAddPlayerAccount();
  const [clubId, setClubId] = useState("");
  const [nickname, setNickname] = useState("");
  const [appId, setAppId] = useState("");

  const club = clubs.data?.find((item) => item.id === clubId) ?? null;
  const valid = Boolean(clubId && nickname.trim() && appId.trim());

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="chip-accounts-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/chips" className="text-gold text-[13px] font-bold">
          ← Фишки
        </Link>
      </header>
      <h1 className="text-[17px] font-extrabold tracking-tight">Аккаунты в клубах</h1>

      <div className="mt-2 flex flex-col gap-1.5">
        {(player.data?.accounts ?? []).map((account) => (
          <div
            key={account.id}
            className="border-line bg-surface flex items-center gap-2 rounded-md border px-2.5 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[14px] font-bold">
                {account.club.name}
              </span>
              <span className="text-ink-3 block text-[11.5px]">
                {account.nickname} · ID {account.app_account_id}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                STATUS[account.status].className,
              )}
            >
              {STATUS[account.status].label}
            </span>
          </div>
        ))}
      </div>

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
        <p className="text-ink text-[14px] font-bold">Привязать аккаунт</p>
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
          <p role="status" className="text-ink-2 text-[13px]">
            Отправлено на проверку менеджеру
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!valid || add.isPending}
          className="bg-gold-grad text-ink-ongold h-10 rounded-md text-[14px] font-bold disabled:opacity-45"
        >
          Отправить на проверку
        </button>
      </form>
    </div>
  );
}
