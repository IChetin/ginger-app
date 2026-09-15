import { useState } from "react";

import type { TournamentClub } from "@/api/types/tournaments";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { APP_LABELS } from "@/features/tournaments/lib/format";

/**
 * Переход в приложение из карточки турнира или стола. PPPoker даёт диплинк на каждый созданный
 * турнир и стол — его приносит сборщик; X-Poker, Poker21 и Suprema диплинков не дают — там ID клуба.
 */
export function OpenInApp({
  club,
  appLink,
  subject,
}: {
  club: TournamentClub;
  appLink: string | null | undefined;
  subject: "турнир" | "стол";
}) {
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const appLabel = APP_LABELS[club.app];

  if (appLink) {
    return (
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: `Перейти в ${appLabel}?`,
            description: `Откроется ${subject} в клубе ${club.name}.`,
            confirmLabel: "Перейти",
            cancelLabel: "Отмена",
          });
          if (ok) window.location.href = appLink;
        }}
        className="bg-gold-grad text-ink-ongold shadow-sheen-glow mt-4 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-bold"
      >
        Открыть {subject} в {appLabel}
      </button>
    );
  }

  if (club.app_club_id) {
    const clubId = club.app_club_id;
    return (
      <div
        data-testid="club-app-id"
        className="border-line bg-surface-2 mt-4 flex items-center gap-2 rounded-md border px-3 py-2.5"
      >
        <span className="text-ink-2 min-w-0 flex-1 text-[13px]">
          {club.name} в {appLabel}:{" "}
          <span className="num text-ink font-bold select-all">{clubId}</span>
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(clubId);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="border-line-strong text-ink h-9 shrink-0 rounded-md border px-3 text-[12.5px] font-bold"
        >
          {copied ? "Скопировано" : "Скопировать ID"}
        </button>
      </div>
    );
  }

  return (
    <p className="text-ink-3 mt-4 text-center text-[12.5px]">
      {subject === "турнир" ? "Турнир" : "Стол"} в клубе {club.name} · {appLabel}
    </p>
  );
}
