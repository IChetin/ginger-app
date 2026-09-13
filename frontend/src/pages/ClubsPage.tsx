import { useState } from "react";
import { Link } from "react-router-dom";

import type { PublicClub } from "@/api/types/chips";
import { usePlayerMe, usePublicClubs } from "@/features/chips/hooks";
import { formatNumber } from "@/features/chips/lib/format";
import { APP_ICONS, APP_LABELS } from "@/features/tournaments/lib/format";

const SYMBOLS: Record<string, string> = { USDT: "$", USD: "$", RUB: "₽", EUR: "€" };

function rateLabel(club: PublicClub): string | null {
  if (!club.chip_value || !club.chip_currency_code) return null;
  const symbol = SYMBOLS[club.chip_currency_code];
  const value = formatNumber(club.chip_value);
  return `1 фишка = ${symbol ? `${symbol}${value}` : `${value} ${club.chip_currency_code}`}`;
}

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => setCopied(false));
      }}
      className="border-line-strong bg-surface-2 text-ink num h-7 rounded-md border px-2 text-[12px] font-bold"
    >
      {copied ? "Скопировано" : `ID ${value}`}
    </button>
  );
}

function ClubCard({ club, account }: { club: PublicClub; account: string | null }) {
  const rate = rateLabel(club);
  const details = [club.games, club.limits, club.peak_hours].filter(Boolean).join(" · ");
  return (
    <article
      data-testid="club-card"
      className={`bg-surface rounded-md border px-3 py-2.5 ${club.is_promoted ? "border-line-gold" : "border-line"}`}
    >
      <div className="flex items-center gap-2.5">
        {APP_ICONS[club.app] ? (
          <img src={APP_ICONS[club.app]} alt="" className="h-9 w-9 rounded-[22%]" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-ink truncate text-[15px] font-extrabold">{club.name}</h2>
          <p className="text-ink-3 truncate text-[12px]">
            {APP_LABELS[club.app]}
            {rate ? ` · ${rate}` : ""}
          </p>
        </div>
        {club.app_club_id ? <CopyId value={club.app_club_id} /> : null}
      </div>
      {details ? <p className="text-ink-2 mt-1.5 text-[12.5px]">{details}</p> : null}
      <p className="mt-1 text-[12px]">
        {account ? (
          <span className="text-live font-semibold">Ваш аккаунт: {account}</span>
        ) : (
          <Link to="/chips/accounts" className="text-gold font-bold">
            Привязать аккаунт
          </Link>
        )}
      </p>
      {club.join_steps ? (
        <details className="mt-1.5 text-[12.5px]">
          <summary className="text-ink-2 cursor-pointer font-bold">Как зайти в клуб</summary>
          <p className="text-ink-2 mt-1 whitespace-pre-wrap">{club.join_steps}</p>
        </details>
      ) : null}
      <div className="mt-2 flex gap-1.5">
        {club.download_url ? (
          <a
            href={club.download_url}
            target="_blank"
            rel="noreferrer"
            className="border-line-strong bg-surface-2 text-ink flex h-9 flex-1 items-center justify-center rounded-md border text-[13px] font-bold"
          >
            Скачать {APP_LABELS[club.app]}
          </a>
        ) : null}
        <Link
          to={`/chips?club=${club.id}`}
          className="bg-gold-grad text-ink-ongold flex h-9 flex-1 items-center justify-center rounded-md text-[13px] font-bold"
        >
          Запросить фишки сюда
        </Link>
      </div>
    </article>
  );
}

/** Клубы (экраны §3.6): карточки площадок, ID с копированием, «Запросить фишки сюда». */
export function ClubsPage() {
  const clubs = usePublicClubs();
  const player = usePlayerMe();
  const accountByClub = new Map(
    (player.data?.accounts ?? [])
      .filter((account) => account.status !== "rejected")
      .map((account) => [account.club.id, account.nickname]),
  );

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="clubs-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/more" className="text-gold text-[13px] font-bold">
          ← Ещё
        </Link>
      </header>
      <h1 className="text-[20px] font-extrabold tracking-tight">Клубы</h1>
      {clubs.isPending ? <div className="bg-surface mt-2 h-40 rounded-md" /> : null}
      <div className="mt-2 flex flex-col gap-2">
        {clubs.data?.map((club) => (
          <ClubCard key={club.id} club={club} account={accountByClub.get(club.id) ?? null} />
        ))}
      </div>
    </div>
  );
}
