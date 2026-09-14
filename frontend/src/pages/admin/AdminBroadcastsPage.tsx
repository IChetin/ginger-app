import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { PlayerKind } from "@/api/types/chips";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAdminPlayers } from "@/features/admin/chips/hooks";
import type { BroadcastSegment, SegmentKind } from "@/features/admin/crm/crmApi";
import { useBroadcasts, usePreviewBroadcast, useSendBroadcast } from "@/features/admin/crm/hooks";
import { isAdminUser, useMe } from "@/features/admin/hooks";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

const inputClass =
  "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px]";

const LINKS: { value: string; label: string }[] = [
  { value: "/", label: "Главная с лентой" },
  { value: "/tournaments", label: "Расписание" },
  { value: "/chips", label: "Фишки" },
  { value: "/clubs", label: "Клубы" },
];

type Choice = "all" | "sleeping" | "tag" | "credit" | "deposit" | "player";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "all", label: "Все активные" },
  { value: "sleeping", label: "Спящие" },
  { value: "tag", label: "По тегу" },
  { value: "credit", label: "Кредитные" },
  { value: "deposit", label: "Депозитные" },
];

function toSegment(choice: Choice, tag: string, playerId: string | null): BroadcastSegment {
  const kinds: Record<Choice, SegmentKind> = {
    all: "all",
    sleeping: "sleeping",
    tag: "tag",
    credit: "player_kind",
    deposit: "player_kind",
    player: "players",
  };
  return {
    kind: kinds[choice],
    tag: choice === "tag" ? tag : null,
    player_kind: choice === "credit" || choice === "deposit" ? (choice as PlayerKind) : null,
    player_ids: choice === "player" && playerId ? [playerId] : [],
  };
}

function describeSegment(segment: BroadcastSegment): string {
  switch (segment.kind) {
    case "all":
      return "все активные";
    case "sleeping":
      return "спящие";
    case "tag":
      return `тег «${segment.tag}»`;
    case "player_kind":
      return segment.player_kind === "deposit" ? "депозитные" : "кредитные";
    case "players":
      return `выбранные: ${segment.player_ids?.length ?? 0}`;
  }
}

