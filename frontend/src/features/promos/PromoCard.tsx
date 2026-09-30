import { useState } from "react";
import { Link } from "react-router-dom";

import type { Promo } from "@/features/promos/promosApi";
import {
  GAME_LABEL,
  KIND_LABEL,
  activeWindow,
  buyinLabel,
  durationLabel,
  formatPromoMoney,
  promoDate,
  promoPhase,
} from "@/features/promos/lib";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { APP_TINT } from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const TOP = 3;
const PLACE_TONES = ["text-gold-hi", "text-[#d8d3c8]", "text-[#c9905a]"];

/**
 * Акция клуба единой плашкой (макет Ивана 30.09): клуб в цвет приложения, фонд крупно,
 * срок и сколько осталось, кто участвует, «x2 сейчас», пока идут двойные очки, три
 * первых приза и остальные по тапу. Главная акция экрана — в двойной рамке ар-деко.
 */
export function PromoCard({
  promo,
  now,
  main = false,
}: {
  promo: Promo;
  now: Date;
  main?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  const phase = promoPhase(promo, now);
  const boost = phase.kind === "running" ? activeWindow(promo.boost_windows, now) : null;
  const tint = promo.club ? APP_TINT[promo.club.app] : undefined;
  const fund = formatPromoMoney(promo.prize_fund, promo.currency_symbol);
  const prizes = expanded ? promo.prizes : promo.prizes.slice(0, TOP);
  const hidden = promo.prizes.length - TOP;
  const scheduleLink = promo.game === "cash" ? "/cash" : "/tournaments";

  return (
    <article
      className={cn("bg-surface border-line border", main && "deco-frame")}
      data-testid="promo-card"
    >
      <header
        className="border-line flex items-center gap-2 border-b px-3 py-2"
        style={
          tint ? { background: `linear-gradient(90deg, ${tint}55, transparent 85%)` } : undefined
        }
      >
        {promo.club ? <AppIcon app={promo.club.app} className="h-5 w-5 shrink-0" /> : null}
        <span className="text-ink-2 min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-[0.06em] uppercase">
          {promo.club?.name ?? "Все клубы"}
        </span>
        <span className="border-line-gold text-gold font-display shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]">
          {KIND_LABEL[promo.kind]}
        </span>
      </header>

      <div className="px-3 pt-2.5 pb-3">
        <h3 className="text-ink text-[17px] leading-tight font-bold">{promo.title}</h3>
        {fund || promo.prize_extra ? (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            {fund ? (
              <span className="font-display num text-value-hi text-[30px] leading-none font-bold">
                {fund}
              </span>
            ) : null}
            <span className="text-ink-2 text-[13px] font-semibold">
              {fund ? "призовой фонд" : ""}
              {fund && promo.prize_extra ? " + " : ""}
              {promo.prize_extra ?? ""}
            </span>
          </p>
        ) : null}

        <p className="text-ink-2 mt-1.5 text-[13px]" data-testid="promo-when">
          {phase.kind === "upcoming" && promo.starts_at ? (
            <>
              с <b className="text-ink">{promoDate(promo.starts_at)}</b>
              {promo.ends_at ? <> по {promoDate(promo.ends_at, true)}</> : null}
            </>
          ) : promo.ends_at ? (
            <>
              до <b className="text-ink">{promoDate(promo.ends_at, true)}</b>
              {phase.kind === "running" && phase.daysLeft > 0 ? (
                <>
                  {" · осталось "}
                  <b className="text-ink">
                    {phase.daysLeft} {pluralRu(phase.daysLeft, "день", "дня", "дней")}
                  </b>
                </>
              ) : null}
            </>
          ) : null}
          {promo.recurrence === "monthly" ? <b className="text-ink"> · каждый месяц</b> : null}
        </p>
        {phase.kind === "upcoming" ? (
          <p className="text-live mt-1.5 text-[12px] font-extrabold tracking-[0.08em] uppercase">
            {phase.startsInDays <= 1
              ? "Старт завтра"
              : `Старт через ${phase.startsInDays} ${pluralRu(phase.startsInDays, "день", "дня", "дней")}`}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1">
          <span className="bg-surface-2 text-ink-2 px-1.5 py-0.5 text-[12px] font-semibold">
            {GAME_LABEL[promo.game]}
          </span>
          <span className="bg-surface-2 text-ink-2 px-1.5 py-0.5 text-[12px] font-semibold">
            {buyinLabel(promo)}
          </span>
          {promo.prizes.length > 0 ? (
            <span className="bg-surface-2 text-ink-2 px-1.5 py-0.5 text-[12px] font-semibold">
              {promo.prizes.length}{" "}
              {pluralRu(promo.prizes.length, "призовое место", "призовых места", "призовых мест")}
            </span>
          ) : null}
        </div>

        {promo.boost_windows.length > 0 ? (
          <div
            className={cn(
              "mt-2.5 flex items-center gap-2 border px-2.5 py-1.5 text-[13px]",
              boost ? "border-gold bg-gold-soft" : "border-line-gold",
            )}
            data-testid="promo-boost"
          >
            <span className="bg-gold text-ink-ongold font-display px-1.5 text-[14px] font-bold">
              x{boost?.window.multiplier ?? promo.boost_windows[0]?.multiplier ?? 2}
            </span>
            {boost ? (
              <span>
                <b className="text-gold-hi">Двойные очки сейчас</b> · ещё{" "}
                {durationLabel(boost.minutesLeft)}
              </span>
            ) : (
              <span className="text-ink-2">
                Двойные очки каждый день{" "}
                {promo.boost_windows.map((item) => `${item.start}–${item.end}`).join(", ")} МСК
              </span>
            )}
          </div>
        ) : null}

        {promo.prizes.length > 0 ? (
          <div className="border-line mt-2.5 border-t pt-2">
            {prizes.map((prize) => (
              <div key={prize.place} className="flex items-baseline gap-2.5 py-0.5">
                <span
                  className={cn(
                    "font-display w-6 text-[14px] font-bold",
                    PLACE_TONES[prize.place - 1] ?? "text-ink-3",
                  )}
                >
                  {prize.place}
                </span>
                <span className="text-ink-2 text-[13px]">место</span>
                <span
                  className={cn(
                    "font-display num ml-auto text-[15px] font-semibold",
                    prize.place === 1 ? "text-gold-hi" : "text-ink",
                  )}
                >
                  {prize.amount !== null
                    ? formatPromoMoney(prize.amount, promo.currency_symbol)
                    : prize.label}
                </span>
              </div>
            ))}
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-gold pt-1 text-[13px] font-bold"
              >
                {expanded
                  ? "Свернуть ▴"
                  : `Ещё ${hidden} ${pluralRu(hidden, "место", "места", "мест")} ▾`}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          <Link to={scheduleLink} className="text-gold text-[13px] font-bold">
            {promo.game === "cash" ? "Кэш-столы →" : "Расписание турниров →"}
          </Link>
          {promo.image_url ? (
            <button
              type="button"
              onClick={() => setShowPoster((value) => !value)}
              className="text-ink-3 text-[13px] font-bold"
            >
              {showPoster ? "Скрыть афишу" : "Афиша"}
            </button>
          ) : null}
        </div>
        {showPoster && promo.image_url ? (
          <img
            src={promo.image_url}
            alt={`Афиша: ${promo.title}`}
            className="mt-2 block w-full"
            loading="lazy"
          />
        ) : null}
      </div>
    </article>
  );
}
