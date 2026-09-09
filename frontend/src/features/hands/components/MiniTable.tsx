import { useRef } from "react";

import { chairPosition, avatarPositionLabel, requiredSeats } from "@/features/hands/lib/positions";
import type { TableSize } from "@/features/hands/lib/positions";
import {
  MINI_SEAT_ELLIPSE,
  TABLE_BORDER_RADIUS,
  TABLE_HEIGHT_RATIO,
  isInsideEllipse,
  tableSlots,
} from "@/features/hands/lib/tableLayout";
import { cn } from "@/lib/utils";

export function MiniTable({
  tableSize,
  occupied,
  heroSeat,
  buttonSeat,
  onToggle,
  onHero,
}: {
  tableSize: TableSize;
  occupied: number[];
  heroSeat: number;
  buttonSeat: number;
  onToggle: (seat: number) => void;
  onHero: (seat: number) => void;
}) {
  const slots = tableSlots(tableSize, heroSeat, MINI_SEAT_ELLIPSE);
  const occupiedSet = new Set(occupied);
  const locked = new Set(requiredSeats(tableSize, buttonSeat, heroSeat));
  const longPress = useRef(false);

  return (
    <div
      className="relative z-0 flex justify-center overflow-visible py-2"
      data-testid="mini-table"
    >
      <div
        data-testid="mini-felt"
        className="relative mx-auto min-h-[216px] w-[90%] max-w-[240px]"
        style={{
          aspectRatio: `1 / ${TABLE_HEIGHT_RATIO}`,
          borderRadius: TABLE_BORDER_RADIUS,
          background:
            "radial-gradient(70% 45% at 50% 45%, rgba(217,179,106,.14), transparent 70%), radial-gradient(120% 85% at 50% 45%, #2A2318, #12100A)",
          border: "1.5px solid rgba(217,179,106,.35)",
          boxShadow: "inset 0 0 0 4px rgba(11,10,9,.8), inset 0 0 0 5px rgba(217,179,106,.18)",
        }}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 text-[19px] font-extrabold text-[rgba(217,179,106,0.14)]">
          Day
          <i className="inline-flex h-[23px] w-[23px] -rotate-[4deg] items-center justify-center rounded-[8px] border-2 border-[rgba(217,179,106,0.14)] text-[15px] not-italic">
            2
          </i>
        </div>
        {slots.map((slot) => {
          const seat = slot.seat;
          const pos = { left: slot.left, top: slot.top };
          const isHero = seat === heroSeat;
          const isOn = occupiedSet.has(seat);
          const raw = chairPosition(tableSize, buttonSeat, seat);
          const label = avatarPositionLabel(raw, isOn ? occupied.length : tableSize);
          const isLocked = locked.has(seat);
          return (
            <button
              key={seat}
              type="button"
              data-seat={seat}
              data-required={isLocked ? "1" : "0"}
              data-inside-oval={isInsideEllipse(pos, MINI_SEAT_ELLIPSE) ? "1" : "0"}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              className={cn(
                "absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] leading-none font-extrabold tracking-tight",
                isHero &&
                  "bg-gold-grad text-ink-ongold border-line-gold border-[1.5px] shadow-[0_0_0_2px_rgba(217,179,106,0.28)]",
                !isHero &&
                  isLocked &&
                  "border-line-gold bg-surface-3 text-gold border-[1.5px] shadow-[0_0_0_2px_rgba(217,179,106,0.28)]",
                !isHero &&
                  isOn &&
                  !isLocked &&
                  "bg-surface-3 text-gold border-[1.5px] border-transparent",
                !isOn &&
                  "text-ink-3 border-[1.5px] border-dashed border-white/15 bg-[rgba(28,26,22,0.92)]",
              )}
              onClick={() => {
                if (longPress.current) {
                  longPress.current = false;
                  return;
                }
                onToggle(seat);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onHero(seat);
              }}
              onPointerDown={(event) => {
                const target = event.currentTarget;
                const pointer = event.pointerId;
                const timer = window.setTimeout(() => {
                  longPress.current = true;
                  onHero(seat);
                }, 500);
                const clear = () => {
                  window.clearTimeout(timer);
                  target.releasePointerCapture(pointer);
                  target.removeEventListener("pointerup", clear);
                  target.removeEventListener("pointercancel", clear);
                };
                target.setPointerCapture(pointer);
                target.addEventListener("pointerup", clear);
                target.addEventListener("pointercancel", clear);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
