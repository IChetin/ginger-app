import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatChips } from "@/features/hands/components/PlayingCard";
import { ActionPanel } from "@/features/hands/components/table-input/ActionPanel";
import { DeckPanel } from "@/features/hands/components/table-input/DeckPanel";
import { HeroCardsPrompt } from "@/features/hands/components/table-input/HeroCardsPrompt";
import { InteractiveTable } from "@/features/hands/components/table-input/InteractiveTable";
import { ResultPanel } from "@/features/hands/components/table-input/ResultPanel";
import { SetupPanel, type SetupSheet } from "@/features/hands/components/table-input/SetupPanel";
import { SizingPanel } from "@/features/hands/components/table-input/SizingPanel";
import { TableInputHeader } from "@/features/hands/components/table-input/TableInputHeader";
import { usePublishHand, useUpdateHand } from "@/features/hands/hooks";
import { isTypingInField } from "@/features/hands/lib/deckKeys";
import {
  AUTOSAVE_MS,
  deleteLocalDraft,
  describeDraftLoss,
  draftHasProgress,
  emptyLocalDraft,
  getLocalDraft,
  localDraftFromRead,
  putLocalDraft,
} from "@/features/hands/lib/draftIdb";
import {
  queueDraftDelete,
  queueDraftSave,
  resolveDraftConflict,
} from "@/features/hands/lib/draftSync";
import {
  buildHandData,
  buildPartialData,
  isDefaultStack,
  lastReplayState,
  resolveWinners,
} from "@/features/hands/lib/hand-engine";
import { handDataSchema } from "@/features/hands/lib/handSchema";
import { requiredSeats } from "@/features/hands/lib/positions";
import { canUseBb, formatStackAmount } from "@/features/hands/lib/stackDisplay";
import { useDraftSaveIndicator } from "@/features/hands/lib/useDraftSaveIndicator";
import { useHandInputRoute } from "@/features/hands/lib/useHandInputRoute";
import {
  TableStackDisplayProvider,
  useTableStackDisplay,
} from "@/features/hands/lib/useTableStackDisplay";
import {
  emptyTableInput,
  lineupResetWarning,
  tableActionCount,
  tableFromWizard,
  tableReducer,
  tableToWizard,
} from "@/features/hands/lib/tableInputState";
import { wizardFromHand } from "@/features/hands/lib/wizardState";
import { DetailSkeleton, ErrorState } from "@/features/schedule/components/QueryState";
import { useViewportLock } from "@/lib/useViewportLock";

export function HandTablePage() {
  return (
    <TableStackDisplayProvider>
      <HandTablePageInner />
    </TableStackDisplayProvider>
  );
}

