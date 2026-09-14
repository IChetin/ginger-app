import { useState } from "react";
import { Link } from "react-router-dom";

import type { Tournament } from "@/api/types/tournaments";
import { formatMoney as formatAmount, formatNumber } from "@/features/chips/lib/format";
import { useFeed, type WinItem } from "@/features/feed/api";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { TournamentSheet } from "@/features/tournaments/components/TournamentSheet";
import {
  displayName,
  formatDayLabel,
  formatMoney,
  formatTimeMsk,
  mskDayKey,
} from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

function SectionTitle({
  children,
  link,
}: {
  children: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="mt-5 mb-2 flex items-baseline justify-between">
      <h2 className="text-ink-3 text-[11px] font-bold tracking-[0.08em] uppercase">{children}</h2>
      {link ? (
        <Link to={link.to} className="text-gold text-[12px] font-bold">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Главное событие ближайшего дня: крупная карточка — самая большая гарантия (вопрос 11.17). */
function MainEventCard({
  tournament,
  now,
  onOpen,
}: {
  tournament: Tournament;
  now: Date;
  onOpen: () => void;
}) {
  const guarantee = formatMoney(tournament.guarantee, tournament.club);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="feed-main-event"
      className="border-line-gold bg-surface relative block w-full overflow-hidden rounded-lg border p-3.5 text-left"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,var(--gold-soft),transparent_60%)]"
      />
      <span className="relative flex items-center gap-1.5">
        <span className="text-gold text-[11px] font-bold tracking-[0.08em] uppercase">
          Главное событие · {formatDayLabel(mskDayKey(new Date(tournament.starts_at)), now)}
        </span>
      </span>
      <span className="font-display text-ink relative mt-1.5 block text-[20px] leading-tight font-bold">
        {displayName(tournament)}
      </span>
      <span className="relative mt-2 flex items-end justify-between gap-3">
        <span className="text-ink-2 flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <AppIcon app={tournament.club.app} className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {tournament.club.name} · {formatTimeMsk(tournament.starts_at)} МСК · бай-ин{" "}
            {formatMoney(tournament.buyin, tournament.club)}
          </span>
        </span>
        {guarantee ? (
          <span className="shrink-0 text-right">
            <span className="text-ink-3 block text-[10px] font-bold tracking-[0.06em] uppercase">
              Гарантия
            </span>
            <span className="font-display num text-value-hi block text-[22px] leading-none font-bold">
              {guarantee}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Строка турнира: клуб, время, название, бай-ин и гарантия золотом. */
function EventRow({ tournament, onOpen }: { tournament: Tournament; onOpen: () => void }) {
  const guarantee = formatMoney(tournament.guarantee, tournament.club);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-line flex w-full items-center gap-2.5 border-t px-3 py-2.5 text-left first:border-t-0"
    >
      <AppIcon app={tournament.club.app} className="h-6 w-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[14px] font-semibold">
          {displayName(tournament)}
        </span>
        <span className="text-ink-3 block truncate text-[12px]">
          {tournament.club.name} · {formatTimeMsk(tournament.starts_at)} ·{" "}
          {formatMoney(tournament.buyin, tournament.club)}
        </span>
      </span>
      {guarantee ? (
        <span className="font-display num text-value-mid shrink-0 text-[15px] font-bold">
          {guarantee}
        </span>
      ) : null}
    </button>
  );
}

const winDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

function WinCard({ win }: { win: WinItem }) {
  return (
    <div
      className="border-line bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"
      data-testid="feed-win"
    >
      <span
        aria-hidden="true"
        className="border-line-gold bg-gold-soft text-gold font-display flex h-10 w-10 shrink-0 rotate-45 items-center justify-center rounded-[8px] border text-[13px] font-bold"
      >
        <span className="-rotate-45">{win.place ? `#${win.place}` : "★"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[14px] font-bold">{win.player_nickname}</span>
        <span className="text-ink-3 block truncate text-[12px]">
          {win.tournament_name}
          {win.club ? ` · ${win.club.name}` : ""} · {winDate.format(new Date(win.won_on))}
        </span>
      </span>
      <span className="font-display num text-value-hi shrink-0 text-[17px] font-bold">
        +{formatAmount(win.prize_amount, win.currency_symbol, win.currency_code)}
      </span>
    </div>
  );
}

/**
 * Лента на главной (этап 7): главное событие дня, остальные главные события недели,
 * вечер в каждом клубе, выигрыши игроков. Открыта и гостю — это витрина клуба.
 */
export function FeedSections({ now }: { now: Date }) {
  const feed = useFeed();
  const [selected, setSelected] = useState<Tournament | null>(null);

  if (feed.isPending) {
    return <div className="bg-surface mt-5 h-40 rounded-lg" data-testid="feed-loading" />;
  }
  if (feed.isError) {
    return (
      <p className="text-ink-3 mt-5 text-center text-[13px]">
        Ленту не удалось загрузить — потяните экран позже.
      </p>
    );
  }

  const [main, ...week] = feed.data.main_events;
  const { evening, wins } = feed.data;

  return (
    <div data-testid="feed">
      {main ? (
        <>
          <SectionTitle link={{ to: "/tournaments", label: "Всё расписание" }}>Лента</SectionTitle>
          <MainEventCard tournament={main} now={now} onOpen={() => setSelected(main)} />
        </>
      ) : null}

      {evening.length > 0 ? (
        <>
          <SectionTitle>Вечер в клубах</SectionTitle>
          <div className="border-line bg-surface rounded-lg border" data-testid="feed-evening">
            {evening.map((item) => (
              <EventRow key={item.id} tournament={item} onOpen={() => setSelected(item)} />
            ))}
          </div>
        </>
      ) : null}

      {wins.length > 0 ? (
        <>
          <SectionTitle>Выигрыши</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {wins.slice(0, 10).map((win) => (
              <WinCard key={win.id} win={win} />
            ))}
          </div>
        </>
      ) : null}

      {week.length > 0 ? (
        <>
          <SectionTitle>Главное на неделе</SectionTitle>
          <div className="border-line bg-surface rounded-lg border">
            {week.map((item) => (
              <EventRow key={item.id} tournament={item} onOpen={() => setSelected(item)} />
            ))}
          </div>
        </>
      ) : null}

      {!main && evening.length === 0 && wins.length === 0 ? (
        <p className={cn("text-ink-3 mt-5 text-center text-[13px]")}>
          В ленте пока пусто — загляните в{" "}
          <Link to="/tournaments" className="text-gold font-bold">
            расписание
          </Link>
          .
        </p>
      ) : null}

      <p className="sr-only">{formatNumber(wins.length)} выигрышей в ленте</p>

      <TournamentSheet
        tournament={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
