import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { GingerWordmark } from "@/components/brand/GingerWordmark";
import { isStaffUser, useMe } from "@/features/auth/hooks";
import { RequestRow } from "@/features/chips/components/RequestRow";
import { useChipRequests, usePlayerMe } from "@/features/chips/hooks";
import { isOpen, requestSummary } from "@/features/chips/lib/format";
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
    <div className="mt-4 mb-1.5 flex items-baseline justify-between">
      <h2 className="text-ink-3 text-[11px] font-bold tracking-[0.06em] uppercase">{children}</h2>
      {link ? (
        <Link to={link.to} className="text-gold text-[12px] font-bold">
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
  const navigate = useNavigate();
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
  const lastTopup = (requests.data ?? []).find(
    (item) => item.kind === "topup" && !isOpen(item.status) && item.status !== "rejected",
  );

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="player-home">
      <header className="flex items-center gap-2 pt-3">
        <img
          src="/icons/ginger-mark-96.png"
          alt=""
          aria-hidden="true"
          className="h-7 w-7 rounded-full"
        />
        <span className="flex flex-1 items-center">
          <GingerWordmark className="h-[15px] w-auto" />
        </span>
        {user ? (
          <span className="text-ink-3 truncate text-[12px] font-semibold">{user.nickname}</span>
        ) : guest ? (
          <Link to="/login" className="text-gold text-[13px] font-bold">
            Войти
          </Link>
        ) : null}
      </header>

      {guest ? (
        <div
          className="border-line-gold bg-surface relative mt-3 overflow-hidden rounded-lg border p-3.5"
          data-testid="home-guest"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_80%_at_0%_0%,var(--gold-soft),transparent_65%)]"
          />
          <p className="font-display text-ink relative text-[19px] leading-tight font-bold">
            Покерные клубы Ginger
          </p>
          <p className="text-ink-2 relative mt-1 text-[13px]">
            Расписание всех клубов, главные турниры и выигрыши игроков. Фишки и связь с менеджером —
            после входа по приглашению.
          </p>
          <div className="relative mt-3 flex gap-1.5">
            <Link
              to="/login"
              className="bg-gold-grad text-ink-ongold flex h-10 flex-1 items-center justify-center rounded-md text-[14px] font-bold"
            >
              Войти
            </Link>
            <Link
              to="/clubs"
              className="border-line-strong bg-surface-2 text-ink flex h-10 flex-1 items-center justify-center rounded-md border text-[14px] font-bold"
            >
              Клубы
            </Link>
          </div>
        </div>
      ) : null}
      {me ? (
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
          {lastTopup ? (
            <button
              type="button"
              onClick={() => navigate(`/chips?repeat=${lastTopup.id}`)}
              className="bg-gold-grad text-ink-ongold flex h-12 w-full items-center justify-center rounded-md px-3 text-[15px] font-bold"
              data-testid="home-repeat"
            >
              <span className="truncate">Ещё {requestSummary(lastTopup)}</span>
            </button>
          ) : null}
          <div className="flex gap-1.5">
            <Link
              to="/chips"
              className={
                lastTopup
                  ? "border-line-strong bg-surface text-ink flex h-11 flex-1 items-center justify-center rounded-md border text-[14px] font-bold"
                  : "bg-gold-grad text-ink-ongold flex h-12 flex-1 items-center justify-center rounded-md text-[15px] font-bold"
              }
            >
              Запросить фишки
            </Link>
            <Link
              to="/dialogs/new"
              className="border-line-strong bg-surface text-ink flex h-11 flex-1 items-center justify-center self-end rounded-md border text-[14px] font-bold"
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
