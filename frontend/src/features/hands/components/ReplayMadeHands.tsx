import { describeMadeHand } from "@/features/hands/lib/describeHand";
import type { ReplayState, SeatRuntime } from "@/features/hands/lib/hand-engine";

function livingShowdownSeats(state: ReplayState): SeatRuntime[] {
  const living = state.seats.filter((seat) => !seat.folded);
  return [...living].sort((a, b) => {
    if (a.isHero) return -1;
    if (b.isHero) return 1;
    return a.seat - b.seat;
  });
}

export function ReplayMadeHands({ state }: { state: ReplayState }) {
  const rows = livingShowdownSeats(state);
  if (rows.length === 0) return null;

  return (
    <section
      className="border-line bg-surface mx-[13px] mt-1 rounded-md border px-2.5 py-1"
      data-testid="replay-made-hands"
    >
      <div className="text-ink-3 mb-0.5 text-[10px] font-extrabold tracking-[0.09em] uppercase">
        Комбинации
      </div>
      {rows.map((seat) => {
        const made = seat.cards.length === 2 ? describeMadeHand(seat.cards, state.board) : "";
        const caption = made || (seat.cards.length === 2 ? "" : "не показал");
        return (
          <div
            key={seat.seat}
            className="flex h-5 min-w-0 items-center justify-between gap-2"
            data-testid={`replay-made-hand-${seat.seat}`}
          >
            <span className="min-w-0 truncate text-[12px] font-bold">{seat.name}</span>
            <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{caption}</span>
          </div>
        );
      })}
    </section>
  );
}
