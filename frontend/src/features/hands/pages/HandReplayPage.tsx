import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { HandAction } from "@/api/types/hands";
import { STICKY_BELOW_HEADER_TOP, StickyHeader } from "@/components/layout/StickyHeader";
import { CopyToast } from "@/components/ui/CopyToast";
import { PortalMenu } from "@/components/ui/PortalMenu";
import { useCopyToast } from "@/components/ui/useCopyToast";
import { useMe } from "@/features/auth/hooks";
import { buildLoginLocation } from "@/features/auth/lib/redirect";
import { ActionBadge } from "@/features/hands/components/ActionBadge";
import { PokerTable } from "@/features/hands/components/PokerTable";
import { ReplayControls } from "@/features/hands/components/ReplayControls";
import { ReplayEquity } from "@/features/hands/components/ReplayEquity";
import { ReplayMadeHands } from "@/features/hands/components/ReplayMadeHands";
import { ReplayResult } from "@/features/hands/components/ReplayResult";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { useHand } from "@/features/hands/hooks";
import { formatActionPhrase } from "@/features/hands/lib/actionTone";
import { formatAnteCaption } from "@/features/hands/lib/anteMode";
import { formatFoldOnStreet } from "@/features/hands/lib/foldStreet";
import { buildTimeline, getStateAtStep, heroProfit } from "@/features/hands/lib/hand-engine";
import { nextReplaySpeed } from "@/features/hands/lib/replaySpeed";
import {
  canUseBb,
  formatBlindLevel,
  formatReplayBlindsCaption,
  formatReplayProfit,
  formatStackAmount,
  replayNextHint,
} from "@/features/hands/lib/stackDisplay";
import { newHandLocation } from "@/features/hands/lib/startNewHand";
import { TABLE_SLOT_HEIGHT_CLASS } from "@/features/hands/lib/tableLayout";
import { useStackDisplay } from "@/features/hands/lib/useStackDisplay";
import { DetailSkeleton, ErrorState } from "@/features/schedule/components/QueryState";
import { shareOrCopyUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

function ReplayLogLines({
  last,
  lastActor,
  nextHint,
  street,
  log,
  formatAmount,
}: {
  last: HandAction | null;
  lastActor: { name: string; committed: number } | null | undefined;
  nextHint: string | null;
  street: "preflop" | "flop" | "turn" | "river";
  log: string;
  formatAmount: (value: number) => string;
}) {
  return last && lastActor ? (
    <>
      <b className="text-ink font-bold">{lastActor.name}</b>{" "}
      <ActionBadge action={last.action}>
        {last.action === "fold"
          ? formatFoldOnStreet(street)
          : formatActionPhrase(last, formatAmount, lastActor.committed)}
      </ActionBadge>
      {nextHint ? <span> · {nextHint}</span> : null}
    </>
  ) : (
    <>
      {log.split(" · ").map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? " · " : null}
          {index === 0 ? <b className="text-ink font-bold">{part}</b> : part}
        </span>
      ))}
    </>
  );
}

function ReplayHeaderMenu({
  shareTitle,
  editHref,
  onCopied,
  displayMode,
  onToggleDisplay,
}: {
  shareTitle: string;
  editHref?: string;
  onCopied: () => void;
  displayMode?: "chips" | "bb";
  onToggleDisplay?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="replay-header-more"
        aria-label="Ещё"
        aria-expanded={open}
        aria-haspopup="menu"
        className="bg-surface-2 text-ink-2 inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[18px] leading-none font-extrabold"
        onClick={() => setOpen((value) => !value)}
      >
        ···
      </button>
      <PortalMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        aria-label="Действия с раздачей"
      >
        <button
          type="button"
          role="menuitem"
          className="px-3 py-2 text-left"
          onClick={() => {
            setOpen(false);
            void shareOrCopyUrl({ title: shareTitle, url: window.location.href }).then(
              (outcome) => {
                if (outcome === "copied") onCopied();
              },
            );
          }}
        >
          Поделиться
        </button>
        {onToggleDisplay ? (
          <button
            type="button"
            role="menuitem"
            className="px-3 py-2 text-left"
            data-testid="replay-menu-units"
            onClick={() => {
              setOpen(false);
              onToggleDisplay();
            }}
          >
            {displayMode === "bb" ? "Показать фишки" : "Показать BB"}
          </button>
        ) : null}
        {editHref ? (
          <Link role="menuitem" to={editHref} className="px-3 py-2" onClick={() => setOpen(false)}>
            Править
          </Link>
        ) : null}
      </PortalMenu>
    </>
  );
}

