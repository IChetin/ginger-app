import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { ModerationNotice } from "@/features/auth/ModerationNotice";
import { GingerFox } from "@/components/brand/GingerFox";
import { GingerWordmark } from "@/components/brand/GingerWordmark";
import { isStaffUser, useMe } from "@/features/auth/hooks";
import { RequestRow } from "@/features/chips/components/RequestRow";
import { useChipRequests, usePlayerMe } from "@/features/chips/hooks";
import { isOpen } from "@/features/chips/lib/format";
import { FeedSections } from "@/features/feed/FeedSections";
import { InstallPlaque } from "@/features/onboarding/InstallPlaque";
import { useThreads } from "@/features/threads/hooks";
import { useNow } from "@/features/tournaments/hooks";

function SectionTitle({
  children,
  link,
}: {
  children: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="mt-5 mb-2.5 flex items-center gap-3">
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

/**
 * Главная (экраны §3.2): сверху личные блоки игрока по срочности — активная заявка, ответ
 * менеджера, «Ещё 100 в Ginger», — ниже лента клуба. Гость видит приветствие и ленту: главная
 * — витрина, а не форма входа (решение Ивана 14.09).
 */
export function PlayerHomePage() {
  const me_ = useMe();
  const user = me_.data;
  const guest = me_.isFetched && !user;
  const player = usePlayerMe();
  const requests = useChipRequests(player.isSuccess);
  const threads = useThreads(player.isSuccess);
  const now = useNow(60_000);

  const notPlayer = player.error instanceof ApiError && player.error.code === "not_a_player";
  const me = player.data;

  if (me?.status === "blocked") {
    return (
      <div className="border-danger/35 bg-danger-soft mx-3 mt-6 rounded-md border px-4 py-6 text-center">
        <p className="text-danger text-[16px] font-extrabold">Вы заблокированы</p>
        <p className="text-ink-2 mt-1 text-[13px]">Обратитесь к администратору клуба.</p>
      </div>
    );
  }

  const open = (requests.data ?? []).filter((item) => isOpen(item.status));
  const replies = (threads.data ?? []).filter((thread) => thread.unread);
  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="player-home">
      {/* Логотип крупно (Иван, 28.09: мелкий не видно): лиса и надпись в строку. */}
      <header className="flex items-center gap-3 pt-3 pb-2.5">
        <span className="flex shrink-0 items-center gap-2.5">
          <GingerFox className="h-12 w-auto" />
          <GingerWordmark className="h-[21px] w-auto" />
        </span>
        <span className="flex min-w-0 flex-1 justify-end">
          {user ? (
            <span className="text-ink-3 truncate text-[12px] font-semibold">{user.nickname}</span>
          ) : guest ? (
            <Link
              to="/login"
              className="text-gold font-display text-[11px] font-semibold tracking-[0.16em] uppercase"
            >
              Войти
            </Link>
          ) : null}
        </span>
      </header>
      <div aria-hidden="true" className="deco-rule" />

      {guest ? (
        <div
          className="deco-frame deco-corners mt-4 px-5 pt-6 pb-5 text-center"
          data-testid="home-guest"
        >
          <p className="font-display text-ink text-[18px] leading-tight font-bold tracking-[0.12em] uppercase">
            Покерные клубы Ginger
          </p>
          <p className="text-ink-2 mt-2 text-[13px]">
            Расписание всех клубов, главные турниры и выигрыши игроков. Фишки и связь с менеджером —
            после входа по приглашению.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/login"
              className="bg-gold-grad text-ink-ongold flex h-11 flex-1 items-center justify-center text-[13px] font-bold"
            >
              Войти
            </Link>
            <Link
              to="/clubs"
              className="deco-frame-sm text-gold font-display flex h-11 flex-1 items-center justify-center text-[13px] font-semibold tracking-[0.08em] uppercase"
            >
              Клубы
            </Link>
          </div>
        </div>
      ) : null}
      {me ? <ModerationNotice status={me.status} className="mt-3" /> : null}
      {me && me.status === "active" ? (
        <p className="text-ink-3 mt-0.5 text-[12px]">
          {me.cashdesk_open
            ? `Касса открыта · ${me.cashdesk_hours}`
            : `Касса закрыта · ${me.cashdesk_hours} — заявка встанет в очередь`}
        </p>
      ) : null}

      {me ? <InstallPlaque /> : null}

      {notPlayer && isStaffUser(user) ? (
        <Link
          to="/admin/chips"
          className="border-line-gold bg-gold-soft text-ink mt-3 block rounded-md border px-3 py-2.5 text-[14px] font-bold"
        >
          Вы менеджер — очередь заявок в админке →
        </Link>
      ) : null}

      {open.length > 0 ? (
        <>
          <SectionTitle>В работе</SectionTitle>
          <div className="flex flex-col gap-1.5" data-testid="home-open-requests">
            {open.map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </div>
        </>
      ) : null}

      {replies.length > 0 ? (
        <>
          <SectionTitle>Ответ менеджера</SectionTitle>
          <div className="flex flex-col gap-1.5" data-testid="home-replies">
            {replies.map((thread) => (
              <Link
                key={thread.id}
                to={`/dialogs/${thread.id}`}
                className="border-line-gold bg-gold-soft block rounded-md border px-2.5 py-2"
              >
                <span className="text-ink block truncate text-[14px] font-bold">
                  {thread.subject}
                </span>
                <span className="text-ink-2 block truncate text-[12.5px]">
                  {thread.last_message_preview}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {me ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Link
              to="/chips"
              className="bg-gold-grad text-ink-ongold flex h-12 flex-[1.4] items-center justify-center text-[13.5px] font-bold"
            >
              Запросить фишки
            </Link>
            <Link
              to="/dialogs/new"
              className="deco-frame-sm text-gold font-display flex h-12 flex-1 items-center justify-center text-[13px] font-semibold tracking-[0.08em] uppercase"
            >
              Написать
            </Link>
          </div>
        </div>
      ) : null}

      <FeedSections now={now} />
    </div>
  );
}
