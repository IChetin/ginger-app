import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { PlayerKind } from "@/api/types/chips";
import type { PendingAccount, PlayerAdmin } from "@/features/admin/chips/api";
import {
  useAdminPlayers,
  usePendingAccounts,
  useReviewAccount,
} from "@/features/admin/chips/hooks";
import { PLAYERS_EXPORT_URL } from "@/features/admin/crm/crmApi";
import { formatAgo, formatBirthdaySoon } from "@/features/admin/crm/hooks";
import { isAdminUser, useMe } from "@/features/admin/hooks";
import { APP_ICONS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PlayerKind, string> = { credit: "Кредитный", deposit: "Депозитный" };
const BIRTHDAY_WINDOW_DAYS = 14;

type Segment = "all" | "sleeping" | "birthdays" | "credit" | "deposit";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "sleeping", label: "Спящие" },
  { value: "birthdays", label: "ДР скоро" },
  { value: "credit", label: "Кредитные" },
  { value: "deposit", label: "Депозитные" },
];

function inSegment(player: PlayerAdmin, segment: Segment): boolean {
  switch (segment) {
    case "all":
      return true;
    case "sleeping":
      return player.status === "active" && player.sleeping;
    case "birthdays":
      return player.days_to_birthday !== null && player.days_to_birthday <= BIRTHDAY_WINDOW_DAYS;
    case "credit":
    case "deposit":
      return player.kind === segment;
  }
}

function matches(player: PlayerAdmin, needle: string): boolean {
  if (!needle) return true;
  return (
    player.nickname.toLowerCase().includes(needle) ||
    player.email.toLowerCase().includes(needle) ||
    (player.real_name ?? "").toLowerCase().includes(needle) ||
    (player.phone ?? "").includes(needle) ||
    (player.telegram ?? "").toLowerCase().includes(needle) ||
    player.accounts.some(
      (account) =>
        account.nickname.toLowerCase().includes(needle) || account.app_account_id.includes(needle),
    )
  );
}

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

function PlayerRow({ player }: { player: PlayerAdmin }) {
  const birthday =
    player.days_to_birthday !== null && player.days_to_birthday <= BIRTHDAY_WINDOW_DAYS
      ? formatBirthdaySoon(player.days_to_birthday)
      : null;
  return (
    <Link
      to={`/admin/players/${player.id}`}
      data-testid="player-row"
      className="border-line bg-surface hover:border-line-strong flex items-center gap-2 rounded-md border px-2.5 py-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-ink truncate text-[14px] font-bold">{player.nickname}</span>
          {player.real_name ? (
            <span className="text-ink-3 truncate text-[12px]">{player.real_name}</span>
          ) : null}
        </span>
        <span className="text-ink-3 block truncate text-[11.5px]">
          {KIND_LABEL[player.kind]} ·{" "}
          {player.accounts.map((account) => account.club.name).join(", ") || "без аккаунтов"}
        </span>
        {player.tags.length > 0 ? (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {player.tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface-3 text-ink-2 rounded-full px-1.5 text-[10.5px] font-bold"
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            "text-[11.5px] font-semibold",
            player.sleeping ? "text-warn" : "text-ink-3",
          )}
        >
          {formatAgo(player.last_activity_at)}
        </span>
        {player.status !== "active" ? (
          <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10.5px] font-bold">
            {player.status === "blocked" ? "Заблокирован" : "В архиве"}
          </span>
        ) : null}
        {birthday ? (
          <span className="bg-gold-soft text-gold rounded-full px-2 py-0.5 text-[10.5px] font-bold">
            {birthday}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Игроки (ТЗ §9а.3): аккаунты на подтверждении, сегменты базы, поиск, выгрузка. */
export function AdminPlayersPage() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const pending = usePendingAccounts();
  const players = useAdminPlayers();
  const [search, setSearch] = useState("");

  const segment = (params.get("segment") as Segment | null) ?? "all";
  const tag = params.get("tag");
  const needle = search.trim().toLowerCase();

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of players.data ?? []) {
      for (const item of player.tags) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [players.data]);

  const filtered = useMemo(() => {
    const list = (players.data ?? []).filter(
      (player) =>
        inSegment(player, segment) &&
        (!tag || player.tags.includes(tag)) &&
        matches(player, needle),
    );
    if (segment === "birthdays") {
      list.sort((a, b) => (a.days_to_birthday ?? 999) - (b.days_to_birthday ?? 999));
    }
    return list;
  }, [players.data, segment, tag, needle]);

  const select = (next: { segment?: Segment; tag?: string | null }) => {
    const nextParams = new URLSearchParams(params);
    if (next.segment !== undefined) {
      if (next.segment === "all") nextParams.delete("segment");
      else nextParams.set("segment", next.segment);
    }
    if (next.tag !== undefined) {
      if (next.tag) nextParams.set("tag", next.tag);
      else nextParams.delete("tag");
    }
    setParams(nextParams, { replace: true });
  };

  const broadcastLink =
    tag !== null
      ? `/admin/broadcasts?segment=tag&tag=${encodeURIComponent(tag)}`
      : segment === "sleeping" || segment === "credit" || segment === "deposit"
        ? `/admin/broadcasts?segment=${segment}`
        : "/admin/broadcasts";

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-players">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-[20px] font-extrabold">Игроки</h1>
        {isAdminUser(me) ? (
          <>
            <Link
              to={broadcastLink}
              className="border-line-strong bg-surface text-ink inline-flex h-9 items-center rounded-md border px-3 text-[13px] font-bold"
            >
              Рассылка
            </Link>
            <a
              href={PLAYERS_EXPORT_URL}
              className="border-line-strong bg-surface text-ink inline-flex h-9 items-center rounded-md border px-3 text-[13px] font-bold"
            >
              Выгрузить CSV
            </a>
          </>
        ) : null}
      </div>

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

      <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
        {SEGMENTS.map((option) => {
          const count = (players.data ?? []).filter((player) =>
            inSegment(player, option.value),
          ).length;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={segment === option.value}
              onClick={() => select({ segment: option.value })}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-bold",
                segment === option.value
                  ? "border-line-gold bg-gold-soft text-gold"
                  : "border-line bg-surface-2 text-ink-2",
              )}
            >
              {option.label}
              {players.data ? <span className="num ml-1 opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {allTags.length > 0 ? (
        <div className="-mx-3 mt-1.5 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
          {allTags.map(([item, count]) => (
            <button
              key={item}
              type="button"
              aria-pressed={tag === item}
              onClick={() => select({ tag: tag === item ? null : item })}
              className={cn(
                "h-7 shrink-0 rounded-full border px-2.5 text-[12px] font-bold",
                tag === item
                  ? "border-line-gold bg-gold-soft text-gold"
                  : "border-line text-ink-3 bg-transparent",
              )}
            >
              #{item} <span className="num opacity-70">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="search"
        aria-label="Поиск игрока"
        placeholder="Ник, имя, email, телефон, ID в клубе"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="border-line-strong bg-surface-2 mt-2 block h-10 w-full rounded-md border px-2.5 text-[14px]"
      />
      {players.isPending ? <div className="bg-surface mt-2 h-32 rounded-md" /> : null}
      <p className="text-ink-3 mt-2 text-[11.5px]">
        Показано: {filtered.length} из {players.data?.length ?? 0}
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {filtered.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </div>
    </div>
  );
}
