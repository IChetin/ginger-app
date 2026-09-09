import type { Dispatch } from "react";

import { DraftHeaderMenu } from "@/features/hands/components/DraftHeaderMenu";
import { DraftSaveBanner } from "@/features/hands/components/DraftSaveBanner";
import { lastReplayState } from "@/features/hands/lib/hand-engine";
import { STREET_TITLE } from "@/features/hands/lib/handSchema";
import {
  canUseBb,
  formatBlindsSummary,
  formatStackAmount,
} from "@/features/hands/lib/stackDisplay";
import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import type { DraftSaveVisible } from "@/features/hands/lib/useDraftSaveIndicator";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";

export function TableInputHeader({
  state,
  saveStatus,
  lastSavedAt,
  onRetry,
  onBack,
  onRestart,
  onOpenSettings,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  saveStatus: DraftSaveVisible;
  lastSavedAt: string | null;
  onRetry: () => void;
  onBack: () => void;
  onRestart: () => void;
  onOpenSettings?: () => void;
}) {
  const { mode } = useTableStackDisplay();
  let pot = 0;
  let street = state.streets.at(-1)?.street ?? "preflop";
  try {
    const replay = lastReplayState(state);
    pot = replay.pot;
    street = replay.street;
  } catch {
    pot = 0;
  }
  const bb = state.blinds.bb;
  const unit = mode === "bb" && canUseBb(bb) ? "bb" : "chips";
  const blinds = formatBlindsSummary({ sb: state.blinds.sb, bb, ante: 0 }, mode);
  return (
    <header
      role="banner"
      className="border-line bg-bg relative z-20 flex shrink-0 items-center gap-2 border-b px-3 py-2"
    >
      <button
        type="button"
        aria-label="Назад"
        className="text-ink flex h-11 w-11 items-center justify-center rounded-full text-[20px]"
        onClick={onBack}
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold">
          {state.phase === "setup" ? (
            "Новая раздача"
          ) : (
            <>
              {blinds}
              <span className="text-ink-3 font-semibold">{` · банк ${formatStackAmount(pot, unit, bb)}`}</span>
            </>
          )}
        </p>
      </div>
      {state.phase === "setup" ? null : (
        <span className="border-line-gold text-gold rounded-full border px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase">
          {STREET_TITLE[street]}
        </span>
      )}
      <DraftHeaderMenu
        lastSavedAt={lastSavedAt}
        onRestart={onRestart}
        onOpenSettings={state.phase === "setup" ? undefined : onOpenSettings}
        moreTestId="table-header-more"
        restartTestId="table-header-restart"
        settingsTestId="table-header-settings"
      />
      <DraftSaveBanner status={saveStatus} onRetry={onRetry} />
    </header>
  );
}
