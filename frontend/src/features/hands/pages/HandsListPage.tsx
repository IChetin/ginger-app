import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Link2 } from "lucide-react";

import type { HandListItem, HandListStatus } from "@/api/types/hands";
import { HeaderProfileButton } from "@/components/layout/HeaderProfileButton";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { CopyToast } from "@/components/ui/CopyToast";
import { useCopyToast } from "@/components/ui/useCopyToast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { PortalMenu } from "@/components/ui/PortalMenu";
import { DemoBanner } from "@/demo/DemoBanner";
import { useDemo } from "@/demo/DemoContext";
import { DEMO_HANDS_LOGIN } from "@/demo/hands";
import { AuthGate } from "@/features/auth/AuthGate";
import { useMe } from "@/features/auth/hooks";
import { buildLoginLocation } from "@/features/auth/lib/redirect";
import { PlayingCard, formatChipProfit } from "@/features/hands/components/PlayingCard";
import { useDeleteHand, useHandEvents, useHandsList, useUpdateHand } from "@/features/hands/hooks";
import { DRAFT_LIMIT, formatDraftUpdatedAt } from "@/features/hands/lib/draftIdb";
import { newHandLocation } from "@/features/hands/lib/startNewHand";
import { STREET_TITLE } from "@/features/hands/lib/handSchema";
import { DetailSkeleton, EmptyState, ErrorState } from "@/features/schedule/components/QueryState";
import { copyText, shareOrCopyUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

function handUrl(slug: string): string {
  return `${window.location.origin}/hand/${slug}`;
}

async function shareHand(item: HandListItem) {
  if (!item.slug) return "copied" as const;
  return shareOrCopyUrl({
    title: item.event?.name ?? item.title ?? "Раздача",
    url: handUrl(item.slug),
  });
}

function formatDraftCardSummary(item: HandListItem): string {
  const parts = [`Шаг ${item.current_step ?? 1}`];
  if (item.current_step === 3 && item.current_street) {
    parts.push(STREET_TITLE[item.current_street].toLowerCase());
  }
  const when = formatDraftUpdatedAt(item.updated_at);
  if (when) parts.push(when);
  return parts.join(" · ");
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(iso));
}

