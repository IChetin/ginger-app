import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { LadderNumberStepper } from "@/components/ui/NumberStepper";
import { AnteModeToggle } from "@/features/hands/components/AnteModeToggle";
import { CardDeck } from "@/features/hands/components/CardDeck";
import { DraftHeaderMenu } from "@/features/hands/components/DraftHeaderMenu";
import { DraftSaveBanner } from "@/features/hands/components/DraftSaveBanner";
import { HandLinkSelect } from "@/features/hands/components/HandLinkSelect";
import { MiniTable } from "@/features/hands/components/MiniTable";
import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { ResultStep } from "@/features/hands/components/ResultStep";
import { SeatEditSheet } from "@/features/hands/components/SeatEditSheet";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { StreetActionStep } from "@/features/hands/components/StreetActionStep";
import { StreetTabs } from "@/features/hands/components/StreetTabs";
import { WizardBoardStrip } from "@/features/hands/components/WizardBoardStrip";
import { WizardStepNav } from "@/features/hands/components/WizardStepNav";
import { usePublishHand, useUpdateHand } from "@/features/hands/hooks";
import { wizardAnteMode } from "@/features/hands/lib/anteMode";
import { isTypingInField } from "@/features/hands/lib/deckKeys";
import { describeHole } from "@/features/hands/lib/describeHand";
import { displaySeatName } from "@/features/hands/lib/playerNames";
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
  boardSizeFor,
  handDataSchema,
  nextStreet,
  step1Schema,
  step2Schema,
  STREET_TITLE,
} from "@/features/hands/lib/handSchema";
import {
  assignPositions,
  blindSeats,
  isTableSize,
  requiredSeatHint,
  TABLE_SIZES,
} from "@/features/hands/lib/positions";
import { canUseBb, formatStackAmount, stackPlaceholder } from "@/features/hands/lib/stackDisplay";
import { useDraftSaveIndicator } from "@/features/hands/lib/useDraftSaveIndicator";
import { useHandInputRoute } from "@/features/hands/lib/useHandInputRoute";
import { useStackDisplay } from "@/features/hands/lib/useStackDisplay";
import {
  buildHandData,
  boardPickerIncomplete,
  canUndo,
  currentStreet,
  currentStreetIndex,
  emptyWizard,
  formatChipInput,
  invalidStartingStackNames,
  isEditingAllBoard,
  parseChipInput,
  resolveWinners,
  startingStackHint,
  streetActionCount,
  streetClosed,
  usedCards,
  wizardFromHand,
  wizardReducer,
  type WizardAction,
  type WizardState,
  type WizardStep,
} from "@/features/hands/lib/wizardState";
import { DetailSkeleton, ErrorState } from "@/features/schedule/components/QueryState";
import { parseStepperInt } from "@/lib/numberStep";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const iconClass =
  "h-[18px] w-[18px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function HandWizardPage() {
  const { slug, isPublishedEdit, existing, draftId, creating } = useHandInputRoute();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const publish = usePublishHand();
  const update = useUpdateHand(slug ?? "");
  const [state, dispatch] = useReducer(wizardReducer, undefined, emptyWizard);
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

  useEffect(() => {
    if (isPublishedEdit || !draftId || hydrated.current) return;
    hydrated.current = true;
    const row = existing.data?.status === "draft" ? existing.data : undefined;
    void (async () => {
      const local = await getLocalDraft(draftId);
      const mapped = row ? localDraftFromRead(row) : null;
      if (local) {
        dispatch({ type: "hydrate", state: local.state });
        saveUiRef.current.rememberSaved(local.updatedAt);
      } else if (mapped) {
        dispatch({ type: "hydrate", state: mapped.state });
        saveUiRef.current.rememberSaved(mapped.updatedAt);
      } else {
        await putLocalDraft(emptyLocalDraft(draftId, undefined, slug));
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
      state: wizardFromHand(existing.data.data, {
        eventId: existing.data.event_id,
        seriesId: existing.data.series_id,
        liveSessionId: existing.data.live_session_id,
        note: existing.data.note,
        isPublic: existing.data.is_public,
      }),
    });
    setReady(true);
  }, [isPublishedEdit, existing.data]);

  useEffect(() => {
    if (isPublishedEdit || !ready || skipAutosave.current || !draftId) return;
    void getLocalDraft(draftId).then((prev) =>
      putLocalDraft({
        ...(prev ?? emptyLocalDraft(draftId, undefined, slug)),
        slug: prev?.slug ?? slug,
        state,
        updatedAt: new Date().toISOString(),
        deleted: false,
      }),
    );
    saveUiRef.current.markLocalSaved();
    if (!draftHasProgress(state)) {
      saveUiRef.current.cancelRequest();
      return;
    }
    const timer = window.setTimeout(() => {
      void flushDraft();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, state, isPublishedEdit, draftId, slug, hydrateTick]);

  async function flushDraft() {
    if (!draftId) return;
    const snapshot = stateRef.current;
    if (!draftHasProgress(snapshot)) {
      saveUiRef.current.cancelRequest();
      return;
    }
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (!offline) saveUiRef.current.beginRequest();
    const result = await queueDraftSave(draftId, snapshot, { slug });
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
    dispatch({ type: "hydrate", state: next });
    resolvingConflict.current = false;
    saveUiRef.current.succeed();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (state.step !== 3) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.shiftKey) {
        return;
      }
      if (isTypingInField(event.target)) return;
      if (!canUndo(state)) return;
      event.preventDefault();
      dispatch({ type: "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const goClose = () => {
    void (async () => {
      if (!isPublishedEdit && draftId) {
        const snapshot = stateRef.current;
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
      description: `${describeDraftLoss(state)} Продолжить?`,
      confirmLabel: "Начать заново",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (!ok) return;
    skipAutosave.current = true;
    dispatch({ type: "hydrate", state: emptyWizard() });
    if (draftId) await putLocalDraft(emptyLocalDraft(draftId, undefined, slug));
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

  const current = currentStreet(state);
  const stepLabel =
    state.step === 3
      ? `Шаг 3 из 4 · ${STREET_TITLE[
          state.pickingBoard ? (nextStreet(current.street) ?? "flop") : current.street
        ].toLowerCase()}`
      : `Шаг ${state.step} из 4`;
  const streetBlocked =
    state.step === 3 &&
    (state.pickingBoard || isEditingAllBoard(state)
      ? boardPickerIncomplete(state)
      : !streetClosed(state));
  const resultBlocked = state.step === 4 && resolveWinners(state).length === 0;
  const stackErrorNames = invalidStartingStackNames(state);
  const stackErrorHint = startingStackHint(stackErrorNames);
  const step1Blocked =
    state.step === 1 &&
    (!step1Schema.safeParse({
      occupied: state.occupied,
      heroSeat: state.heroSeat,
      tableSize: state.tableSize,
      buttonSeat: state.buttonSeat,
      blinds: state.blinds,
    }).success ||
      stackErrorNames.length > 0);

  const requestStep = async (target: WizardStep) => {
    if (target === state.step) return;
    if (target > state.furthestStep) return;
    if (state.step === 1 && target > 1 && step1Blocked) return;
    if (target < state.step && (target === 1 || target === 2)) {
      const count = streetActionCount(state);
      if (count > 0) {
        const kind = target === 1 ? "состава" : "карт";
        const ok = await confirm({
          title: target === 1 ? "Изменить состав игроков?" : "Изменить карты?",
          description: `Изменение ${kind} удалит введённые действия (${count} шт.). Продолжить?`,
          confirmLabel: "Продолжить",
          cancelLabel: "Отмена",
          variant: "danger",
        });
        if (!ok) return;
      }
    }
    dispatch({ type: "setStep", step: target });
  };

  const footerBack = () => {
    if (state.step === 3) {
      if (state.pickingBoard || state.editingBoard || currentStreetIndex(state) > 0) {
        dispatch({ type: "goBack" });
        return;
      }
      void requestStep(2);
      return;
    }
    void requestStep((state.step - 1) as 1 | 2 | 3);
  };

  const undoButton =
    state.step === 3 ? (
      <button
        type="button"
        data-testid="wizard-header-undo"
        aria-label="Отменить последнее действие"
        title="Отменить последнее действие"
        disabled={!canUndo(state)}
        className={cn(
          "border-line-gold text-gold inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border bg-transparent font-extrabold whitespace-nowrap disabled:opacity-40",
          "min-[420px]:w-auto min-[420px]:px-2.5 min-[420px]:text-[13px]",
        )}
        onClick={() => dispatch({ type: "undo" })}
      >
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          aria-hidden
          data-testid="wizard-header-undo-icon"
        >
          <path d="M3 8h11a6 6 0 0 1 0 12H8" />
          <path d="M7 4L3 8l4 4" />
        </svg>
        <span data-testid="wizard-header-undo-label" className="hidden min-[420px]:inline">
          Отменить
        </span>
      </button>
    ) : null;

  return (
    <div
      className="min-h-[100dvh] min-w-0 overflow-x-clip pb-[calc(76px+env(safe-area-inset-bottom,0px))] data-[blocked=1]:pb-[calc(96px+env(safe-area-inset-bottom,0px))]"
      data-testid="hand-wizard"
      data-blocked={resultBlocked ? "1" : "0"}
    >
      <StickyHeader
        backKind="close"
        backAriaLabel="Закрыть"
        onBack={goClose}
        title={stepLabel}
        titleInExpanded={false}
        actions={
          undoButton || !isPublishedEdit ? (
            <>
              {undoButton}
              {!isPublishedEdit ? (
                <DraftHeaderMenu
                  lastSavedAt={saveUi.lastSavedAt}
                  onRestart={() => void requestRestart()}
                  moreTestId="wizard-header-more"
                  restartTestId="wizard-header-restart"
                />
              ) : null}
            </>
          ) : undefined
        }
        expandedContent={
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              data-testid="wizard-header-logo"
              className="hidden shrink-0 items-center gap-1.5 text-[16px] font-extrabold tracking-tight min-[380px]:inline-flex"
            >
              Day
              <i className="bg-gold-grad text-ink-ongold inline-flex h-[23px] w-[23px] -rotate-[4deg] items-center justify-center rounded-[7px] text-[13px] not-italic">
                2
              </i>
            </span>
            <span className="bg-line-strong hidden h-5 w-px shrink-0 min-[380px]:inline" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold">
                {isPublishedEdit ? "Правка раздачи" : "Новая раздача"}
              </div>
              <div className="text-ink-3 truncate text-[10.5px]">{stepLabel}</div>
            </div>
          </div>
        }
        footer={
          <>
            <WizardStepNav
              current={state.step}
              furthest={state.furthestStep}
              onSelect={(step) => void requestStep(step)}
            />
            {state.step === 3 ? <StreetTabs state={state} dispatch={dispatch} /> : null}
            {state.step === 3 || state.step === 4 ? (
              <WizardBoardStrip state={state} dispatch={dispatch} />
            ) : null}
          </>
        }
      />
      <DraftSaveBanner
        status={saveUi.visible}
        onRetry={() => void flushDraft()}
        placement="sticky"
      />

      <div className="min-w-0 pb-3">
        {state.step === 1 ? <StepTable state={state} dispatch={dispatch} /> : null}
        {state.step === 2 ? <StepCards state={state} dispatch={dispatch} /> : null}
        {state.step === 3 ? (
          <StreetActionStep state={state} dispatch={dispatch} showUndo={false} />
        ) : null}
        {state.step === 4 ? <ResultStep state={state} dispatch={dispatch} /> : null}
      </div>

      {state.step === 1 && stackErrorHint ? (
        <p className="text-danger px-[13px] pb-2 text-[12.5px]" data-testid="stack-errors">
          {stackErrorHint}
        </p>
      ) : null}
      {error ? <p className="text-danger px-[13px] pb-2 text-[12.5px]">{error}</p> : null}

      <footer className="border-line bg-surface fixed bottom-0 left-1/2 z-20 flex w-full max-w-[420px] min-w-0 -translate-x-1/2 flex-col gap-1.5 border-t px-[13px] pt-[11px] pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
        <div className="flex min-w-0 gap-2.5">
          {state.step > 1 ? (
            <button
              type="button"
              data-testid="wizard-back"
              className="border-line-strong text-ink-2 h-12 rounded-md border px-[18px] text-[15px] font-extrabold"
              onClick={footerBack}
            >
              Назад
            </button>
          ) : null}
          <button
            type="button"
            data-testid="wizard-next"
            className="bg-gold-grad text-ink-ongold flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md text-[15px] font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] disabled:opacity-50"
            disabled={
              publish.isPending ||
              update.isPending ||
              step1Blocked ||
              streetBlocked ||
              resultBlocked
            }
            title={
              state.step === 1
                ? (stackErrorHint ?? undefined)
                : state.step === 4 && resultBlocked
                  ? "Укажите, кто забрал банк"
                  : undefined
            }
            onClick={() => {
              setError(null);
              if (state.step === 1) {
                const parsed = step1Schema.safeParse({
                  occupied: state.occupied,
                  heroSeat: state.heroSeat,
                  tableSize: state.tableSize,
                  buttonSeat: state.buttonSeat,
                  blinds: state.blinds,
                });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Заполните стол");
                  return;
                }
                if (stackErrorHint) {
                  setError(stackErrorHint);
                  return;
                }
                dispatch({ type: "setStep", step: 2 });
                return;
              }
              if (state.step === 2) {
                const parsed = step2Schema.safeParse({ heroCards: state.heroCards });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Выберите карты");
                  return;
                }
                dispatch({ type: "setStep", step: 3 });
                return;
              }
              if (state.step === 3) {
                if (state.pickingBoard) {
                  const nxt = nextStreet(currentStreet(state).street);
                  if (!nxt || state.boardDraft.length !== boardSizeFor(nxt)) {
                    setError("Выберите карты борда");
                    return;
                  }
                  dispatch({ type: "confirmBoard" });
                  return;
                }
                if (isEditingAllBoard(state)) {
                  if (boardPickerIncomplete(state)) {
                    setError("Выберите карты борда");
                    return;
                  }
                  dispatch({ type: "commitBoardEdit" });
                  return;
                }
                if (!streetClosed(state)) {
                  setError("Сначала завершите ставки на этой улице");
                  return;
                }
                dispatch({ type: "advanceStreet" });
                return;
              }
              void save();
            }}
          >
            {state.step === 1
              ? "Дальше · ваши карты"
              : state.step === 2
                ? "Дальше · префлоп"
                : state.step === 3
                  ? footerStep3(state)
                  : "Сохранить раздачу"}
          </button>
        </div>
        {state.step === 4 && resultBlocked ? (
          <p className="text-gold text-center text-[12px] font-bold" data-testid="result-errors">
            Укажите, кто забрал банк
          </p>
        ) : null}
      </footer>
    </div>
  );
}

function footerStep3(state: WizardState): string {
  if (state.pickingBoard || isEditingAllBoard(state)) return "Готово";
  const current = currentStreet(state).street;
  if (!streetClosed(state)) return "Дальше";
  const nxt = nextStreet(current);
  if (!nxt) return "Дальше · итог";
  return `Дальше · ${STREET_TITLE[nxt].toLowerCase()}`;
}

function tableHeading(tableSize: number, occupiedCount: number): string {
  const seats = `${tableSize} ${pluralRu(tableSize, "место", "места", "мест")}`;
  if (occupiedCount === tableSize) return `Стол · ${seats}`;
  return `Стол · ${seats} · ${occupiedCount} ${pluralRu(occupiedCount, "игрок", "игрока", "игроков")}`;
}

function StepTable({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) {
  const positions = assignPositions(state.tableSize, state.buttonSeat, state.occupied);
  const stackDisplay = useStackDisplay();
  const bbOk = canUseBb(state.blinds.bb);
  const stackMode = bbOk ? stackDisplay.mode : "chips";
  const [toast, setToast] = useState<string | null>(null);
  const [editingSeat, setEditingSeat] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [holdingSeat, setHoldingSeat] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const blindField = (key: "sb" | "bb" | "ante") => {
    const blindError =
      key === "sb" && state.blinds.sb <= 0
        ? "Укажите SB"
        : key === "bb" && state.blinds.bb <= 0
          ? "Укажите BB"
          : undefined;
    return (
      <label
        key={key}
        className={cn("flex min-w-0 flex-1 flex-col gap-1", key === "ante" && "basis-[8rem]")}
      >
        <span className="text-ink-2 text-[12px] font-semibold">
          {key === "ante" ? "Анте" : key.toUpperCase()}
        </span>
        <LadderNumberStepper
          min={key === "ante" ? 0 : 25}
          value={
            key !== "ante" && state.blinds[key] === 0 ? "" : formatChipInput(state.blinds[key])
          }
          size={1}
          frameClassName="border-line-strong bg-surface-2 num h-[46px] w-full min-w-0 rounded-md border"
          className="text-[16px]"
          aria-label={key === "ante" ? "Анте" : key.toUpperCase()}
          error={blindError}
          onChange={(raw) => {
            const parsed = parseStepperInt(raw);
            dispatch({
              type: "setBlinds",
              blinds: {
                [key]:
                  parsed == null || parsed < 0 ? (key === "ante" || key === "bb" ? 0 : 1) : parsed,
              },
            });
          }}
        />
      </label>
    );
  };

  return (
    <>
      <div className="px-[13px] pt-3.5">
        <div className="text-[19px] font-extrabold tracking-tight">Стол и игроки</div>
        <div className="text-ink-2 mt-0.5 text-[12.5px]">
          Выберите размер стола и снимите лишние места
        </div>
      </div>
      <section className="border-line-gold mx-[13px] mt-3 overflow-visible rounded-[18px] border bg-[linear-gradient(140deg,rgba(217,179,106,.07),var(--surface,#141311))] p-[13px]">
        <div className="text-gold mb-2 text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
          {tableHeading(state.tableSize, state.occupied.length)}
        </div>
        <MiniTable
          tableSize={state.tableSize}
          occupied={state.occupied}
          heroSeat={state.heroSeat}
          buttonSeat={state.buttonSeat}
          onToggle={(seat) => {
            if (holdingSeat != null) {
              if (holdingSeat !== seat) dispatch({ type: "moveSeat", from: holdingSeat, to: seat });
              setHoldingSeat(null);
              return;
            }
            const hint = requiredSeatHint(state.tableSize, state.buttonSeat, state.heroSeat, seat);
            if (hint) {
              setToast(hint);
              return;
            }
            const { sb } = blindSeats(state.tableSize, state.buttonSeat);
            const unmarkingSb =
              state.tableSize !== 2 && seat === sb && state.occupied.includes(seat);
            dispatch({ type: "toggleSeat", seat });
            if (unmarkingSb) setToast("Малого блайнда нет (dead button)");
          }}
          onHero={(seat) => dispatch({ type: "setHero", seat })}
        />
        <label className="mt-3 flex min-w-0 flex-col gap-1">
          <span className="text-ink-2 text-[12px] font-semibold">Мест за столом</span>
          <select
            className="border-line-strong bg-surface-2 h-[46px] w-full min-w-0 rounded-md border px-3 text-[16px]"
            aria-label="Мест за столом"
            data-testid="table-size-select"
            value={state.tableSize}
            onChange={(event) => {
              const size = Number(event.target.value);
              if (isTableSize(size)) dispatch({ type: "setTableSize", size });
            }}
          >
            {TABLE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} макс
              </option>
            ))}
          </select>
        </label>
        <p className="text-ink-3 mt-2 text-[11.5px]">
          Большой блайнд обязателен. Малый можно снять — dead button, его фишки в банк не идут
        </p>
        {holdingSeat != null ? (
          <div
            role="status"
            data-testid="seat-move-hint"
            className="border-line-gold bg-gold-soft text-gold mt-2 rounded-md border px-3 py-2 text-center text-[12.5px] font-semibold"
          >
            Тапните место, куда пересадить
          </div>
        ) : null}
        {toast ? (
          <div
            role="status"
            data-testid="seat-toast"
            className="border-line-strong bg-surface-2 text-ink mt-2 rounded-md border px-3 py-2 text-center text-[12.5px] font-semibold"
          >
            {toast}
          </div>
        ) : null}
      </section>

      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <div className="text-gold mb-2 text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
          Блайнды и анте
        </div>
        <div className="flex min-w-0 flex-col gap-2" data-testid="blinds-row">
          <div className="flex min-w-0 gap-2">
            {(["sb", "bb"] as const).map((key) => blindField(key))}
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            {blindField("ante")}
            <AnteModeToggle
              mode={wizardAnteMode(state.blinds)}
              onChange={(ante_mode) => dispatch({ type: "setBlinds", blinds: { ante_mode } })}
            />
          </div>
        </div>
        <p className="text-ink-3 mt-2 text-[11.5px]" data-testid="ante-mode-hint">
          {state.blinds.ante === 0
            ? "Анте нет — в стартовый банк не идёт"
            : wizardAnteMode(state.blinds) === "occupied"
              ? "Анте платит каждый сидящий"
              : "Одно анте платит большой блайнд"}
        </p>
      </section>

      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-gold text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
            Стеки участников
          </div>
          <StackDisplayToggle mode={stackMode} disabled={!bbOk} onChange={stackDisplay.setMode} />
        </div>
        {!bbOk ? (
          <p className="text-ink-3 mb-2 text-[11.5px]" data-testid="bb-unit-hint">
            Укажите размер BB
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          {[...state.occupied]
            .sort((a, b) => a - b)
            .map((seat) => {
              const chips = parseChipInput(state.stacks[seat] ?? "");
              const stackInvalid = chips != null && chips <= 0;
              const name = displaySeatName(seat, state.heroSeat, state.names[seat]);
              const shown =
                chips != null
                  ? formatStackAmount(chips, stackMode, state.blinds.bb)
                  : stackPlaceholder(stackMode, state.blinds.bb);
              const open = (focus: boolean) => {
                setFocusName(focus);
                setEditingSeat(seat);
              };
              return (
                <div
                  key={seat}
                  data-testid={`seat-row-${seat}`}
                  className={cn(
                    "border-line-strong bg-surface-2 flex min-w-0 items-center gap-2.5 rounded-md border px-[11px] py-2",
                    seat === state.heroSeat && "border-line-gold bg-gold-soft",
                    stackInvalid && "border-danger",
                  )}
                  onClick={() => open(false)}
                >
                  <span className="text-gold w-9 shrink-0 text-[10.5px] font-extrabold">
                    {positions.get(seat)}
                  </span>
                  {seat === state.heroSeat ? (
                    <span
                      className="min-w-0 flex-1 truncate text-left text-[13.5px] font-bold"
                      data-testid={`seat-name-${seat}`}
                    >
                      {name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`seat-name-${seat}`}
                      aria-label={`Переименовать: ${name}`}
                      className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-[13.5px] font-bold"
                      onClick={(event) => {
                        event.stopPropagation();
                        open(true);
                      }}
                    >
                      {name}
                    </button>
                  )}
                  <span
                    className={cn(
                      "num min-w-0 flex-1 truncate text-right text-[13.5px] font-semibold",
                      chips == null && "text-ink-3",
                      stackInvalid && "text-danger",
                    )}
                  >
                    {shown}
                    {stackMode === "bb" && bbOk && chips == null ? " BB" : ""}
                  </span>
                </div>
              );
            })}
        </div>
        <p className="text-ink-3 mt-2 text-[11.5px]">
          Не помните стеки — оставьте пусто, поставим 100 BB
        </p>
      </section>

      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <div className="text-gold mb-2 text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
          Турнир
        </div>
        <HandLinkSelect
          labeled={false}
          eventId={state.eventId}
          seriesId={state.seriesId}
          liveSessionId={state.liveSessionId}
          onChange={(next) => dispatch({ type: "setLink", ...next })}
        />
      </section>
      {editingSeat != null ? (
        <SeatEditSheet
          state={state}
          seat={editingSeat}
          stackMode={stackMode}
          actionCount={streetActionCount(state)}
          focusName={focusName}
          overlay="dock"
          onClose={() => {
            setEditingSeat(null);
            setFocusName(false);
          }}
          onSetName={(seat, name) => dispatch({ type: "setSeatName", seat, name })}
          onSetStack={(seat, value) => dispatch({ type: "setStack", seat, value })}
          onRemove={(seat) => dispatch({ type: "toggleSeat", seat })}
          onMoveHero={(seat) => dispatch({ type: "moveSeat", from: state.heroSeat, to: seat })}
          onStackModeChange={stackDisplay.setMode}
          onStartMove={(seat) => {
            setHoldingSeat(seat);
            setEditingSeat(null);
            setFocusName(false);
            setToast("Тапните место, куда пересадить");
          }}
        />
      ) : null}
    </>
  );
}

function StepCards({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) {
  const used = usedCards(state);
  return (
    <>
      <div className="px-[13px] pt-3.5">
        <div className="text-[19px] font-extrabold tracking-tight">Ваши карты</div>
        <div className="text-ink-2 mt-0.5 text-[12.5px]">Тапните две карты из колоды</div>
      </div>
      <section className="border-line-gold mx-[13px] mt-3 rounded-[18px] border bg-[linear-gradient(140deg,rgba(217,179,106,.07),var(--surface,#141311))] p-[13px]">
        <div className="border-line-gold bg-surface-2 mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5">
          {state.heroCards[0] ? (
            <button
              type="button"
              data-testid="hero-card-0"
              aria-label={state.heroCards[0]}
              onClick={() => dispatch({ type: "toggleHeroCard", card: state.heroCards[0] ?? "" })}
            >
              <PlayingCard card={state.heroCards[0]} size="sm" />
            </button>
          ) : (
            <PlayingCard slot size="sm" />
          )}
          {state.heroCards[1] ? (
            <button
              type="button"
              data-testid="hero-card-1"
              aria-label={state.heroCards[1]}
              onClick={() => dispatch({ type: "toggleHeroCard", card: state.heroCards[1] ?? "" })}
            >
              <PlayingCard card={state.heroCards[1]} size="sm" />
            </button>
          ) : (
            <PlayingCard slot size="sm" />
          )}
          <span className="text-ink-2 flex-1 text-[12.5px]">
            Ваша рука
            {state.heroCards.length === 2 ? (
              <>
                {" · "}
                <b className="text-gold font-extrabold">{describeHole(state.heroCards)}</b>
              </>
            ) : null}
          </span>
          {state.heroCards.length > 0 ? (
            <button
              type="button"
              className="text-ink-3"
              aria-label="Сбросить"
              onClick={() => dispatch({ type: "clearHeroCards" })}
            >
              <svg className={iconClass} viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>
        <CardDeck
          selected={state.heroCards}
          used={used}
          onToggle={(card) => dispatch({ type: "toggleHeroCard", card })}
        />
      </section>
    </>
  );
}
