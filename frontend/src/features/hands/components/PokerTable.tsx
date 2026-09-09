import { useEffect, useRef, useState } from "react";

import type { HandActionType, HandData } from "@/api/types/hands";
import { ActionBadge } from "@/features/hands/components/ActionBadge";
import { PlayingCard, formatChips } from "@/features/hands/components/PlayingCard";
import { formatActionShort } from "@/features/hands/lib/actionTone";
import type { ReplayState, SeatRuntime } from "@/features/hands/lib/hand-engine";
import {
  avatarPositionLabel,
  chairPosition,
  positionLabel,
  previewPosition,
} from "@/features/hands/lib/positions";
import { displayReplayStack, potShare } from "@/features/hands/lib/stackDisplay";
import {
  FELT_CENTER,
  FELT_LOGO_TOP,
  SEAT_CENTER_TRANSFORM,
  TABLE_BORDER_RADIUS,
  avatarScale,
  chipTowardCenter,
  columnSeatBlockFor,
  columnSeatEllipseFor,
  feltBox,
  seatBlockFor,
  seatDensityScale,
  seatCardsOnInnerEdge,
  seatHoleKind,
  seatNameBoxPx,
  seatNameFontPx,
  tableSlots,
  chipCollisionBox,
} from "@/features/hands/lib/tableLayout";
import { cn } from "@/lib/utils";

export type SeatChrome = "legacy" | "cards-inward" | "column";
export type SeatNamePos = "under" | "beside";

function avatarLabel(seat: SeatRuntime): string {
  if (seat.isHero) return "Я";
  return String(seat.seat);
}

function seatVisuals({
  tableSize,
  scale,
  widthPx,
  heightPx,
  hideHoles,
  isHero,
  occupiedCount,
}: {
  tableSize: number;
  scale: number;
  widthPx: number;
  heightPx: number;
  hideHoles: boolean;
  isHero: boolean;
  occupiedCount: number;
}) {
  const density = seatDensityScale(tableSize);
  const avatar = Math.max(
    28,
    Math.min(
      Math.round(56 * density * scale),
      Math.round(widthPx * 0.9),
      Math.round(heightPx * (hideHoles ? 0.52 : 0.36)),
    ),
  );
  const emptyAvatar = Math.min(24, Math.max(16, Math.round(22 * scale)));
  const pairWidth = 30 * density * 2 + 2;
  const pairScale = Math.min(1, (widthPx - 2) / pairWidth, (heightPx * 0.32) / (42 * density));
  return {
    avatar,
    emptyAvatar,
    namePx: seatNameFontPx(density, scale, occupiedCount),
    stackPx: Math.max(11, Math.round(12 * density * scale)),
    posPx: Math.max(9, Math.round(10 * density * scale)),
    posH: Math.max(16, Math.round(18 * density * scale)),
    holeScale: pairScale * (isHero ? 1.15 : 1),
  };
}

function SeatBox({
  widthPx,
  heightPx,
  children,
  className,
}: {
  widthPx: number;
  heightPx: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-visible",
        className,
      )}
      style={{ width: widthPx, height: heightPx }}
    >
      {children}
    </div>
  );
}

function EmptySeat({
  widthPx,
  heightPx,
  avatarPx,
  label,
  disc = false,
}: {
  widthPx: number;
  heightPx: number;
  avatarPx: number;
  label?: string;
  disc?: boolean;
}) {
  return (
    <div className="flex items-center justify-center" style={{ width: widthPx, height: heightPx }}>
      <div
        className={cn(
          "flex items-center justify-center border-dashed font-extrabold tracking-wide text-[rgba(217,179,106,0.45)] opacity-[0.35]",
          disc
            ? "rounded-full border-[1.5px] border-[rgba(217,179,106,0.35)] bg-[rgba(28,26,22,0.2)]"
            : "rounded-[8px] border border-[rgba(217,179,106,0.22)] bg-[rgba(28,26,22,0.2)] text-[7px]",
        )}
        style={{
          width: avatarPx,
          height: avatarPx,
          fontSize: disc ? Math.max(9, Math.round(avatarPx * 0.28)) : undefined,
        }}
        data-testid="empty-seat-avatar"
      >
        {label ?? ""}
      </div>
    </div>
  );
}

