import { useMemo, useState } from "react";

import type { Tournament } from "@/api/types/tournaments";
import { ScheduleTabs } from "@/components/layout/ScheduleTabs";
import { rateLimitMessage } from "@/features/auth/useGuestGate";
import { usePromotions } from "@/features/feed/api";
import { PostCard } from "@/features/feed/FeedSections";
import { TournamentSheet } from "@/features/tournaments/components/TournamentSheet";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const untilFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** «до 5 октября» — срок показа записи и есть срок акции; без него акция бессрочная. */
function untilLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  return `до ${untilFormat.format(new Date(expiresAt))}`;
}

/**
 * Акции клубов — третий раздел рядом с MTT и CASH (решение Ивана 29.09). Записи те же, что
 * в ленте: менеджер ставит галочку «Акция», и запись появляется и там, и здесь.
 */
export function PromosPage() {
  const query = usePromotions();
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [club, setClub] = useState<string | null>(null);

  const promos = query.data ?? [];
  const clubs = useMemo(() => {
    const names = new Map<string, string>();
    for (const post of promos) {
      if (post.club) names.set(post.club.id, post.club.name);
    }
    return [...names].map(([id, name]) => ({ id, name }));
  }, [promos]);
  const visible = club ? promos.filter((post) => post.club?.id === club) : promos;

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="promos-page">
      <header className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
          <ScheduleTabs active="promos" />
          <span
            aria-live="polite"
            className="text-ink-3 num min-w-0 flex-1 truncate text-right text-[11.5px] font-semibold"
          >
            {query.isSuccess
              ? `${promos.length} ${pluralRu(promos.length, "акция", "акции", "акций")}`
              : ""}
          </span>
        </div>
        {clubs.length > 1 ? (
          <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pb-2 [&::-webkit-scrollbar]:hidden">
            {[{ id: "", name: "Все клубы" }, ...clubs].map((item) => {
              const active = item.id === (club ?? "");
              return (
                <button
                  key={item.id || "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setClub(item.id || null)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11.5px] font-bold whitespace-nowrap",
                    active
                      ? "border-line-gold bg-gold-soft text-gold"
                      : "border-line bg-surface text-ink-2",
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      {query.isPending ? (
        <div className="space-y-2 px-3 pt-3" data-testid="promos-loading">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-surface h-[120px] rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="border-line bg-surface mx-3 mt-3 rounded-md border px-4 py-6 text-center">
          <p className="text-ink text-[14px] font-semibold">
            {rateLimitMessage(query.error) ?? "Не удалось загрузить акции"}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="bg-gold-soft text-gold mt-3 h-10 rounded-full px-5 text-[13px] font-bold"
          >
            Повторить
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="border-line-gold bg-surface mx-3 mt-3 rounded-md border border-dashed px-4 py-6 text-center">
          <p className="text-ink text-[15px] font-bold">Сейчас акций нет</p>
          <p className="text-ink-2 mt-1 text-[13px]">
            Здесь появятся бонусы, фрироллы и розыгрыши клубов
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-3 pt-3">
          {visible.map((post) => {
            const until = untilLabel(post.expires_at);
            return (
              <div key={post.id}>
                <PostCard post={post} onOpenTournament={setSelected} />
                {until ? (
                  <p className="text-ink-3 mt-1 pl-1 text-[11.5px] font-semibold">{until}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <TournamentSheet
        tournament={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
