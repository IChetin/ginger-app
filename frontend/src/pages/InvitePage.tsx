import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { checkInvite } from "@/features/chips/api";
import { rememberInvite } from "@/features/chips/lib/invite";

const REASONS: Record<string, string> = {
  used: "По этой ссылке уже зарегистрировались. Попросите новую.",
  expired: "Срок приглашения истёк. Попросите новую ссылку.",
  revoked: "Приглашение отозвано. Попросите новую ссылку.",
  paused: "По этой ссылке сегодня уже много регистраций. Попросите у друга новую ссылку.",
  not_found: "Приглашение не найдено. Проверьте ссылку или попросите новую.",
};

/**
 * /invite/:token — одноразовый инвайт админа, /r/:token — личная ссылка игрока.
 * Проверяем ссылку, показываем, кто пригласил, и ведём на регистрацию, запомнив приглашение.
 */
export function InvitePage() {
  const { token = "" } = useParams();
  const query = useQuery({
    queryKey: ["invite", token],
    queryFn: () => checkInvite(token),
    retry: false,
  });

  if (query.data?.valid && !query.data.referrer_nickname) {
    rememberInvite(token);
    return <Navigate to={`/register?invite=${encodeURIComponent(token)}`} replace />;
  }

  if (query.data?.valid && query.data.referrer_nickname) {
    rememberInvite(token);
    return (
      <AuthShell toast={null} onBack={undefined}>
        <div data-testid="referral-invite">
          <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">
            {query.data.referrer_nickname} зовёт вас в Ginger
          </h1>
          <p className="text-ink-2 mt-2 text-[14px]">
            Фишки в клубах, расписание турниров и связь с менеджером — в одном приложении.
          </p>
          <Link
            to={`/register?invite=${encodeURIComponent(token)}`}
            className="bg-gold-grad text-ink-ongold mt-5 flex h-12 items-center justify-center rounded-md text-[15px] font-bold"
          >
            Зарегистрироваться
          </Link>
          <Link to="/login" className="text-gold mt-4 inline-block text-[14px] font-bold">
            Уже есть аккаунт — войти
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell toast={null} onBack={undefined}>
      <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">
        Приглашение в Ginger
      </h1>
      <p className="text-ink-2 mt-2 text-[14px]" role="status">
        {query.isPending
          ? "Проверяем ссылку…"
          : (REASONS[query.data?.reason ?? "not_found"] ?? REASONS.not_found)}
      </p>
      {!query.isPending ? (
        <Link to="/login" className="text-gold mt-4 inline-block text-[14px] font-bold">
          Уже есть аккаунт — войти
        </Link>
      ) : null}
    </AuthShell>
  );
}