function HandTablePageInner() {
  const { slug, isPublishedEdit, existing, draftId, creating } = useHandInputRoute();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const publish = usePublishHand();
  const update = useUpdateHand(slug ?? "");
  const { mode, toggle } = useTableStackDisplay();
  const [state, dispatch] = useReducer(tableReducer, undefined, emptyTableInput);
  const [setupSheet, setSetupSheet] = useState<SetupSheet>("bar");
  const [focusName, setFocusName] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [holdingSeat, setHoldingSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(() => creating && Boolean(draftId) && !isPublishedEdit);
  const [hydrateTick, setHydrateTick] = useState(0);
  const saveUi = useDraftSaveIndicator();
  const saveUiRef = useRef(saveUi);
  saveUiRef.current = saveUi;
  const skipAutosave = useRef(true);
  const hydrated = useRef(false);
  const resolvingConflict = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  useViewportLock();

  useEffect(() => {
    if (isPublishedEdit || !draftId || hydrated.current) return;
    hydrated.current = true;
    const row = existing.data?.status === "draft" ? existing.data : undefined;
    void (async () => {
      const local = await getLocalDraft(draftId);
      const mapped = row ? localDraftFromRead(row) : null;
      if (local) {
        dispatch({ type: "hydrate", state: tableFromWizard(local.state) });
        saveUiRef.current.rememberSaved(local.updatedAt);
      } else if (mapped) {
        dispatch({ type: "hydrate", state: tableFromWizard(mapped.state) });
        saveUiRef.current.rememberSaved(mapped.updatedAt);
      } else {
        await putLocalDraft(emptyLocalDraft(draftId, tableToWizard(emptyTableInput()), slug));
      }
      skipAutosave.current = false;
      setReady(true);
      setHydrateTick((tick) => tick + 1);
    })();
  }, [isPublishedEdit, draftId, existing.data, slug]);

  useEffect(() => {
    if (!isPublishedEdit || !existing.data?.data) return;
    dispatch({
      type: "hydrate",
      state: tableFromWizard(
        wizardFromHand(existing.data.data, {
          eventId: existing.data.event_id,
          seriesId: existing.data.series_id,
          liveSessionId: existing.data.live_session_id,
          note: existing.data.note,
          isPublic: existing.data.is_public,
        }),
      ),
    });
    setReady(true);
  }, [isPublishedEdit, existing.data]);

  async function flushDraft() {
    if (!draftId) return;
    const wizard = tableToWizard(stateRef.current);
    if (!draftHasProgress(wizard)) {
      saveUiRef.current.cancelRequest();
      return;
    }
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (!offline) saveUiRef.current.beginRequest();
    const result = await queueDraftSave(draftId, wizard, { slug });
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      saveUiRef.current.markLocalSaved();
      saveUiRef.current.cancelRequest();
      return;
    }
    if (!result.ok && result.conflict) {
      saveUiRef.current.cancelRequest();
      await handleConflict();
      return;
    }
    if (!result.ok) {
      if (result.code === "draft_limit") setError(result.message);
      saveUiRef.current.fail();
      return;
    }
    saveUiRef.current.succeed();
  }

  useEffect(() => {
    if (isPublishedEdit || !ready || skipAutosave.current || !draftId) return;
    const wizard = tableToWizard(state);
    void getLocalDraft(draftId).then((prev) =>
      putLocalDraft({
        ...(prev ?? emptyLocalDraft(draftId)),
        state: wizard,
        updatedAt: new Date().toISOString(),
        deleted: false,
      }),
    );
    saveUiRef.current.markLocalSaved();
    if (!draftHasProgress(wizard)) {
      saveUiRef.current.cancelRequest();
      return;
    }
    const timer = window.setTimeout(() => {
      void flushDraft();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, state, isPublishedEdit, draftId, slug, hydrateTick]);

  async function handleConflict() {
    if (resolvingConflict.current || !draftId) return;
    resolvingConflict.current = true;
    const keepLocal = await confirm({
      title: "Черновик изменён на другом устройстве",
      description: "Какую версию оставить?",
      confirmLabel: "На этом устройстве",
      cancelLabel: "На другом устройстве",
    });
    const next = await resolveDraftConflict(draftId, keepLocal ? "local" : "server");
    dispatch({ type: "hydrate", state: tableFromWizard(next) });
    resolvingConflict.current = false;
    saveUiRef.current.succeed();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.shiftKey) {
        return;
      }
      if (isTypingInField(event.target)) return;
      event.preventDefault();
      dispatch({ type: "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!state.flyingChip) return;
    const timer = window.setTimeout(() => dispatch({ type: "clearFly" }), 400);
    return () => window.clearTimeout(timer);
  }, [state.flyingChip]);

  useEffect(() => {
    if (state.phase !== "setup" && !settingsOpen) setSetupSheet("bar");
  }, [state.phase, settingsOpen]);

  const goClose = () => {
    void (async () => {
      if (!isPublishedEdit && draftId) {
        const snapshot = tableToWizard(stateRef.current);
        if (!draftHasProgress(snapshot)) {
          const local = await getLocalDraft(draftId);
          if (local?.createdOnServer) await queueDraftDelete(draftId);
          else await deleteLocalDraft(draftId);
        } else {
          await queueDraftSave(draftId, snapshot, { slug });
        }
      }
      if (window.history.length > 1) navigate(-1);
      else navigate("/hands");
    })();
  };

  const requestRestart = async () => {
    const ok = await confirm({
      title: "Начать заново?",
      description: `${describeDraftLoss(tableToWizard(state))} Продолжить?`,
      confirmLabel: "Начать заново",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (!ok) return;
    skipAutosave.current = true;
    dispatch({ type: "hydrate", state: emptyTableInput() });
    setSetupSheet("bar");
    setSettingsOpen(false);
    if (draftId)
      await putLocalDraft(emptyLocalDraft(draftId, tableToWizard(emptyTableInput()), slug));
    skipAutosave.current = false;
  };

  const save = async () => {
    setError(null);
    try {
      if (resolveWinners(state).length === 0) {
        setError("Введите карты вскрытия или укажите, кто забрал банк");
        return;
      }
      const data = buildHandData(state);
      const parsed = handDataSchema.safeParse(data);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Проверьте раздачу");
        return;
      }
      const payload = {
        event_id: state.eventId,
        series_id: state.seriesId,
        live_session_id: state.liveSessionId,
        is_public: state.isPublic,
        note: state.note.trim() || null,
        data: parsed.data,
        clear_event: !state.eventId,
        clear_series: !state.seriesId,
        clear_live_session: !state.liveSessionId,
      };
      const saved = isPublishedEdit
        ? await update.mutateAsync(payload)
        : await publish.mutateAsync({ id: draftId!, body: payload });
      if (!isPublishedEdit && draftId) await deleteLocalDraft(draftId);
      if (!saved.slug) {
        setError("Не удалось получить ссылку");
        return;
      }
      navigate(`/hand/${saved.slug}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  };

  const waitForExisting = isPublishedEdit || (Boolean(slug) && !creating && !draftId);
  if (waitForExisting && existing.isLoading) {
    return (
      <div className="px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }
  if (waitForExisting && existing.isError) {
    return (
      <div className="px-4 py-16">
        <ErrorState message="Раздача не найдена" />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }

  const setupMode = state.phase === "setup" || settingsOpen;

  const confirmLineup = async (): Promise<boolean> => {
    const count = tableActionCount(state);
    if (count === 0) return true;
    return confirm({
      title: "Изменить состав?",
      description: lineupResetWarning(count),
      confirmLabel: "Сбросить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
  };

  const openSettings = () => {
    if (state.phase === "sizing") dispatch({ type: "cancelSizing" });
    if (state.phase === "cards") dispatch({ type: "closeDeck" });
    setSettingsOpen(true);
    setSetupSheet("bar");
  };

  const handleSeatTap = (seat: number) => {
    if (setupMode) {
      if (holdingSeat != null) {
        void (async () => {
          if (holdingSeat !== seat) {
            if (!(await confirmLineup())) {
              setHoldingSeat(null);
              return;
            }
            dispatch({ type: "moveSeat", from: holdingSeat, to: seat });
          }
          setHoldingSeat(null);
          setSetupSheet("bar");
        })();
        return;
      }
      if (state.occupied.includes(seat)) {
        setFocusName(false);
        setSetupSheet(seat);
        return;
      }
      void (async () => {
        if (!(await confirmLineup())) return;
        dispatch({ type: "toggleSeat", seat });
        setSetupSheet("bar");
      })();
      return;
    }
    dispatch({ type: "tapSeat", seat });
  };

  let replay;
  try {
    replay = lastReplayState(state, { hideUntilShowdown: false });
  } catch {
    replay = lastReplayState(
      {
        ...state,
        streets: [{ street: "preflop", board: [], actions: [] }],
      },
      { hideUntilShowdown: false },
    );
  }
  const data = buildPartialData(state);
  const actor = replay.seats.find((seat) => seat.seat === replay.actorSeat);
  const previewBet =
    state.phase === "sizing" && state.sizing && state.sizing.to != null && actor
      ? {
          seat: actor.seat,
          amount: state.sizing.to,
          stack: Math.max(0, actor.stack - Math.max(0, state.sizing.to - actor.committed)),
        }
      : null;

  return (
    <div
      className="bg-bg flex h-[100svh] max-h-[100svh] flex-col overflow-hidden overscroll-none"
      data-testid="hand-table-page"
    >
      <TableInputHeader
        state={state}
        dispatch={dispatch}
        saveStatus={saveUi.visible}
        lastSavedAt={saveUi.lastSavedAt}
        onRetry={() => void flushDraft()}
        onBack={goClose}
        onRestart={() => void requestRestart()}
        onOpenSettings={openSettings}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <InteractiveTable
          className="min-h-0 flex-1"
          fitHeight
          seatChrome="column"
          seatNamePos="beside"
          data={data}
          state={replay}
          formatAmount={(value) =>
            mode === "bb" && canUseBb(state.blinds.bb)
              ? formatStackAmount(value, mode, state.blinds.bb)
              : formatChips(value)
          }
          emptySeatLabels
          seatLabels="chair"
          inviteHeroHoles={!setupMode}
          hideBets={state.phase === "setup"}
          hideHoles={state.phase === "setup"}
          feltHint={
            setupMode
              ? holdingSeat != null
                ? "Тапните место, куда пересадить"
                : state.seatHintSeen
                  ? undefined
                  : "Тап по пустому месту — посадить, по игроку — настроить"
              : undefined
          }
          highlightSeat={holdingSeat ?? (typeof setupSheet === "number" ? setupSheet : null)}
          requiredSeats={
            setupMode
              ? requiredSeats(state.tableSize, state.buttonSeat, state.heroSeat, state.occupied)
              : undefined
          }
          mutedStackSeats={
            setupMode
              ? new Set(state.occupied.filter((seat) => isDefaultStack(state.stacks[seat])))
              : undefined
          }
          previewBet={previewBet}
          flyingSeat={state.flyingChip?.seat ?? null}
          onSeatTap={handleSeatTap}
          onSeatNameTap={(seat) => {
            if (!state.occupied.includes(seat)) return;
            setFocusName(true);
            setSetupSheet(seat);
          }}
          onSeatCardsTap={
            setupMode ? undefined : (seat) => dispatch({ type: "tapSeatCards", seat })
          }
          onSeatLongPress={
            setupMode
              ? (seat) => {
                  if (!state.occupied.includes(seat)) return;
                  setHoldingSeat(seat);
                  setSetupSheet("bar");
                }
              : (seat) => {
                  void (async () => {
                    if (!(await confirmLineup())) return;
                    dispatch({ type: "setHero", seat });
                  })();
                }
          }
          onBoardTap={setupMode ? undefined : (index) => dispatch({ type: "tapBoardCard", index })}
          onToggleDisplay={canUseBb(state.blinds.bb) ? toggle : undefined}
        />
        {state.phase === "heroPrompt" && !settingsOpen ? (
          <HeroCardsPrompt
            onEnter={() => dispatch({ type: "openDeck", kind: "hero" })}
            onSkip={() => dispatch({ type: "continueWithoutHeroCards" })}
          />
        ) : null}
        {setupMode || typeof setupSheet === "number" ? (
          <SetupPanel
            state={state}
            dispatch={dispatch}
            sheet={setupSheet}
            onSheetChange={(next) => {
              if (typeof next !== "number") setFocusName(false);
              setSetupSheet(next);
            }}
            focusName={focusName}
            playing={settingsOpen}
            onResume={() => {
              setSettingsOpen(false);
              setSetupSheet("bar");
            }}
            onStartMove={(seat) => {
              setHoldingSeat(seat);
              setSetupSheet("bar");
            }}
          />
        ) : null}
      </div>
      {!settingsOpen && state.phase === "acting" && typeof setupSheet !== "number" ? (
        <ActionPanel state={state} dispatch={dispatch} />
      ) : null}
      {!settingsOpen && state.phase === "sizing" && typeof setupSheet !== "number" ? (
        <SizingPanel state={state} dispatch={dispatch} />
      ) : null}
      {!settingsOpen && state.phase === "cards" && typeof setupSheet !== "number" ? (
        <DeckPanel state={state} dispatch={dispatch} />
      ) : null}
      {!settingsOpen &&
      typeof setupSheet !== "number" &&
      (state.phase === "showdown" || state.phase === "winner" || state.phase === "result") ? (
        <ResultPanel
          state={state}
          dispatch={dispatch}
          onSave={() => void save()}
          saving={publish.isPending || update.isPending}
          error={error}
        />
      ) : null}
    </div>
  );
}
