import { GingerFox } from "@/components/brand/GingerFox";
import { GingerWordmark } from "@/components/brand/GingerWordmark";
import { cn } from "@/lib/utils";

type Props = {
  /** Ширину задаёт className (w-…): лиса и надпись масштабируются вместе. */
  className?: string;
};

/**
 * Полный логотип для крупных экранов (вход, установка, онбординг): лиса над надписью.
 * В мелких местах — только лиса (GingerFox) или лиса рядом с надписью в строку.
 */
export function GingerLogo({ className }: Props) {
  return (
    <div
      role="img"
      aria-label="Ginger"
      className={cn("flex flex-col items-center", className)}
      data-testid="ginger-logo"
    >
      <GingerFox className="w-[87%]" />
      <GingerWordmark className="mt-[6%] h-auto w-full" title="" />
    </div>
  );
}
