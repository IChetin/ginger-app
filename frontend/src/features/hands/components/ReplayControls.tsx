import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const iconClass =
  "h-[18px] w-[18px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function ReplayControls({
  step,
  total,
  playing,
  speed,
  onStep,
  onTogglePlay,
  onCycleSpeed,
  extra,
}: {
  step: number;
  total: number;
  playing: boolean;
  speed: number;
  onStep: (next: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  extra?: ReactNode;
}) {
  const last = Math.max(0, total - 1);
  return (
    <div
      className="border-line bg-surface shrink-0 border-t px-[13px] pt-2 pb-1.5"
      data-testid="replay-controls"
    >
      <div className="mb-2.5 flex gap-[3px]">
        {Array.from({ length: total }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Шаг ${index + 1}`}
            className={cn(
              "h-[3px] min-w-0 flex-1 rounded-[2px]",
              index < step && "bg-[rgba(217,179,106,0.55)]",
              index === step && "bg-gold shadow-[0_0_0_2px_rgba(217,179,106,0.28)]",
              index > step && "bg-surface-3",
            )}
            onClick={() => onStep(index)}
          />
        ))}
      </div>
      {extra ? (
        <div
          className="mb-2 flex items-center justify-end gap-2"
          data-testid="replay-controls-extra"
        >
          {extra}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="В начало"
          className="border-line-strong bg-surface-2 text-ink flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border"
          onClick={() => onStep(0)}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M11 5l-7 7 7 7M20 5l-7 7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Назад"
          className="border-line-strong bg-surface-2 text-ink flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border"
          onClick={() => onStep(Math.max(0, step - 1))}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          className="bg-gold-grad text-ink-ongold flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          onClick={onTogglePlay}
        >
          {playing ? (
            <>
              <svg className={iconClass} viewBox="0 0 24 24">
                <path d="M8 5v14M16 5v14" />
              </svg>
              Пауза
            </>
          ) : (
            <>
              <svg className={iconClass} viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {step >= last ? "Сначала" : "Играть"}
            </>
          )}
        </button>
        <button
          type="button"
          aria-label="Вперёд"
          className="border-line-strong bg-surface-2 text-ink flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border"
          onClick={() => onStep(Math.min(last, step + 1))}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Скорость"
          className="border-line-strong text-ink-2 h-[46px] w-[46px] rounded-[14px] border bg-transparent text-[12px] font-extrabold"
          onClick={onCycleSpeed}
        >
          ×{speed}
        </button>
      </div>
    </div>
  );
}
