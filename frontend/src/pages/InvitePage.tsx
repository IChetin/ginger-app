import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { checkInvite } from "@/features/chips/api";
import { rememberInvite } from "@/features/chips/lib/invite";

const REASONS: Record<string, string> = {
  used: "По этой ссылке уже зарегистрировались. Попросите у менеджера новую.",
  expired: "Срок приглашения истёк. Попросите у менеджера новую ссылку.",
  revoked: "Приглашение отозвано. Попросите у менеджера новую ссылку.",
  not_found: "Приглашение не найдено. Проверьте ссылку или попросите новую.",
};

/** /invite/:token — проверяем ссылку и ведём на регистрацию, запомнив приглашение. */
export function InvitePage() {
  const { token = "" } = useParams();
  const query = useQuery({
    queryKey: ["invite", token],
    queryFn: () => checkInvite(token),
    retry: false,
  });

  if (query.data?.valid) {
    rememberInvite(token);
    return <Navigate to={`/register?invite=${encodeURIComponent(token)}`} replace />;
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