function SeatView({
  seat,
  active,
  highlighted = false,
  required = false,
  hideHoles = false,
  occupiedCount,
  tableSize,
  scale,
  widthPx,
  heightPx,
  formatAmount,
  onToggleDisplay,
  lastActionType,
  onSeatCardsTap,
  onSeatNameTap,
  inviteHeroHoles = false,
  stackMuted = false,
  winner = false,
  chrome = "cards-inward",
  namePos = "beside",
  pinTop = 80,
  nameBoxPx,
}: {
  seat: SeatRuntime;
  active: boolean;
  highlighted?: boolean;
  required?: boolean;
  hideHoles?: boolean;
  occupiedCount: number;
  tableSize: number;
  scale: number;
  widthPx: number;
  heightPx: number;
  formatAmount: (value: number) => string;
  onToggleDisplay?: () => void;
  lastActionType: HandActionType | null;
  onSeatCardsTap?: (seat: number) => void;
  onSeatNameTap?: (seat: number) => void;
  inviteHeroHoles?: boolean;
  stackMuted?: boolean;
  winner?: boolean;
  chrome?: SeatChrome;
  namePos?: SeatNamePos;
  pinTop?: number;
  nameBoxPx: number;
}) {
  const invite =
    inviteHeroHoles && seat.isHero && !seat.folded && !hideHoles && seat.cards.length < 2;
  const hole = hideHoles ? "none" : invite ? "invite" : seatHoleKind(seat);
  const visuals = seatVisuals({
    tableSize,
    scale,
    widthPx,
    heightPx,
    hideHoles,
    isHero: chrome === "column" ? false : seat.isHero,
    occupiedCount,
  });
  const { avatar, namePx, stackPx, posPx, posH, holeScale: baseHoleScale } = visuals;
  const holeScale =
    chrome === "column" ? Math.min(1, baseHoleScale * (seat.isHero ? 0.82 : 0.64)) : baseHoleScale;
  const holeStyle = { transform: `scale(${holeScale})` };
  const holeFaces =
    hole === "face" ? (
      seat.cards.map((card) => <PlayingCard key={card} card={card} size="hole" />)
    ) : hole === "invite" ? (
      ([0, 1] as const).map((index) => {
        const card = seat.cards[index];
        return card ? (
          <PlayingCard key={card} card={card} size="hole" />
        ) : (
          <PlayingCard key={`invite-${index}`} slot invite size="hole" />
        );
      })
    ) : (
      <>
        <PlayingCard back size="hole" />
        <PlayingCard back size="hole" />
      </>
    );
  const completeHoles = seat.cards.length === 2;
  const holesInner =
    hole === "none" ? null : onSeatCardsTap ? (
      <button
        type="button"
        data-testid="seat-holes"
        data-invite={hole === "invite" ? "1" : "0"}
        aria-label={completeHoles ? `Изменить карты: ${seat.name}` : `Ввести карты: ${seat.name}`}
        className={cn(
          "flex items-center justify-center gap-px rounded-[8px] border border-dashed border-[rgba(217,179,106,0.4)] p-0.5",
          hole === "invite" && "motion-safe:animate-seatpulse",
        )}
        style={holeStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSeatCardsTap(seat.seat);
        }}
      >
        {holeFaces}
      </button>
    ) : (
      <div
        className="flex items-center justify-center gap-px"
        data-testid="seat-holes"
        data-invite="0"
        style={holeStyle}
      >
        {holeFaces}
      </div>
    );
  const positionBadge = (
    <span
      data-testid="seat-position"
      className={cn(
        "relative z-[1] inline-flex shrink-0 items-center rounded-[5px] border px-1.5 font-extrabold tracking-wide",
        seat.isHero
          ? "border-[rgba(241,214,142,0.5)] bg-[#241A04] text-[#F1D68E]"
          : "text-gold border-[rgba(217,179,106,0.45)] bg-[#1C1A16]",
      )}
      style={{
        fontSize: posPx,
        height: posH,
        lineHeight: 1,
      }}
    >
      {positionLabel(seat.position, occupiedCount)}
      {required ? (
        <span className="text-gold ml-0.5" aria-hidden>
          •
        </span>
      ) : null}
    </span>
  );
  const nameNode =
    onSeatNameTap && !seat.isHero ? (
      <button
        type="button"
        data-testid={`seat-name-${seat.seat}`}
        title={seat.name}
        aria-label={`Переименовать: ${seat.name}`}
        className={cn(
          "flex min-w-0 items-center justify-center bg-transparent p-0 text-center leading-tight font-bold text-[#F5F2EA] underline decoration-[rgba(245,242,234,0.45)] decoration-dotted underline-offset-2",
          chrome === "column" || (chrome === "cards-inward" && namePos === "beside")
            ? "truncate"
            : "break-words",
        )}
        style={{ fontSize: namePx, width: nameBoxPx, maxWidth: nameBoxPx }}
        onClick={(event) => {
          event.stopPropagation();
          onSeatNameTap(seat.seat);
        }}
      >
        <span className="min-w-0 truncate">{seat.name}</span>
      </button>
    ) : (
      <div
        className={cn(
          "min-w-0 px-0 text-center leading-tight font-bold text-[#F5F2EA]",
          chrome === "column" || (chrome === "cards-inward" && namePos === "beside")
            ? "truncate"
            : "break-words",
        )}
        title={seat.name}
        data-testid={`seat-name-${seat.seat}`}
        style={{ fontSize: namePx, width: nameBoxPx, maxWidth: nameBoxPx }}
      >
        {seat.name}
      </div>
    );
  const stackNode = (
    <>
      {onToggleDisplay ? (
        <button
          type="button"
          data-testid="seat-stack"
          aria-label="Переключить отображение стеков"
          className={cn(
            "num max-w-full cursor-pointer truncate bg-transparent p-0 font-semibold",
            stackMuted ? "text-ink-3" : "text-gold-hi",
          )}
          data-default-stack={stackMuted ? "1" : undefined}
          style={{ fontSize: stackPx }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDisplay();
          }}
        >
          {formatAmount(seat.stack)}
        </button>
      ) : (
        <div
          className={cn(
            "num leading-none font-semibold",
            stackMuted ? "text-ink-3" : "text-gold-hi",
          )}
          data-testid="seat-stack"
          data-seat-stack-label=""
          data-default-stack={stackMuted ? "1" : undefined}
          style={{ fontSize: stackPx }}
        >
          {formatAmount(seat.stack)}
        </div>
      )}
    </>
  );
  const column = chrome === "column";
  const posText = avatarPositionLabel(seat.position, occupiedCount);
  const avatarPx = column
    ? Math.max(
        32,
        Math.min(avatar, Math.round(44 * scale), Math.round(heightPx * (hideHoles ? 0.5 : 0.4))),
      )
    : chrome === "cards-inward" && !hideHoles
      ? Math.max(18, Math.min(avatar, 22, Math.round(heightPx * 0.26)))
      : avatar;
  const posFont = Math.max(9, Math.round(avatarPx * (posText.length > 3 ? 0.24 : 0.3)));
  const avatarNode = (
    <div
      data-testid="seat-avatar"
      className={cn(
        "flex shrink-0 items-center justify-center border-[1.5px] font-extrabold",
        column ? "rounded-full" : "rounded-[14px]",
        seat.isHero
          ? "bg-gold-grad text-ink-ongold border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          : column
            ? "border-white/15 bg-[rgba(28,26,22,0.94)] text-[#D9B36A]"
            : "border-white/20 bg-[rgba(28,26,22,0.92)] text-[#E8E2D4]",
        (active || highlighted || winner || (column && required)) && "border-gold",
        active &&
          !highlighted &&
          !winner &&
          "motion-safe:animate-seatpulse shadow-[0_0_0_3px_rgba(217,179,106,0.25),0_0_14px_rgba(217,179,106,0.3)]",
        highlighted && "shadow-[0_0_0_3px_rgba(217,179,106,0.3)]",
        winner && "shadow-[0_0_0_3px_rgba(217,179,106,0.45),0_0_16px_rgba(217,179,106,0.35)]",
      )}
      style={{
        width: avatarPx,
        height: avatarPx,
        fontSize: column ? posFont : Math.max(9, Math.round((avatarPx / 2) * 0.9)),
      }}
    >
      {column ? (
        <span data-testid="seat-position" className="leading-none tracking-tight">
          {posText}
        </span>
      ) : (
        avatarLabel(seat)
      )}
    </div>
  );
  const cardsInner = seatCardsOnInnerEdge(pinTop);
  const holeReservePx = Math.round(42 * holeScale + 6);
  const holesSlot = hideHoles ? null : (
    <div
      data-testid="seat-holes-slot"
      className={cn(
        "flex items-center justify-center overflow-hidden",
        (active || winner) &&
          (chrome === "cards-inward" || column) &&
          "rounded-[8px] shadow-[0_0_0_2px_rgba(217,179,106,0.35)]",
      )}
      style={{ minHeight: holeReservePx, maxWidth: widthPx }}
    >
      {holesInner}
    </div>
  );
  const identity = column ? (
    <div
      className="flex min-w-0 shrink-0 items-center justify-center"
      data-testid="seat-identity"
      style={{ width: nameBoxPx, maxWidth: nameBoxPx }}
    >
      {nameNode}
    </div>
  ) : chrome === "cards-inward" && namePos === "beside" ? (
    <div
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-1 gap-y-px"
      data-testid="seat-identity"
      style={{ width: nameBoxPx, maxWidth: nameBoxPx }}
    >
      {positionBadge}
      <div className="min-w-0 basis-full">{nameNode}</div>
    </div>
  ) : (
    <>
      {chrome === "legacy" ? positionBadge : null}
      {chrome === "legacy" ? avatarNode : null}
      {nameNode}
      {chrome === "cards-inward" ? positionBadge : null}
    </>
  );
  const body = column ? (
    <SeatBox
      widthPx={widthPx}
      heightPx={heightPx}
      className={cn("gap-0.5", seat.folded && "opacity-30")}
    >
      {holesSlot}
      {avatarNode}
      {identity}
      {stackNode}
    </SeatBox>
  ) : chrome === "cards-inward" ? (
    <SeatBox
      widthPx={widthPx}
      heightPx={heightPx}
      className={cn(
        "gap-px",
        seat.folded && "opacity-30",
        cardsInner ? "flex-col" : "flex-col-reverse",
      )}
    >
      {holesSlot}
      {identity}
      {avatarNode}
      {stackNode}
    </SeatBox>
  ) : (
    <SeatBox widthPx={widthPx} heightPx={heightPx} className={cn(seat.folded && "opacity-30")}>
      {identity}
      {stackNode}
      {hideHoles ? null : holesInner}
    </SeatBox>
  );
  return (
    <div
      className="relative overflow-visible"
      style={{ width: widthPx, height: heightPx }}
      data-seat-chrome={chrome}
      data-cards-edge={column ? "column" : cardsInner ? "inner" : "outer"}
    >
      {lastActionType ? (
        <div
          className="pointer-events-none absolute left-1/2 z-[6] -translate-x-1/2"
          data-testid={`seat-action-${seat.seat}`}
          style={
            column && pinTop <= FELT_CENTER.top
              ? { bottom: "100%", marginBottom: 2 }
              : column
                ? { top: "100%", marginTop: 2 }
                : chrome === "cards-inward"
                  ? cardsInner
                    ? { bottom: -16 * scale }
                    : { top: -16 * scale }
                  : { top: -16 * scale }
          }
        >
          <ActionBadge action={lastActionType} variant="table">
            {formatActionShort(lastActionType)}
          </ActionBadge>
        </div>
      ) : null}
      {body}
    </div>
  );
}

