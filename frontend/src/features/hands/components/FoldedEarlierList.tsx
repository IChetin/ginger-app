import { useEffect, useState } from "react";

import { formatFoldOnStreet, type FoldedPlayer } from "@/features/hands/lib/foldStreet";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

export function FoldedEarlierList({
  players,
  resetKey,
}: {
  players: FoldedPlayer[];
  resetKey?: string | number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [resetKey]);

  if (players.length === 0) return null;

  return (
    <div className="mt-1.5" data-testid="folded-earlier">
      <button
        type="button"
        aria-expanded={open}
        data-testid="folded-earlier-toggle"
        className="text-ink-3 flex min-h-[36px] w-full items-center gap-2 rounded-md px-[11px] py-1.5 text-left text-[12.5px] font-semibold"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 flex-1">
          Сбросили ранее: {players.length} {pluralRu(players.length, "игрок", "игрока", "игроков")}
        </span>
        <svg
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 fill-none stroke-current [stroke-width:1.8] transition-transform [stroke-linecap:round] [stroke-linejoin:round]",
            open && "rotate-180",
          )}
          viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul className="flex flex-col gap-0.5 pb-0.5" data-testid="folded-earlier-list">
          {players.map((player) => (
            <li
              key={player.seat}
              data-testid={`folded-earlier-${player.seat}`}
              className="text-ink-3 px-[11px] py-1 text-[12.5px]"
            >
              {player.name} · {formatFoldOnStreet(player.street)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