export function HandReplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: user } = useMe();
  const query = useHand(slug);
  const stackDisplay = useStackDisplay();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const { message: toast, showCopied } = useCopyToast();

  const data = query.data?.status === "published" ? query.data.data : null;
  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data]);
  const safeStep = Math.min(step, Math.max(0, timeline.length - 1));
  const state = useMemo(() => {
    if (!data || timeline.length === 0) return null;
    try {
      return getStateAtStep(data, safeStep);
    } catch {
      return null;
    }
  }, [data, timeline.length, safeStep]);

  const lastStep = Math.max(0, timeline.length - 1);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [slug]);

  useEffect(() => {
    if (!playing || !state) return;
    if (safeStep >= lastStep) {
      setPlaying(false);
      return;
    }
    const next = timeline[safeStep + 1];
    const delay = (next?.kind === "deal" || next?.kind === "showdown" ? 1800 : 1200) / speed;
    const timer = window.setTimeout(
      () => setStep((current) => Math.min(lastStep, current + 1)),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [playing, safeStep, lastStep, speed, state, timeline]);

  const go = useCallback(
    (next: number) => {
      setPlaying(false);
      setStep(Math.max(0, Math.min(lastStep, next)));
    },
    [lastStep],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "Escape" && fullscreen) {
        event.preventDefault();
        setFullscreen(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(safeStep - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(safeStep + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, safeStep, fullscreen]);

  if (query.isLoading) {
    return (
      <div className="px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }

  if (query.isError || !query.data || !data || !state) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="px-4 py-16">
        <ErrorState
          message={notFound ? "Раздача не найдена" : "Не удалось загрузить раздачу"}
          onRetry={notFound ? undefined : () => void query.refetch()}
        />
        <div className="mt-6 text-center">
          <Link to={user ? "/hands" : "/"} className="text-gold text-[13px] font-bold">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const hand = query.data;
  const inApp = hand.is_owner;
  const bb = data.blinds.bb;
  const bbMode = canUseBb(bb);
  const displayMode = bbMode ? stackDisplay.mode : "chips";
  const formatAmount = (value: number) => formatStackAmount(value, displayMode, bb);
  const blinds = formatBlindLevel(data.blinds.sb, bb, displayMode);
  const ante = formatAnteCaption(data.blinds, formatAmount);
  const blindsFull = formatReplayBlindsCaption(blinds, ante, false);
  const blindsCompact = formatReplayBlindsCaption(blinds, ante, true);
  const title = hand.event
    ? `${hand.event.name} · ${hand.event.series_name}`
    : (hand.title ?? "Раздача");
  const loginTo = buildLoginLocation("/hand/new");
  const shareTitle = title;
  const last = state.lastAction;
  const lastActor = last ? state.seats.find((seat) => seat.seat === last.seat) : null;
  const nextHint = replayNextHint(state);
  const isLast = safeStep >= lastStep;
  const winnerSeats = data.result.winner_seats;
  const winnerNames = winnerSeats.map(
    (seat) => state.seats.find((item) => item.seat === seat)?.name ?? `Место ${seat}`,
  );
  const displayToggle = bbMode ? (
    <StackDisplayToggle compact mode={displayMode} onChange={stackDisplay.setMode} />
  ) : null;
  const fullscreenButton = (
    <button
      type="button"
      data-testid="replay-fullscreen"
      aria-label={fullscreen ? "Свернуть" : "Развернуть"}
      className="bg-surface-2 text-ink-2 inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
      onClick={() => setFullscreen((value) => !value)}
    >
      {fullscreen ? (
        <svg
          className="h-[18px] w-[18px] fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]"
          viewBox="0 0 24 24"
        >
          <path d="M9 4H5v4M15 4h4v4M9 20H5v-4M15 20h4v-4" />
        </svg>
      ) : (
        <svg
          className="h-[18px] w-[18px] fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]"
          viewBox="0 0 24 24"
        >
          <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
        </svg>
      )}
    </button>
  );

  const blindsLine = (
    <div
      className="text-ink-3 num min-w-0 truncate text-[10.5px] whitespace-nowrap"
      data-testid="replay-header-blinds"
      title={blindsFull}
      aria-label={blindsFull}
    >
      <span aria-hidden className="min-[430px]:hidden" data-testid="replay-header-blinds-compact">
        {blindsCompact}
      </span>
      <span
        aria-hidden
        className="hidden min-[430px]:inline"
        data-testid="replay-header-blinds-full"
      >
        {blindsFull}
      </span>
    </div>
  );

  const logo = (
    <span
      data-testid="replay-header-logo"
      className="hidden shrink-0 items-center gap-1.5 text-[16px] font-extrabold tracking-tight min-[420px]:inline-flex"
    >
      Day
      <i className="bg-gold-grad text-ink-ongold inline-flex h-[23px] w-[23px] -rotate-[4deg] items-center justify-center rounded-[7px] text-[13px] not-italic">
        2
      </i>
    </span>
  );

  const togglePlay = () => {
    if (safeStep >= lastStep) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setPlaying((value) => !value);
  };

  return (
    <div
      className={cn(
        "bg-bg flex min-w-0 flex-col",
        fullscreen ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-[100dvh]",
      )}
      data-testid="hand-replay"
      data-fullscreen={fullscreen ? "1" : undefined}
    >
      {fullscreen ? null : inApp ? (
        <StickyHeader
          title={
            <div className="flex min-w-0 items-center gap-2">
              {logo}
              <span className="bg-line-strong hidden h-5 w-px shrink-0 min-[420px]:inline" />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[13px] font-extrabold"
                  data-testid="replay-header-title"
                >
                  {title}
                </div>
                {blindsLine}
              </div>
            </div>
          }
          titleClassName="min-w-[80px]"
          backFallback="/hands"
          titleInExpanded={false}
          forceCompact
          actions={
            <>
              {fullscreenButton}
              <ReplayHeaderMenu
                shareTitle={shareTitle}
                editHref={hand.slug ? `/hand/${hand.slug}/edit` : undefined}
                onCopied={showCopied}
                displayMode={bbMode ? displayMode : undefined}
                onToggleDisplay={bbMode ? stackDisplay.toggle : undefined}
              />
            </>
          }
        />
      ) : (
        <StickyHeader
          title={
            <div className="flex min-w-0 items-center gap-2">
              {logo}
              <span className="bg-line-strong hidden h-5 w-px shrink-0 min-[420px]:inline" />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[12.5px] font-extrabold"
                  data-testid="replay-header-title"
                >
                  {hand.author.nickname}
                </div>
                <div className="text-ink-3 min-w-0 truncate text-[10.5px] whitespace-nowrap">
                  {title}
                </div>
              </div>
            </div>
          }
          titleClassName="min-w-[80px]"
          showBack={false}
          titleInExpanded={false}
          forceCompact
          actions={
            <>
              {displayToggle}
              {fullscreenButton}
            </>
          }
        />
      )}

      {fullscreen || inApp ? null : (
        <div className="border-line-gold mx-[13px] mt-2.5 flex items-center gap-[11px] rounded-md border bg-[linear-gradient(115deg,rgba(217,179,106,.16),rgba(217,179,106,.05))] px-[13px] py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-extrabold">Разберите свою раздачу</div>
            <div className="text-ink-2 mt-px text-[11.5px]">Стол, карты, эквити — за минуту</div>
          </div>
          <Link
            to={user ? "/hand/new" : loginTo.pathname}
            state={user ? undefined : loginTo.state}
            className="bg-gold-grad text-ink-ongold flex h-[34px] shrink-0 items-center rounded-[10px] px-3.5 text-[12.5px] font-extrabold"
            onClick={(event) => {
              if (!user) return;
              event.preventDefault();
              const loc = newHandLocation();
              navigate(loc.pathname, { state: loc.state });
            }}
          >
            Начать
          </Link>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="replay-stage">
        <div
          className={cn(
            "bg-bg sticky z-20",
            fullscreen ? "flex min-h-0 flex-1 flex-col" : "shrink-0",
          )}
          data-testid="replay-table-cluster"
          style={{ top: fullscreen ? 0 : STICKY_BELOW_HEADER_TOP }}
        >
          <div
            className={
              fullscreen
                ? "flex min-h-0 flex-1 flex-col"
                : `flex shrink-0 flex-col ${TABLE_SLOT_HEIGHT_CLASS}`
            }
            data-testid="replay-table-slot"
          >
            <PokerTable
              className="min-h-0 flex-1"
              fitHeight
              seatChrome="column"
              seatNamePos="beside"
              data={data}
              state={state}
              formatAmount={formatAmount}
              onToggleDisplay={bbMode ? stackDisplay.toggle : undefined}
              winnerSeats={winnerSeats}
              collectPot={isLast}
            />
          </div>

          <ReplayControls
            step={safeStep}
            total={timeline.length}
            playing={playing}
            speed={speed}
            onStep={go}
            onTogglePlay={togglePlay}
            onCycleSpeed={() => setSpeed((current) => nextReplaySpeed(current))}
            extra={
              fullscreen ? (
                <>
                  {displayToggle}
                  {fullscreenButton}
                </>
              ) : undefined
            }
          />
        </div>

        {fullscreen ? null : (
          <div className="pb-[max(0.25rem,env(safe-area-inset-bottom))]" data-testid="replay-below">
            {isLast ? (
              <ReplayResult
                winnerNames={winnerNames}
                pot={state.pot}
                heroProfit={heroProfit(state.pot, state.heroInvested, winnerSeats, data.hero_seat)}
                formatAmount={formatAmount}
                formatProfit={(value) => formatReplayProfit(value, displayMode, bb)}
                split={winnerSeats.length > 1}
                sidePotWarning={state.hasSidePotWarning}
              />
            ) : null}
            {isLast ? <ReplayMadeHands state={state} /> : <ReplayEquity state={state} />}

            {state.hasSidePotWarning && !isLast ? (
              <p className="text-ink-3 mx-[13px] mt-1 text-[11px]">Сайд-поты не учитываются</p>
            ) : null}

            {isLast ? (
              <details
                className="border-gold bg-surface-2 mx-[13px] mt-1.5 rounded-r-[10px] border-l-2 px-3 py-1.5"
                data-testid="replay-showdown"
              >
                <summary className="text-ink cursor-pointer text-[12px] font-extrabold">
                  Вскрытие
                </summary>
                <div
                  className="mt-1 text-[12px] text-[var(--text-2,#A9A395)]"
                  data-testid="replay-log"
                >
                  <ReplayLogLines
                    last={last}
                    lastActor={lastActor}
                    nextHint={nextHint}
                    street={state.street}
                    log={state.log}
                    formatAmount={formatAmount}
                  />
                </div>
              </details>
            ) : (
              <div
                className="border-gold bg-surface-2 mx-[13px] mt-1.5 line-clamp-2 rounded-r-[10px] border-l-2 px-3 py-1.5 text-[12px] text-[var(--text-2,#A9A395)]"
                data-testid="replay-log"
              >
                <ReplayLogLines
                  last={last}
                  lastActor={lastActor}
                  nextHint={nextHint}
                  street={state.street}
                  log={state.log}
                  formatAmount={formatAmount}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <CopyToast message={toast} />
    </div>
  );
}
