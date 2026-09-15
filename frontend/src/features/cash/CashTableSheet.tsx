import { Drawer } from "@base-ui/react/drawer";
import type { CSSProperties } from "react";

import type { CashTable } from "@/api/types/cash";
import { buyinInBigBlinds, formatBlinds, GAME_LABELS, minutesAgo } from "@/features/cash/lib";
import { OpenInApp } from "@/features/tournaments/components/OpenInApp";
import { useNow } from "@/features/tournaments/hooks";
import { APP_LABELS, APP_TINT, formatMoney } from "@/features/tournaments/lib/format";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md px-3 py-2">
      <p className="text-ink-3 text-[11px] font-semibold">{label}</p>
      <p className="num text-ink text-[16px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="border-line flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <dt className="text-ink-2 text-[13px]">{label}</dt>
      <dd className="num text-ink m-0 text-right text-[13.5px] font-semibold">{value}</dd>
    </div>
  );
}

function tintStyle(table: CashTable | null): CSSProperties | undefined {
  const tint = table ? APP_TINT[table.club.app] : undefined;
  if (!tint) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tint} 20%, transparent) 0%, color-mix(in srgb, ${tint} 7%, transparent) 40%, transparent 100%)`,
  };
}

/** Карточка кэш-стола по тапу: ставки, места, вход — и переход в приложение. */
export function CashTableSheet({
  table,
  onOpenChange,
}: {
  table: CashTable | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer.Root open={table !== null} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup
            data-testid="cash-sheet"
            style={tintStyle(table)}
            className="border-line-strong bg-surface max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none"
          >
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            {table ? <SheetBody table={table} /> : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SheetBody({ table }: { table: CashTable }) {
  const now = useNow(30_000);
  const { club } = table;
  const seats =
    table.seated === null
      ? "—"
      : table.table_size
        ? `${table.seated} из ${table.table_size}`
        : String(table.seated);

  return (
    <>
      <Drawer.Title className="text-ink text-[20px] leading-tight font-bold">
        {table.name}
      </Drawer.Title>
      <Drawer.Description className="text-ink-2 mt-1 text-[13px]">
        {club.name} · {APP_LABELS[club.app]} · обновлено {minutesAgo(new Date(table.seen_at), now)}
      </Drawer.Description>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="bg-gold-soft text-gold rounded-[6px] px-2 py-0.5 text-[12px] font-bold">
          {GAME_LABELS[table.game_type]}
        </span>
        {table.table_size ? (
          <span className="bg-gold-soft text-gold rounded-[6px] px-2 py-0.5 text-[12px] font-bold">
            {table.table_size}-max
          </span>
        ) : null}
        {table.waiting ? (
          <span className="bg-warn-soft text-warn rounded-[6px] px-2 py-0.5 text-[12px] font-bold">
            Очередь {table.waiting}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Блайнды" value={formatBlinds(table)} />
        <Stat label="Игроки" value={seats} />
        <Stat label="Мин. вход" value={formatMoney(table.min_buyin, club) ?? "—"} />
        <Stat label="Макс. вход" value={formatMoney(table.max_buyin, club) ?? "—"} />
      </div>

      <dl className="mt-3">
        <Param label="Анте" value={formatMoney(table.ante, club)} />
        <Param
          label="Вход в больших блайндах"
          value={
            table.min_buyin
              ? [
                  buyinInBigBlinds(table.min_buyin, table.big_blind),
                  buyinInBigBlinds(table.max_buyin, table.big_blind),
                ]
                  .filter(Boolean)
                  .join(" – ")
              : null
          }
        />
      </dl>

      <OpenInApp club={club} appLink={table.app_link} subject="стол" />
    </>
  );
}
