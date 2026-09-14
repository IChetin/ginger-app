import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { isStaffUser, useMe } from "@/features/auth/hooks";
import { usePlayerMe } from "@/features/chips/hooks";

function Row({
  to,
  title,
  subtitle,
  icon,
}: {
  to: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="border-line flex items-center gap-3 border-t px-3 py-3 first:border-t-0"
    >
      <span className="bg-surface-2 text-gold flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[18px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[15px] font-bold">{title}</span>
        {subtitle ? <span className="text-ink-3 block text-[12px]">{subtitle}</span> : null}
      </span>
      <span className="text-ink-3 text-[18px]" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/** «Ещё» (экраны §1): расписание, клубы, приглашение, профиль, офлайн — всё, что не на главной. */
export function MorePage() {
  const { data: user } = useMe();
  const player = usePlayerMe();

  return (
    <div className="bg-bg min-h-full px-3 pt-3 pb-4" data-testid="more-page">
      <h1 className="text-[20px] font-extrabold tracking-tight">Ещё</h1>
      <nav className="border-line bg-surface mt-2 rounded-md border" aria-label="Разделы">
        <Row
          to="/tournaments"
          title="Расписание турниров"
          subtitle="Все клубы, фильтры"
          icon="🏆"
        />
        <Row to="/clubs" title="Клубы" subtitle="ID, курсы, как зайти" icon="♣" />
        {player.data ? (
          <Row to="/referral" title="Пригласить друга" subtitle="Ссылка и QR" icon="🦊" />
        ) : null}
        {player.data ? (
          <Row
            to="/offline"
            title="Офлайн-игры"
            subtitle={player.data.offline_access ? "Ближайшие игры" : "По приглашению"}
            icon="🃏"
          />
        ) : null}
        {user ? (
          <Row to="/profile" title="Профиль" subtitle={user.email} icon="👤" />
        ) : (
          <Row
            to="/login"
            title="Войти"
            subtitle="Фишки, диалоги и профиль — для игроков клуба"
            icon="🔑"
          />
        )}
        {isStaffUser(user) ? (
          <Row to="/admin" title="Админка" subtitle="Касса, сетки, игроки" icon="⚙" />
        ) : null}
      </nav>
    </div>
  );
}
