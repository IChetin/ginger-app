import { useState } from "react";

import type { PlayerKind, PlayerStatus } from "@/api/types/chips";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { PendingAccount, PlayerAdmin } from "@/features/admin/chips/api";
import {
  useAdminPlayers,
  usePendingAccounts,
  useReviewAccount,
  useUpdateAdminPlayer,
} from "@/features/admin/chips/hooks";
import { isAdminUser, useMe } from "@/features/admin/hooks";
import { APP_ICONS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PlayerKind, string> = { credit: "Кредитный", deposit: "Депозитный" };
const STATUS_LABEL: Record<PlayerStatus, string> = {
  active: "Активен",
  blocked: "Заблокирован",
  archived: "В архиве",
};

function PendingRow({ account }: { account: PendingAccount }) {
  const review = useReviewAccount();
  return (
    <div
      data-testid="pending-account"
      className="border-line-gold bg-gold-soft flex items-center gap-2 rounded-md border px-2.5 py-2"
    >
      {APP_ICONS[account.club.app] ? (
        <img src={APP_ICONS[account.club.app]} alt="" className="h-7 w-7 rounded-[22%]" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[13px] font-bold">
          {account.player_nickname} → {account.club.name}
        </span>
        <span className="text-ink-2 block truncate text-[11.5px] select-all">
          {account.nickname} · ID {account.app_account_id}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Отклонить ${account.nickname}`}
        disabled={review.isPending}
        onClick={() => review.mutate({ id: account.id, approve: false })}
        className="text-danger h-9 w-9 rounded-md text-[15px] font-bold disabled:opacity-40"
      >
        ✕
      </button>
      <button
        type="button"
        disabled={review.isPending}
        onClick={() => review.mutate({ id: account.id, approve: true })}
        className="bg-gold-grad text-ink-ongold h-9 rounded-md px-3 text-[13px] font-bold disabled:opacity-45"
      >
        Подтвердить
      </button>
    </div>
  );
}

function PlayerCard({ player, canEdit }: { player: PlayerAdmin; canEdit: boolean }) {
  const update = useUpdateAdminPlayer();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  const patch = (body: Parameters<typeof update.mutate>[0]["body"]) =>
    update.mutate({ id: player.id, body });

  const setStatus = async (status: PlayerStatus) => {
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
  };

  return (
    <div data-testid="player-card" className="border-line bg-surface rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[14px] font-bold">{player.nickname}</span>
          <span className="text-ink-3 block truncate text-[11.5px]">
            {player.accounts.map((account) => account.club.name).join(", ") || "без аккаунтов"}
          </span>
        </span>
        <span className="text-ink-3 text-[11px] font-semibold">{KIND_LABEL[player.kind]}</span>
        {player.status !== "active" ? (
          <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-bold">
            {STATUS_LABEL[player.status]}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-line border-t px-2.5 py-2 text-[12.5px]">
          <p className="text-ink-2 select-all">{player.email}</p>
          <ul className="text-ink-2 mt-1 space-y-0.5">
            {player.accounts.map((account) => (
              <li key={account.id}>
                {account.club.name}: {account.nickname} · ID {account.app_account_id}
                {account.status !== "confirmed" ? (
                  <span className="text-warn"> · {account.status}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-ink-3 mt-1">
            Публикация результатов: {player.results_consent ? "разрешена" : "анонимно"}
            {player.birthday
              ? ` · ДР ${player.birthday.slice(5).split("-").reverse().join(".")}`
              : ""}
          </p>
          {canEdit ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <label className="font-bold">
                Тип
                <select
                  aria-label="Тип игрока"
                  value={player.kind}
                  disabled={update.isPending}
                  onChange={(event) => patch({ kind: event.target.value as PlayerKind })}
                  className="border-line-strong bg-surface-2 mt-0.5 block h-9 w-full rounded-md border px-1.5 font-normal"
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
                  onChange={(event) => void setStatus(event.target.value as PlayerStatus)}
                  className="border-line-strong bg-surface-2 mt-0.5 block h-9 w-full rounded-md border px-1.5 font-normal"
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
          ) : (
            <p className="text-ink-3 mt-1.5">Тип и статус меняет администратор.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Игроки: сверху — аккаунты на подтверждении (без них заявку не оставить), ниже — база. */
export function AdminPlayersPage() {
  const { data: me } = useMe();
  const pending = usePendingAccounts();
  const players = useAdminPlayers();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const filtered =
    players.data?.filter(
      (player) =>
        !needle ||
        player.nickname.toLowerCase().includes(needle) ||
        player.email.toLowerCase().includes(needle) ||
        player.accounts.some(
          (account) =>
            account.nickname.toLowerCase().includes(needle) ||
            account.app_account_id.includes(needle),
        ),
    ) ?? [];

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-players">
      <h1 className="text-[20px] font-extrabold">Игроки</h1>

      {pending.data && pending.data.length > 0 ? (
        <section className="mt-2">
          <h2 className="text-ink-3 text-[11px] font-bold tracking-[0.08em] uppercase">
            Аккаунты на подтверждении · {pending.data.length}
          </h2>
          <div className="mt-1 flex flex-col gap-1.5">
            {pending.data.map((account) => (
              <PendingRow key={account.id} account={account} />
            ))}
          </div>
        </section>
      ) : null}

      <input
        type="search"
        aria-label="Поиск игрока"
        placeholder="Ник, email, ID в клубе"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={cn(
          "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px]",
          "mt-3",
        )}
      />
      {players.isPending ? <div className="bg-surface mt-2 h-32 rounded-md" /> : null}
      <p className="text-ink-3 mt-2 text-[11.5px]">Всего: {players.data?.length ?? 0}</p>
      <div className="mt-1 flex flex-col gap-1.5">
        {filtered.map((player) => (
          <PlayerCard key={player.id} player={player} canEdit={isAdminUser(me)} />
        ))}
      </div>
    </div>
  );
}