export function PokerTable({
  data,
  state,
  formatAmount = formatChips,
  onToggleDisplay,
  onSeatTap,
  onSeatCardsTap,
  onSeatNameTap,
  onSeatLongPress,
  emptySeatLabels = false,
  seatLabels = "hand",
  inviteHeroHoles = false,
  previewBet = null,
  hideBets = false,
  flyingSeat = null,
  className,
  fitHeight = false,
  centerBadge,
  onBoardTap,
  hideHoles = false,
  feltHint,
  highlightSeat = null,
  requiredSeats,
  mutedStackSeats,
  winnerSeats = [],
  collectPot = false,
  seatChrome = "cards-inward",
  seatNamePos = "beside",
}: {
  data: HandData;
  state: ReplayState;
  formatAmount?: (value: number) => string;
  onToggleDisplay?: () => void;
  onSeatTap?: (seat: number) => void;
  onSeatCardsTap?: (seat: number) => void;
  onSeatNameTap?: (seat: number) => void;
  onSeatLongPress?: (seat: number) => void;
  emptySeatLabels?: boolean;
  /** chair — уникальные имена от размера стола; hand — от числа сидящих. */
  seatLabels?: "hand" | "chair";
  inviteHeroHoles?: boolean;
  previewBet?: { seat: number; amount: number; stack: number } | null;
  hideBets?: boolean;
  flyingSeat?: number | null;
  className?: string;
  fitHeight?: boolean;
  centerBadge?: React.ReactNode;
  onBoardTap?: (index: number) => void;
  hideHoles?: boolean;
  feltHint?: string;
  highlightSeat?: number | null;
  requiredSeats?: readonly number[];
  mutedStackSeats?: ReadonlySet<number>;
  winnerSeats?: readonly number[];
  collectPot?: boolean;
  seatChrome?: SeatChrome;
  seatNamePos?: SeatNamePos;
}) {
  const column = seatChrome === "column";
  const slots = tableSlots(
    data.table_size,
    data.hero_seat,
    column ? columnSeatEllipseFor(data.table_size) : undefined,
  );
  const bySeat = new Map(state.seats.map((seat) => [seat.seat, seat]));
  const streetLabel =
    state.street === "preflop"
      ? "PREFLOP"
      : state.street === "flop"
        ? "FLOP"
        : state.street === "turn"
          ? "TURN"
          : "RIVER";
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ seat: number; timer: number | null; long: boolean }>({
    seat: 0,
    timer: null,
    long: false,
  });
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState({ width: 288, height: 389 });

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = feltBox(node.clientWidth, node.clientHeight, fitHeight);
      setBox((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      const nextScale = avatarScale(next.width, next.height);
      setScale((prev) => (prev === nextScale ? prev : nextScale));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fitHeight]);

  const logoSize = Math.min(box.width * 0.22, 80);
  const seatBlock = column ? columnSeatBlockFor(data.table_size) : seatBlockFor(data.table_size);
  const seatWidthPx = Math.round((seatBlock.width / 100) * box.width);
  const seatHeightPx = Math.round((seatBlock.height / 100) * box.height);
  const visualsForEmpty = seatVisuals({
    tableSize: data.table_size,
    scale,
    widthPx: seatWidthPx,
    heightPx: seatHeightPx,
    hideHoles,
    isHero: false,
    occupiedCount: data.seats.length,
  });
  const emptyAvatarPx = column
    ? Math.max(28, Math.min(visualsForEmpty.avatar, Math.round(36 * scale)))
    : visualsForEmpty.emptyAvatar;
  const occupiedSeats = data.seats.map((seat) => seat.seat);
  const occupiedSlots = slots.filter((slot) => bySeat.has(slot.seat));
  const nameBoxPx = seatNameBoxPx(
    occupiedSlots,
    box.width,
    box.height,
    data.seats.length,
    data.table_size,
  );

  const bindPress = (seat: number) => {
    if (!onSeatTap && !onSeatLongPress) return undefined;
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (event.button !== 0) return;
        if (pressRef.current.timer != null) window.clearTimeout(pressRef.current.timer);
        pressRef.current = { seat, timer: null, long: false };
        if (onSeatLongPress) {
          pressRef.current.timer = window.setTimeout(() => {
            pressRef.current.long = true;
            onSeatLongPress(seat);
          }, 480);
        }
      },
      onPointerUp: () => {
        if (pressRef.current.timer != null) window.clearTimeout(pressRef.current.timer);
        const wasLong = pressRef.current.long && pressRef.current.seat === seat;
        pressRef.current.timer = null;
        pressRef.current.long = false;
        if (!wasLong) onSeatTap?.(seat);
      },
      onPointerLeave: () => {
        if (pressRef.current.timer != null) window.clearTimeout(pressRef.current.timer);
        pressRef.current.timer = null;
      },
    };
  };

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 items-center justify-center px-[11px] pt-2.5",
        className ?? "min-h-[min(48dvh,400px)]",
      )}
    >
      <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
        <div
          className="relative"
          data-testid="poker-felt"
          style={{
            width: box.width,
            height: box.height,
            borderRadius: TABLE_BORDER_RADIUS,
            background:
              "radial-gradient(70% 42% at 50% 40%, rgba(217,179,106,.16) 0%, rgba(217,179,106,.03) 45%, transparent 70%), radial-gradient(120% 85% at 50% 45%, #2A2318 0%, #191408 55%, #0E0B06 100%)",
            border: "2px solid rgba(217,179,106,.42)",
            boxShadow:
              "inset 0 0 0 5px rgba(11,10,9,.85), inset 0 0 0 6.5px rgba(217,179,106,.22), inset 0 0 60px rgba(0,0,0,.7), 0 10px 30px rgba(0,0,0,.55)",
          }}
        >
          <div
            className="pointer-events-none absolute left-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 font-extrabold tracking-tight select-none"
            style={{
              top: `${FELT_LOGO_TOP}%`,
              width: logoSize,
              fontSize: Math.round(logoSize * 0.28),
              color: "rgba(217,179,106,0.11)",
            }}
          >
            Day
            <i
              className="inline-flex -rotate-[4deg] items-center justify-center rounded-[8px] border-2 not-italic"
              style={{
                height: Math.round(logoSize * 0.32),
                width: Math.round(logoSize * 0.32),
                fontSize: Math.round(logoSize * 0.22),
                borderColor: "rgba(217,179,106,0.11)",
              }}
            >
              2
            </i>
          </div>
          {feltHint ? (
            <p
              className="pointer-events-none absolute top-[32%] left-1/2 z-[4] w-max max-w-[90%] -translate-x-1/2 text-center text-[11.5px] font-semibold text-[rgba(217,179,106,0.75)]"
              data-testid="table-felt-hint"
            >
              {feltHint}
            </p>
          ) : (
            <div className="absolute top-[36%] left-1/2 z-[4] w-max max-w-[70%] -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="flex flex-wrap items-center justify-center gap-1">
                <div
                  className={cn(
                    "border-line-gold text-gold inline-flex items-center gap-1 rounded-full border bg-[rgba(11,10,9,0.62)] px-3 py-0.5 text-[12px] font-extrabold backdrop-blur-[3px]",
                    collectPot && winnerSeats.length > 0 && "motion-safe:animate-pot-away",
                  )}
                  data-testid="replay-pot"
                >
                  <span>Банк</span>
                  <span className="num">{formatAmount(state.pot)}</span>
                </div>
                {centerBadge}
              </div>
              <div className="mt-2 flex justify-center gap-1">
                {Array.from({ length: 5 }, (_, index) => {
                  const card = state.board[index];
                  const boardSize = box.width < 380 ? "sm" : "md";
                  if (!card) {
                    return <PlayingCard key={`slot-${index}`} slot size={boardSize} />;
                  }
                  if (onBoardTap) {
                    return (
                      <button
                        key={`${card}-${index}`}
                        type="button"
                        data-testid={`board-card-${index}`}
                        aria-label={`Изменить карту борда: ${card}`}
                        className="motion-safe:animate-board-card"
                        style={{ animationDelay: `${index * 70}ms` }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onBoardTap(index);
                        }}
                      >
                        <PlayingCard card={card} size={boardSize} />
                      </button>
                    );
                  }
                  return (
                    <span
                      key={`${card}-${index}`}
                      className="motion-safe:animate-board-card"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <PlayingCard card={card} size={boardSize} />
                    </span>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[9px] font-extrabold tracking-[0.18em] text-[rgba(217,179,106,0.6)] uppercase">
                {streetLabel}
              </div>
            </div>
          )}
          {slots.map((slot) => {
            const seat = bySeat.get(slot.seat);
            const pinStyle = {
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              width: seatWidthPx,
              height: seatHeightPx,
              transform: SEAT_CENTER_TRANSFORM,
            };
            if (!seat) {
              return (
                <div
                  key={`empty-${slot.seat}`}
                  className="absolute z-[1]"
                  data-testid={`table-seat-empty-${slot.seat}`}
                  style={pinStyle}
                  {...bindPress(slot.seat)}
                >
                  <EmptySeat
                    widthPx={seatWidthPx}
                    heightPx={seatHeightPx}
                    avatarPx={emptyAvatarPx}
                    disc={seatChrome === "column"}
                    label={
                      emptySeatLabels
                        ? avatarPositionLabel(
                            seatLabels === "chair"
                              ? chairPosition(data.table_size, data.button_seat, slot.seat)
                              : previewPosition(
                                  data.table_size,
                                  data.button_seat,
                                  occupiedSeats,
                                  slot.seat,
                                ),
                            seatLabels === "chair" ? data.table_size : occupiedSeats.length + 1,
                          )
                        : undefined
                    }
                  />
                </div>
              );
            }
            const shown =
              previewBet?.seat === seat.seat
                ? { ...seat, stack: previewBet.stack, committed: previewBet.amount }
                : seat;
            const awarded = {
              ...shown,
              stack: displayReplayStack(
                shown.stack,
                shown.seat,
                winnerSeats,
                state.pot,
                collectPot,
              ),
            };
            const isWinner = collectPot && winnerSeats.includes(seat.seat);
            const collision = chipCollisionBox(seatBlock, box, nameBoxPx);
            const showChip =
              !hideBets && !collectPot && !state.isShowdown && (shown.allIn || shown.committed > 0);
            const bet = showChip
              ? chipTowardCenter(slot, undefined, undefined, collision, box)
              : null;
            return (
              <div key={seat.seat} className="contents">
                <div
                  className="absolute z-[2] overflow-visible focus-within:z-[8]"
                  data-testid={`table-seat-${seat.seat}`}
                  data-slot-left={String(slot.left)}
                  data-slot-top={String(slot.top)}
                  data-winner={isWinner ? "1" : undefined}
                  style={pinStyle}
                  {...bindPress(seat.seat)}
                >
                  <SeatView
                    seat={
                      seatLabels === "chair"
                        ? {
                            ...awarded,
                            position: chairPosition(
                              data.table_size,
                              data.button_seat,
                              awarded.seat,
                            ),
                          }
                        : awarded
                    }
                    active={!hideHoles && state.actorSeat === seat.seat}
                    highlighted={highlightSeat === seat.seat || isWinner}
                    winner={isWinner}
                    required={requiredSeats?.includes(seat.seat) ?? false}
                    hideHoles={hideHoles}
                    occupiedCount={data.seats.length}
                    tableSize={data.table_size}
                    scale={scale}
                    widthPx={seatWidthPx}
                    heightPx={seatHeightPx}
                    formatAmount={formatAmount}
                    onToggleDisplay={onToggleDisplay}
                    stackMuted={mutedStackSeats?.has(seat.seat) ?? false}
                    onSeatCardsTap={hideHoles ? undefined : onSeatCardsTap}
                    onSeatNameTap={onSeatNameTap}
                    inviteHeroHoles={inviteHeroHoles}
                    lastActionType={
                      hideHoles
                        ? null
                        : seat.folded
                          ? "fold"
                          : !state.isDeal &&
                              !state.isShowdown &&
                              state.lastAction?.seat === seat.seat &&
                              state.lastAction.action !== "allin"
                            ? state.lastAction.action
                            : null
                    }
                    chrome={seatChrome}
                    namePos={seatNamePos}
                    pinTop={slot.top}
                    nameBoxPx={nameBoxPx}
                  />
                </div>
                {bet ? (
                  <span
                    className={cn(
                      "num absolute z-[3] inline-flex items-center gap-1 rounded-full border border-[rgba(217,179,106,0.4)] bg-[rgba(11,10,9,0.7)] px-2 py-px text-[9.5px] font-extrabold whitespace-nowrap text-[#F1D68E]",
                      flyingSeat === seat.seat &&
                        "motion-safe:animate-chip-fly pointer-events-none",
                    )}
                    data-testid={`table-bet-${seat.seat}`}
                    data-allin={shown.allIn ? "1" : undefined}
                    style={{
                      left: `${bet.left}%`,
                      top: `${bet.top}%`,
                      transform: SEAT_CENTER_TRANSFORM,
                    }}
                  >
                    <span className="bg-gold-grad inline-block h-[7px] w-[7px] shrink-0 rounded-full shadow-[0_0_0_1.5px_rgba(11,10,9,0.8)]" />
                    {shown.allIn ? "ОЛЛ-ИН" : formatAmount(shown.committed)}
                  </span>
                ) : null}
              </div>
            );
          })}
          {collectPot && winnerSeats.length > 0
            ? winnerSeats.map((seatNo) => {
                const slot = slots.find((item) => item.seat === seatNo);
                if (!slot) return null;
                const dest = chipTowardCenter(
                  slot,
                  undefined,
                  undefined,
                  chipCollisionBox(seatBlock, box, nameBoxPx),
                  box,
                );
                return (
                  <span
                    key={`pot-to-${seatNo}`}
                    data-testid={`pot-to-seat-${seatNo}`}
                    className="num text-gold-hi motion-safe:animate-pot-to-winner pointer-events-none absolute z-[5] inline-flex items-center gap-1 rounded-full border border-[rgba(217,179,106,0.4)] bg-[rgba(11,10,9,0.78)] px-2 py-px text-[9.5px] font-extrabold whitespace-nowrap"
                    style={
                      {
                        "--pot-to-left": `${dest.left}%`,
                        "--pot-to-top": `${dest.top}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="bg-gold-grad inline-block h-[7px] w-[7px] shrink-0 rounded-full shadow-[0_0_0_1.5px_rgba(11,10,9,0.8)]" />
                    {formatAmount(potShare(state.pot, winnerSeats.length))}
                  </span>
                );
              })
            : null}
        </div>
      </div>
    </div>
  );
}