/** Ручная рассылка (ТЗ §4.2б): сегмент из CRM, текст пуша, куда ведёт, журнал отправленного. */
export function AdminBroadcastsPage() {
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const canSend = isAdminUser(me);
  const players = useAdminPlayers();
  const preview = usePreviewBroadcast();
  const send = useSendBroadcast();
  const history = useBroadcasts(canSend);
  const confirm = useConfirm();

  const playerId = params.get("player");
  const playerNick = params.get("nick");
  const [choice, setChoice] = useState<Choice>(
    playerId ? "player" : ((params.get("segment") as Choice | null) ?? "all"),
  );
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [sentNote, setSentNote] = useState<string | null>(null);

  const knownTags = useMemo(() => {
    const tags = new Set<string>();
    for (const player of players.data ?? []) for (const item of player.tags) tags.add(item);
    return [...tags].sort((a, b) => a.localeCompare(b, "ru"));
  }, [players.data]);

  const segment = toSegment(choice, tag, playerId);
  const segmentKey = JSON.stringify(segment);
  const segmentReady = choice !== "tag" || tag.trim().length > 0;

  const { mutate: runPreview } = preview;
  useEffect(() => {
    if (!canSend || !segmentReady) return;
    runPreview(JSON.parse(segmentKey) as BroadcastSegment);
  }, [canSend, segmentKey, segmentReady, runPreview]);

  if (!canSend) {
    return (
      <div className="mx-auto max-w-[720px] px-3 py-6">
        <h1 className="text-[20px] font-extrabold">Рассылки</h1>
        <p className="text-ink-2 mt-1 text-[13px]">Рассылки отправляет администратор.</p>
      </div>
    );
  }

  const counts = preview.data;
  const valid = segmentReady && title.trim() && body.trim() && (counts?.with_push ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-broadcasts">
      <h1 className="text-[20px] font-extrabold">Рассылки</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Пуш уходит тем, у кого включены уведомления. Каждая рассылка остаётся в журнале.
      </p>

      <form
        className="border-line bg-surface mt-3 flex flex-col gap-2 rounded-lg border p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || !counts) return;
          const ok = await confirm({
            title: `Отправить ${counts.with_push} ${pluralRu(counts.with_push, "игроку", "игрокам", "игрокам")}?`,
            description: `«${title.trim()}» — ${body.trim()}`,
            confirmLabel: "Отправить",
            cancelLabel: "Отмена",
          });
          if (!ok) return;
          send.mutate(
            { title: title.trim(), body: body.trim(), url, segment },
            {
              onSuccess: (result) => {
                setSentNote(`Отправлено: ${result.pushes} из ${result.recipients}`);
                setTitle("");
                setBody("");
              },
            },
          );
        }}
      >
        <div>
          <p className="text-ink-3 mb-1 text-[11px] font-bold tracking-[0.08em] uppercase">Кому</p>
          <div className="flex flex-wrap gap-1.5">
            {(playerId
              ? [{ value: "player" as Choice, label: playerNick ?? "Выбранный игрок" }, ...CHOICES]
              : CHOICES
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={choice === option.value}
                onClick={() => setChoice(option.value)}
                className={cn(
                  "h-8 rounded-full border px-3 text-[12.5px] font-bold",
                  choice === option.value
                    ? "border-line-gold bg-gold-soft text-gold"
                    : "border-line bg-surface-2 text-ink-2",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {choice === "tag" ? (
            <div className="mt-1.5">
              <input
                aria-label="Тег"
                list="broadcast-tags"
                placeholder="Тег из карточек игроков"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className={inputClass}
              />
              <datalist id="broadcast-tags">
                {knownTags.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
          ) : null}
          <p className="text-ink-2 mt-1.5 text-[12.5px]" data-testid="broadcast-preview">
            {!segmentReady
              ? "Укажите тег"
              : counts
                ? `В сегменте ${counts.recipients} ${pluralRu(counts.recipients, "игрок", "игрока", "игроков")}, пуш получат ${counts.with_push}`
                : "Считаем…"}
          </p>
        </div>

        <input
          aria-label="Заголовок пуша"
          placeholder="Заголовок: «Фриролл для своих сегодня в 20:00»"
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
        />
        <textarea
          aria-label="Текст пуша"
          placeholder="Коротко: что, когда, что сделать"
          value={body}
          maxLength={300}
          rows={3}
          onChange={(event) => setBody(event.target.value)}
          className="border-line-strong bg-surface-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
        />
        <label className="text-ink-3 text-[11px] font-semibold">
          По тапу откроется
          <select
            aria-label="Куда ведёт пуш"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className={cn(inputClass, "mt-0.5")}
          >
            {LINKS.map((link) => (
              <option key={link.value} value={link.value}>
                {link.label}
              </option>
            ))}
          </select>
        </label>

        {title.trim() || body.trim() ? (
          <div
            aria-hidden="true"
            className="border-line-strong bg-surface-2 flex gap-2.5 rounded-[14px] border p-2.5"
          >
            <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-[9px]" />
            <div className="min-w-0">
              <p className="text-ink truncate text-[13px] font-bold">{title.trim() || "Ginger"}</p>
              <p className="text-ink-2 line-clamp-2 text-[12.5px]">{body.trim()}</p>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!valid || send.isPending}
          className="bg-gold-grad text-ink-ongold h-11 rounded-md text-[15px] font-bold disabled:opacity-40"
        >
          {send.isPending ? "Отправляем…" : "Отправить"}
        </button>
        {sentNote ? (
          <p role="status" className="text-live text-[13px] font-semibold">
            {sentNote}
          </p>
        ) : null}
        {send.isError ? (
          <p role="alert" className="text-danger text-[12.5px] font-semibold">
            {send.error instanceof ApiError ? send.error.message : "Не удалось отправить"}
          </p>
        ) : null}
      </form>

      <h2 className="text-ink-3 mt-4 mb-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
        Журнал
      </h2>
      <div className="flex flex-col gap-1.5">
        {history.data?.map((item) => (
          <div
            key={item.id}
            className="border-line bg-surface rounded-md border px-3 py-2"
            data-testid="broadcast-item"
          >
            <p className="text-ink text-[14px] font-bold">{item.title}</p>
            <p className="text-ink-2 text-[12.5px]">{item.body}</p>
            <p className="text-ink-3 mt-0.5 text-[11.5px]">
              {new Date(item.created_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} ·{" "}
              {describeSegment(item.segment)} · пуш {item.pushes} из {item.recipients}
              {item.author_nickname ? ` · ${item.author_nickname}` : ""}
            </p>
          </div>
        ))}
        {history.isSuccess && history.data.length === 0 ? (
          <p className="text-ink-3 text-[13px]">Рассылок ещё не было</p>
        ) : null}
      </div>
    </div>
  );
}