export function HandsListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { isPending: authPending } = useMe();
  const { isDemo, requestLogin } = useDemo();
  const [q, setQ] = useState("");
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState<HandListStatus>("all");
  const { message: toast, showCopied } = useCopyToast();
  const list = useHandsList({
    q: q.trim() || undefined,
    event_id: eventId || undefined,
    status,
    limit: 50,
  });
  const draftCount = useHandsList({ status: "draft", limit: 1 });
  const events = useHandEvents();
  const remove = useDeleteHand();

  const items = list.data?.items ?? [];
  const atDraftLimit = !isDemo && (draftCount.data?.total ?? 0) >= DRAFT_LIMIT;

  const blockWrite = () => {
    requestLogin(DEMO_HANDS_LOGIN);
  };

  if (authPending) {
    return (
      <div className="relative min-h-screen min-w-0 overflow-x-clip pb-24">
        <StickyHeader
          title="Раздачи"
          showBack={false}
          compactible={false}
          actions={<HeaderProfileButton compact />}
        />
        <div className="px-4 pt-4">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen min-w-0 overflow-x-clip pb-24"
      data-testid="hands-list"
      data-demo={isDemo ? "true" : undefined}
    >
      <StickyHeader
        title="Раздачи"
        showBack={false}
        compactible={false}
        actions={<HeaderProfileButton compact />}
      />

      {isDemo ? <DemoBanner /> : null}

      <div className="flex min-w-0 gap-2 px-4 pt-3">
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Поиск по заметке"
          className="border-line-strong bg-surface-2 h-11 min-w-0 flex-1 rounded-md border px-3 text-[14px]"
        />
        <select
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          className="border-line-strong bg-surface-2 h-11 w-[42%] max-w-[42%] min-w-0 rounded-md border px-2 text-[13px]"
          aria-label="Турнир"
        >
          <option value="">Все турниры</option>
          {(events.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        aria-label="Фильтр раздач"
        className="bg-surface-2 border-line mx-4 mt-3 inline-flex items-center gap-0.5 rounded-md border p-[3px]"
        data-testid="hands-status-filter"
      >
        {(
          [
            ["all", "Все"],
            ["published", "Опубликованные"],
            ["draft", "Черновики"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            data-testid={`hands-filter-${value}`}
            className={cn(
              "min-h-11 rounded-[8px] px-2.5 text-[13px] font-bold",
              status === value ? "bg-gold-grad text-ink-ongold" : "text-ink-2",
            )}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="px-4 pt-4">
          <DetailSkeleton />
        </div>
      ) : null}

      {list.isError ? (
        <div className="px-4 pt-4">
          <ErrorState message="Не удалось загрузить раздачи" onRetry={() => void list.refetch()} />
        </div>
      ) : null}

      {list.data && items.length === 0 ? (
        <div className="px-4 pt-6">
          <EmptyState
            title="Пока нет раздач"
            description={
              status === "draft"
                ? "Черновики появятся, когда начнёте ввод"
                : "Разберите руку со стола — реплей и ссылка за минуту"
            }
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 px-4 pt-3">
        {items.map((item) => (
          <HandCard
            key={item.id}
            item={item}
            busy={remove.isPending}
            readOnly={isDemo}
            onOpen={() => navigate(`/hand/${item.slug}`)}
            onEdit={() => {
              if (isDemo) {
                blockWrite();
                return;
              }
              navigate(item.status === "draft" ? `/hand/${item.slug}` : `/hand/${item.slug}/edit`);
            }}
            onCopied={showCopied}
            onShare={async () => {
              if (item.status === "draft" || !item.slug) return;
              const outcome = await shareHand(item);
              if (outcome === "copied") showCopied();
            }}
            onDelete={async () => {
              if (isDemo) {
                blockWrite();
                return;
              }
              const ok = await confirm({
                title: item.status === "draft" ? "Удалить черновик?" : "Удалить раздачу?",
                description:
                  item.status === "draft"
                    ? "Введённые данные будут удалены."
                    : "Реплей и публичная ссылка пропадут.",
                confirmLabel: "Удалить",
                variant: "danger",
              });
              if (ok) await remove.mutateAsync(item.slug ?? item.id);
            }}
          />
        ))}
      </div>

      {isDemo ? (
        <AuthGate
          icon={
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <rect x="5" y="4" width="9" height="13" rx="1.5" />
              <rect x="10" y="7" width="9" height="13" rx="1.5" />
            </svg>
          }
          title="Ваши раздачи и разборы"
          description="Сохраняйте руки со стола — реплей, заметки и ссылка за минуту."
          returnTo="/hands"
        />
      ) : null}

      <button
        type="button"
        aria-label="Новая раздача"
        className="bg-gold-grad text-ink-ongold shadow-sheen-glow-lg fixed right-[max(16px,calc(50%-194px))] bottom-24 z-31 flex h-14 w-14 items-center justify-center rounded-lg text-[28px] font-extrabold"
        onClick={() => {
          if (isDemo) {
            const login = buildLoginLocation("/hand/new");
            navigate(login.pathname, { state: login.state });
            return;
          }
          if (atDraftLimit) {
            void confirm({
              title: "Слишком много черновиков",
              description: "Не больше 20 черновиков. Удалите старые в списке",
              confirmLabel: "Понятно",
              cancelLabel: "Закрыть",
            });
            return;
          }
          const loc = newHandLocation();
          navigate(loc.pathname, { state: loc.state });
        }}
      >
        +
      </button>
      <CopyToast message={toast} />
    </div>
  );
}

function FitBoard({ cards }: { cards: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(cards.length);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width <= 0 || cards.length === 0) {
        setLimit(cards.length);
        return;
      }
      const probe = el.querySelector("[data-card]") as HTMLElement | null;
      const cardW = probe?.getBoundingClientRect().width || 26;
      const gap = 2;
      const plusW = 28;
      const full = cards.length * cardW + Math.max(0, cards.length - 1) * gap;
      if (full <= width) {
        setLimit(cards.length);
        return;
      }
      const n = Math.max(1, Math.floor((width - plusW + gap) / (cardW + gap)));
      setLimit(Math.min(cards.length - 1, n));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length]);

  if (cards.length === 0) {
    return <span className="text-ink-3 text-[12px]">префлоп</span>;
  }

  const shown = cards.slice(0, limit);
  const extra = cards.length - shown.length;
  return (
    <div
      ref={ref}
      data-testid="hand-card-board"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
    >
      {shown.map((card) => (
        <span key={card} data-card>
          <PlayingCard card={card} size="sm" />
        </span>
      ))}
      {extra > 0 ? (
        <span data-testid="board-more" className="text-ink-3 shrink-0 text-[11px] font-extrabold">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function HandCard({
  item,
  busy,
  readOnly = false,
  onOpen,
  onEdit,
  onShare,
  onCopied,
  onDelete,
}: {
  item: HandListItem;
  busy: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onShare: () => void | Promise<void>;
  onCopied: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [copied, setCopied] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const isDraft = item.status === "draft";
  const update = useUpdateHand(item.slug ?? "");
  const profit = item.preview.hero_profit;
  const board = item.preview.board;
  const closeMenu = useCallback(() => setMenu(false), []);

  const subtitle = useMemo(() => {
    if (isDraft) return formatDraftCardSummary(item);
    const parts = [formatDate(item.created_at)];
    if (item.event) parts.push(item.event.name);
    else if (item.series) parts.push(item.series.name);
    parts.push(`${item.views_count} просм.`);
    return parts.join(" · ");
  }, [isDraft, item]);

  const copyPublicLink = async () => {
    if (!item.slug) return;
    const ok = await copyText(handUrl(item.slug));
    if (!ok) return;
    setCopied(true);
    onCopied();
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article
      className={cn(
        "bg-surface relative rounded-lg border p-3",
        isDraft ? "border-gold border-dashed" : "border-line",
      )}
      data-testid={`hand-card-${item.slug}`}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 text-left"
        onClick={onOpen}
      >
        <div className="flex shrink-0 gap-px">
          {item.preview.hero_cards.map((card) => (
            <PlayingCard key={card} card={card} size="sm" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {isDraft ? (
              <span
                data-testid="hand-draft-badge"
                className="text-gold border-gold shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase"
              >
                Черновик
              </span>
            ) : null}
            <FitBoard cards={board} />
          </div>
          <div className="text-ink-3 mt-1 truncate text-[12px]">{subtitle}</div>
          {item.note ? (
            <div className="text-ink-2 mt-0.5 truncate text-[12.5px]" data-testid="hand-card-note">
              {item.note}
            </div>
          ) : null}
        </div>
        {isDraft ? null : (
          <div
            className={cn(
              "num shrink-0 text-[15px] font-extrabold",
              profit > 0 && "text-live",
              profit < 0 && "text-danger",
            )}
          >
            {formatChipProfit(profit)}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center justify-between">
        {isDraft ? (
          <span className="text-ink-3 text-[11px] font-bold">не опубликована</span>
        ) : item.is_public ? (
          <button
            type="button"
            data-testid="hand-copy-link"
            className="text-gold inline-flex min-h-8 items-center gap-1 text-[11px] font-bold"
            onClick={() => void copyPublicLink()}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                скопировано
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                по ссылке
              </>
            )}
          </button>
        ) : (
          <span className="text-ink-3 text-[11px] font-bold" data-testid="hand-private-label">
            приватная
          </span>
        )}
        <button
          ref={menuBtnRef}
          type="button"
          className="text-ink-3 px-2 py-1 text-[18px] leading-none"
          aria-label="Действия"
          aria-expanded={menu}
          aria-haspopup="menu"
          data-testid="hand-card-menu-btn"
          onClick={() => setMenu((value) => !value)}
        >
          ···
        </button>
      </div>
      <PortalMenu
        open={menu}
        onClose={closeMenu}
        anchorRef={menuBtnRef}
        aria-label="Действия с раздачей"
      >
        {isDraft ? (
          <>
          <button
            type="button"
            role="menuitem"
            className="px-3 py-2 text-left"
            onClick={() => {
              closeMenu();
              onEdit();
            }}
          >
            Продолжить
          </button>
          <button
            type="button"
            role="menuitem"
            className="px-3 py-2 text-left"
            onClick={() => {
                closeMenu();
                if (readOnly) {
                  onEdit();
                  return;
                }
                setNoteDraft(item.note ?? "");
                setNoteOpen(true);
              }}
            >
              Заметка
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-2 text-left"
              onClick={() => {
                closeMenu();
                onOpen();
              }}
            >
              Открыть
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-2 text-left"
              onClick={() => {
                closeMenu();
                void onShare();
              }}
            >
              Поделиться
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-2 text-left"
              onClick={() => {
                closeMenu();
                onEdit();
              }}
            >
              Править
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-2 text-left"
              onClick={() => {
                closeMenu();
                if (readOnly) {
                  onEdit();
                  return;
                }
                setNoteDraft(item.note ?? "");
                setNoteOpen(true);
              }}
            >
              Заметка
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-2 text-left"
              disabled={update.isPending}
              onClick={() => {
                closeMenu();
                if (readOnly) {
                  onEdit();
                  return;
                }
                void update.mutateAsync({ is_public: !item.is_public });
              }}
            >
              {item.is_public ? "Сделать приватной" : "Открыть по ссылке"}
            </button>
          </>
        )}
        <button
          type="button"
          role="menuitem"
          className="text-danger px-3 py-2 text-left"
          disabled={busy}
          onClick={() => {
            closeMenu();
            onDelete();
          }}
        >
          Удалить
        </button>
      </PortalMenu>
      {noteOpen ? (
        <div className="fixed inset-0 z-40" data-testid="hand-note-sheet">
          <button
            type="button"
            aria-label="Закрыть заметку"
            className="absolute inset-0 bg-black/55"
            onClick={() => setNoteOpen(false)}
          />
          <section className="border-line-strong bg-surface absolute inset-x-0 bottom-0 rounded-t-[20px] border-t px-3.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="bg-line-strong mx-auto mb-2 h-1 w-9 rounded-full" />
            <h2 className="mb-2 text-[16px] font-extrabold">Заметка</h2>
            <textarea
              data-testid="hand-note-input"
              value={noteDraft}
              maxLength={2000}
              rows={4}
              className="border-line-strong bg-surface-2 text-ink w-full rounded-xl border px-3 py-2 text-[14px]"
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <button
              type="button"
              data-testid="hand-note-save"
              className="bg-gold-grad text-ink-ongold mt-3 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold"
              disabled={update.isPending}
              onClick={() => {
                void update.mutateAsync({ note: noteDraft.trim() || null }).then(() => {
                  setNoteOpen(false);
                });
              }}
            >
              Сохранить
            </button>
          </section>
        </div>
      ) : null}
    </article>
  );
}
