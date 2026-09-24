import { Link } from "react-router-dom";

import type { PlayerStatus } from "@/api/types/chips";
import { cn } from "@/lib/utils";

/**
 * Самостоятельная регистрация (24.09): до подтверждения менеджером человеку открыта витрина
 * и диалог. Одна и та же плашка — на главной и вместо разделов, которые пока закрыты.
 */
export function ModerationNotice({
  status,
  className,
}: {
  status: PlayerStatus;
  className?: string;
}) {
  if (status !== "pending" && status !== "rejected") {
    return null;
  }
  const pending = status === "pending";
  return (
    <div
      data-testid="moderation-notice"
      className={cn(
        "rounded-md border px-3 py-2.5",
        pending ? "border-line-gold bg-gold-soft" : "border-danger/35 bg-danger-soft",
        className,
      )}
    >
      <p className={cn("text-[14px] font-extrabold", pending ? "text-ink" : "text-danger")}>
        {pending ? "Заявка на рассмотрении" : "Заявка отклонена"}
      </p>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        {pending
          ? "Расписание и клубы уже открыты. Фишки и привязку аккаунта включит менеджер — напишите ему, он подтвердит быстрее."
          : "Если это недоразумение, напишите менеджеру — разберёмся."}
      </p>
      {pending ? (
        <Link
          to="/dialogs"
          className="bg-gold-grad text-ink-ongold mt-2 inline-flex h-9 items-center rounded-md px-3 text-[13px] font-bold"
        >
          Написать менеджеру
        </Link>
      ) : null}
    </div>
  );
}
