import { Drawer } from "@base-ui/react/drawer";
import type { CSSProperties } from "react";

import type { CashGame } from "@/api/types/cash";
import { formatBlinds, GAME_LABELS, minutesAgo } from "@/features/cash/lib";
import { EditorsPickPlate } from "@/features/picks/EditorsPick";
import { OpenInApp } from "@/features/tournaments/components/OpenInApp";
import { useNow } from "@/features/tournaments/hooks";
import { APP_LABELS, APP_TINT } from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md px-3 py-2">
      <p className="text-ink-3 text-[11px] font-semibold">{label}</p>
      <p className="num text-ink text-[16px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function tintStyle(game: CashGame | null): CSSProperties | undefined {
  const tint = game ? APP_TINT[game.club.app] : undefined;
  if (!tint) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tint} 20%, transparent) 0%, color-mix(in srgb, ${tint} 7%, transparent) 40%, transparent 100%)`,
  };
}

/** Карточка кэш-лимита по тапу: игра, лимит, сколько столов — и переход в приложение. */
export function CashGameSheet({
  game,
  onOpenChange,
}: {
  game: CashGame | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer.Root open={game !== null} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup
            data-testid="cash-sheet"
            style={tintStyle(game)}
            className="border-line-strong bg-surface max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none"
          >
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            {game ? <SheetBody game={game} /> : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SheetBody({ game }: { game: CashGame }) {
  const now = useNow(30_000);
  const { club } = game;
  return (
    <>
      <Drawer.Title className="text-ink text-[20px] leading-tight font-bold">
        {GAME_LABELS[game.game_type]} {formatBlinds(game)}
      </Drawer.Title>
      <Drawer.Description className="text-ink-2 mt-1 text-[13px]">
        {club.name} · {APP_LABELS[club.app]} · обновлено {minutesAgo(new Date(game.seen_at), now)}
      </Drawer.Description>

      {game.is_editor_pick ? <EditorsPickPlate note={game.editor_pick_note} /> : null}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Лимит" value={formatBlinds(game)} />
        <Stat
          label="Открыто сейчас"
          value={`${game.tables} ${pluralRu(game.tables, "стол", "стола", "столов")}`}
        />
      </div>

      <OpenInApp club={club} appLink={game.app_link} subject="стол" />
    </>
  );
}
