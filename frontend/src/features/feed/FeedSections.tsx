import { useState } from "react";
import { Link } from "react-router-dom";

import type { Tournament } from "@/api/types/tournaments";
import { formatMoney as formatAmount, formatNumber } from "@/features/chips/lib/format";
import { useFeed, type FeedPost, type WinItem } from "@/features/feed/api";
import { Day2Banner } from "@/features/promo/Day2Banner";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { TableView } from "@/features/tournaments/components/ScheduleTable";
import { TournamentSheet } from "@/features/tournaments/components/TournamentSheet";
import {
  displayName,
  formatMoney,
  formatTimeMsk,
  groupByDay,
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
    <div className="mt-6 mb-2.5 flex items-center gap-3">
      <h2 className="deco-title min-w-0 flex-1">{children}</h2>
      {link ? (
        <Link
          to={link.to}
          className="text-gold font-display shrink-0 text-[10.5px] font-semibold tracking-[0.14em] uppercase"
        >
          {link.label}
        </Link>
      ) : null}
    </div>
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

const postDay = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Moscow",
});
const LONG_BODY = 220;

/** Когда запись вышла — коротко и всегда одинаково (Иван, 27.09): «27.09 10:00». */
function postStamp(iso: string): string {
  return `${postDay.format(new Date(iso))} ${formatTimeMsk(iso)}`;
}

/**
 * Новость: запись менеджера (анонс, афиша, итоги) или автозапись о турнире — у неё
 * «Подробнее» открывает карточку турнира. Длинный текст раскрывается по кнопке.
 */
function PostCard({
  post,
  onOpenTournament,
}: {
  post: FeedPost;
  onOpenTournament: (tournament: Tournament) => void;
}) {
  const tournament = post.tournament ?? null;
  const [expanded, setExpanded] = useState(false);
  const body = post.body ?? "";
  const long = body.length > LONG_BODY;
  return (
    <article
      className="border-line bg-surface overflow-hidden rounded-lg border"
      data-testid="feed-post"
    >
      {post.image_url ? (
        <img
          src={post.image_url}
          alt=""
          loading="lazy"
          className="bg-surface-2 block max-h-[240px] w-full object-cover"
        />
      ) : null}
      <div className="px-3 py-2.5">
        <div className="text-ink-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
          {post.club ? <AppIcon app={post.club.app} className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">
            {post.is_pinned ? "Закреплено · " : ""}
            {postStamp(post.published_at)}
            {post.club ? ` · ${post.club.name}` : ""}
          </span>
        </div>
        <h3 className="text-ink mt-1 font-sans text-[16px] leading-tight font-bold">
          {post.title}
        </h3>
        {body ? (
          <p
            className={cn(
              "text-ink-2 mt-1 text-[13px] whitespace-pre-line",
              long && !expanded && "line-clamp-4",
            )}
          >
            {body}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-3">
          {tournament ? (
            <button
              type="button"
              onClick={() => onOpenTournament(tournament)}
              className="text-gold text-[13px] font-bold"
            >
              Подробнее о турнире →
            </button>
          ) : null}
          {post.link_url ? (
            <Link to={post.link_url} className="text-gold text-[13px] font-bold">
              {post.link_label || "Подробнее"} →
            </Link>
          ) : null}
          {long ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-ink-3 text-[13px] font-bold"
            >
              {expanded ? "Свернуть" : "Читать"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
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
        className="border-line-gold bg-gold-soft text-gold font-display mx-1 flex h-9 w-9 shrink-0 rotate-45 items-center justify-center rounded-none border text-[13px] font-bold"
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
 * Лента на главной (этап 7): записи менеджера, главное событие дня, остальные главные
 * события недели, вечер в каждом клубе, выигрыши игроков. Открыта и гостю — это витрина клуба.
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

  const { posts, majors, evening, wins } = feed.data;

  return (
    <div data-testid="feed">
      {posts.length > 0 ? (
        <>
          <SectionTitle>Новости</SectionTitle>
          <div className="flex flex-col gap-1.5" data-testid="feed-posts">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onOpenTournament={setSelected} />
            ))}
          </div>
        </>
      ) : null}

      {majors.length > 0 ? (
        <>
          <SectionTitle link={{ to: "/tournaments", label: "Всё расписание" }}>Major</SectionTitle>
          {/* Главное в каждом клубе за день — в виде таблицы расписания (Иван, 27.09). */}
          <div
            className="border-line bg-surface -mx-0 overflow-hidden rounded-lg border"
            data-testid="feed-majors"
          >
            <TableView groups={groupByDay(majors)} now={now} onSelect={setSelected} />
          </div>
        </>
      ) : null}

      <Day2Banner />

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

      {majors.length === 0 && posts.length === 0 && evening.length === 0 && wins.length === 0 ? (
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
