import { useEffect, useRef } from "react";

import { STICKY_BELOW_HEADER_TOP } from "@/components/layout/StickyHeader";
import { eachIsoDate, todayInTimezone, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  startsOn: string;
  endsOn: string;
  activeDay: string;
  venueTimezone: string;
  onSelect: (day: string) => void;
};

export function DayStrip({ startsOn, endsOn, activeDay, venueTimezone, onSelect }: Props) {
  const days = eachIsoDate(startsOn, endsOn);
  const today = todayInTimezone(venueTimezone);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeDay]);

  return (
    <div
      className="border-line bg-bg/90 sticky z-10 mt-5 border-b backdrop-blur-[14px]"
      style={{ top: STICKY_BELOW_HEADER_TOP }}
    >
      <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-2.5 [&::-webkit-scrollbar]:hidden">
        {days.map((day) => {
          const isActive = day === activeDay;
          const isToday = day === today;
          const num = Number(day.slice(8, 10));
          return (
            <button
              key={day}
              type="button"
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelect(day)}
              className={cn(
                "relative flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-md",
                "border-line-strong bg-surface text-ink-2 border",
                isActive &&
                  "bg-gold-grad text-ink-ongold shadow-sheen-soft -rotate-[2deg] border-transparent",
                isToday && "day-today",
              )}
              aria-current={isActive ? "date" : undefined}
            >
              <span className="num text-base leading-tight font-extrabold">{num}</span>
              <span
                className={cn(
                  "text-ink-3 mt-0.5 text-[10px] font-bold uppercase",
                  isActive && "text-ink-ongold/70",
                )}
              >
                {weekdayShort(day)}
              </span>
              {isToday ? (
                <span
                  className={cn(
                    "bg-live absolute bottom-[5px] h-[5px] w-[5px] rounded-full",
                    isActive && "bg-ink-ongold",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
