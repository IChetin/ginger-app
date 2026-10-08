import { formatMoney } from "@/features/chips/lib/format";
import type { WinItem } from "@/features/feed/api";
import { APP_TINT } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

/** Высота строки — баннер показывает ровно три и листает на одну. */
export const WIN_ROW_PX = 48;

/** «2026-09-27» → «27.09». */
export function shortDate(isoDay: string): string {
  const [, month, day] = isoDay.split("-");
  return `${day}.${month}`;
}

/** Ярлык клуба в цвет приложения, затемнённый на четверть — чтобы белый текст читался. */
function ClubTag({ win }: { win: WinItem }) {
  if (!win.club) return null;
  const tint = APP_TINT[win.club.app];
  return (
    <span
      className="font-display shrink-0 px-1.5 py-px text-[9px] leading-[14px] font-bold tracking-[0.08em] text-white uppercase"
      style={{
        backgroundColor: tint ? `color-mix(in srgb, ${tint} 75%, #000)` : "var(--surface-3)",
      }}
    >
      {win.club.name}
    </span>
  );
}

/** Выигрыш одной строкой: дата, клуб, игрок, турнир и место, грязные призовые. */
export function WinRow({ win, showDate = true }: { win: WinItem; showDate?: boolean }) {
  return (
    <div
      data-testid="win-row"
      className={cn(
        "grid items-center gap-3 px-4",
        showDate ? "grid-cols-[34px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
      )}
      style={{ height: WIN_ROW_PX }}
    >
      {showDate ? (
        <span className="num text-ink-3 font-display text-[11px] font-semibold">
          {shortDate(win.won_on)}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <ClubTag win={win} />
          <span className="text-ink truncate text-[13.5px] font-bold">{win.player_nickname}</span>
        </span>
        <span className="text-ink-3 block truncate text-[11.5px]">
          {win.place ? `${win.place} место · ` : ""}
          {win.tournament_name}
        </span>
      </span>
      {/* «Приз: ₽27 000», а не «+₽27 000» (Иван, 08.10): плюс читался как изменение баланса. */}
      <span className="shrink-0 whitespace-nowrap">
        <span className="text-ink-3 text-[11px]">Приз: </span>
        <span className="font-display num text-value-hi text-[15px] font-bold">
          {formatMoney(
            Math.round(Number(win.prize_amount)),
            win.currency_symbol,
            win.currency_code,
          )}
        </span>
      </span>
    </div>
  );
}
