import { CARD_FACE, type CardDeck, suitColor } from "@/features/hands/lib/cardDeck";
import { useCardDeck } from "@/features/hands/lib/CardDeckPreferenceProvider";
import { signPrefix } from "@/lib/money";
import { cn } from "@/lib/utils";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function rankGlyph(rank: string): string {
  return rank === "T" ? "10" : rank;
}

export function suitGlyph(suit: string): string {
  return SUIT_GLYPH[suit] ?? suit;
}

export function formatChips(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatChipProfit(value: number): string {
  return `${signPrefix(value)}${formatChips(Math.abs(value))}`;
}

const CARD_BOX = {
  lg: "h-[66px] w-[47px]",
  md: "h-[53px] w-[38px]",
  hole: "h-[42px] w-[30px] rounded-[5px]",
  sm: "h-9 w-[26px]",
  strip: "h-[34px] w-6 rounded-[4px]",
  xs: "h-[22px] w-4 rounded-[3px]",
} as const;

const CARD_RANK = {
  lg: "text-[24px] tracking-tight",
  md: "text-[19px] tracking-tight",
  hole: "text-[12px] tracking-tight",
  sm: "text-[13px]",
  strip: "text-[11px] tracking-tight",
  xs: "text-[9px]",
} as const;

const CARD_SUIT = {
  lg: "mt-px text-[16px]",
  md: "mt-px text-[14px]",
  hole: "text-[10px]",
  sm: "text-[9px]",
  strip: "text-[8px]",
  xs: "text-[7px]",
} as const;

const CARD_BACK_TYPE = {
  lg: "text-[13px]",
  md: "text-[11px]",
  hole: "text-[8px]",
  sm: "text-[9px]",
  strip: "text-[8px]",
  xs: "text-[7px]",
} as const;

const CARD_BACK =
  "relative inline-flex items-center justify-center rounded-[6px] border border-[rgba(217,179,106,0.3)] bg-[linear-gradient(140deg,#4A3D24,#241E13)] font-extrabold text-[rgba(217,179,106,0.35)]";

export type PlayingCardSize = keyof typeof CARD_BOX;

function CardBack({ size }: { size: PlayingCardSize }) {
  return (
    <span className={cn(CARD_BACK, CARD_BOX[size])} data-testid="card-back">
      <span className={CARD_BACK_TYPE[size]} aria-hidden>
        2
      </span>
    </span>
  );
}

export function PlayingCard({
  card,
  size = "md",
  slot = false,
  back = false,
  faceDown = false,
  invite = false,
  scheme: schemeProp,
}: {
  card?: string;
  size?: PlayingCardSize;
  slot?: boolean;
  back?: boolean;
  faceDown?: boolean;
  invite?: boolean;
  /** Override the profile deck — used by the settings preview. */
  scheme?: CardDeck;
}) {
  const box = CARD_BOX[size];
  const profileScheme = useCardDeck();
  if (back || faceDown) {
    return <CardBack size={size} />;
  }
  if (slot || !card) {
    return (
      <span
        data-testid={invite ? "card-invite" : "card-slot"}
        className={cn(
          "inline-flex flex-col items-center justify-center rounded-[6px] border border-dashed bg-[rgba(255,255,255,0.04)]",
          invite
            ? "border-[rgba(217,179,106,0.55)] text-[12px] font-extrabold text-[rgba(217,179,106,0.85)]"
            : "border-[rgba(217,179,106,0.22)]",
          box,
        )}
      >
        {invite ? "+" : null}
      </span>
    );
  }
  const rank = card[0] ?? "";
  const suit = card[1] ?? "";
  const scheme = schemeProp ?? profileScheme;
  return (
    <span
      data-testid="playing-card"
      data-suit={suit}
      data-scheme={scheme}
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-[6px] leading-none font-extrabold shadow-[0_3px_8px_rgba(0,0,0,0.5)]",
        box,
      )}
      style={{ backgroundColor: CARD_FACE, color: suitColor(suit, scheme) }}
    >
      <span className={CARD_RANK[size]}>{rankGlyph(rank)}</span>
      <span className={CARD_SUIT[size]}>{suitGlyph(suit)}</span>
    </span>
  );
}
