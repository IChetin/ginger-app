import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fetchAdminClubs } from "@/features/admin/clubs/api";
import {
  createPick,
  deletePick,
  fetchAdminPicks,
  updatePick,
  type EditorPickAdmin,
  type PickKind,
} from "@/features/picks/api";
import { APP_LABELS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const PICKS_KEY = ["admin", "editor-picks"] as const;

const KIND_LABEL: Record<PickKind, string> = { mtt: "MTT", cash: "CASH" };

const fieldClass =
  "border-line-strong bg-surface text-ink h-10 w-full rounded-md border px-3 text-[14px] outline-none focus:border-line-gold";

function PickRow({
  pick,
  busy,
  onToggle,
  onDelete,
}: {
  pick: EditorPickAdmin;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const unmatched = pick.matched_now === 0;
  return (
    <div
      data-testid="editor-pick-row"
      className={cn(
        "border-line bg-surface rounded-md border px-3 py-2",
        !pick.is_active && "opacity-60",
      )}
    >
      <div className="flex items-baseline gap-2">
        <p className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">«{pick.match}»</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
            unmatched ? "bg-warn-soft text-warn" : "bg-gold-soft text-gold",
          )}
        >
          {unmatched
            ? "сейчас не видно"
            : pick.kind === "mtt"
              ? `стартов за неделю: ${pick.matched_now}`
              : `открыто столов: ${pick.matched_now}`}
        </span>
      </div>
      <p className="text-ink-3 text-[12px]">{pick.club_name}</p>
      {pick.note ? <p className="text-ink-2 mt-0.5 text-[12.5px]">{pick.note}</p> : null}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="border-line-strong text-ink h-8 rounded-md border px-3 text-[12.5px] font-bold disabled:opacity-40"
        >
          {pick.is_active ? "Скрыть" : "Показать"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-danger h-8 rounded-md px-3 text-[12.5px] font-bold disabled:opacity-40"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

/**
 * Editor's Pick: турниры и столы, которые Иван поднимает наверх MTT и CASH. Пик — клуб и
 * фрагмент названия: так он переживает перезаливку сеток и появление новых столов.
 */
export function AdminEditorPicksPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const picks = useQuery({ queryKey: PICKS_KEY, queryFn: fetchAdminPicks });
  const clubs = useQuery({ queryKey: ["admin", "clubs"], queryFn: fetchAdminClubs });

  const [kind, setKind] = useState<PickKind>("mtt");
  const [clubId, setClubId] = useState("");
  const [match, setMatch] = useState("");
  const [note, setNote] = useState("");

  const onSaved = (data: EditorPickAdmin[]) => {
    queryClient.setQueryData(PICKS_KEY, data);
    void queryClient.invalidateQueries({ queryKey: ["editor-picks"] });
  };
  const create = useMutation({
    mutationFn: createPick,
    onSuccess: (data) => {
      onSaved(data);
      setMatch("");
      setNote("");
    },
  });
  const change = useMutation({
    mutationFn: (vars: { id: string; is_active: boolean }) =>
      updatePick(vars.id, { is_active: vars.is_active }),
    onSuccess: onSaved,
  });
  const remove = useMutation({ mutationFn: deletePick, onSuccess: onSaved });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!clubId || match.trim().length < 2) return;
    create.mutate({ kind, club_id: clubId, match: match.trim(), note: note.trim() || null });
  };

  const busy = create.isPending || change.isPending || remove.isPending;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-editor-picks">
      <h1 className="text-[20px] font-extrabold">Editor&apos;s Pick</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Турниры и столы на плашке сверху MTT и CASH. Пик — клуб и часть названия: игрок увидит
        ближайший старт турнира или открытые сейчас столы с таким названием.
      </p>

      <form
        onSubmit={submit}
        className="border-line bg-surface mt-4 grid gap-2 rounded-md border p-3 sm:grid-cols-2"
      >
        <div
          role="radiogroup"
          aria-label="Раздел"
          className="bg-surface-2 border-line flex rounded-md border p-0.5 sm:col-span-2"
        >
          {(["mtt", "cash"] as PickKind[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "h-8 flex-1 rounded-[6px] text-[13px] font-bold",
                kind === value ? "bg-surface-3 text-ink" : "text-ink-3",
              )}
            >
              {KIND_LABEL[value]}
            </button>
          ))}
        </div>
        <label className="text-ink-2 text-[12px] font-semibold">
          Клуб
          <select
            className={cn(fieldClass, "mt-1")}
            value={clubId}
            onChange={(event) => setClubId(event.target.value)}
          >
            <option value="">Выберите клуб</option>
            {clubs.data?.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name} · {APP_LABELS[club.app]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-2 text-[12px] font-semibold">
          {kind === "mtt" ? "Часть названия турнира" : "Часть названия стола"}
          <input
            className={cn(fieldClass, "mt-1")}
            value={match}
            maxLength={160}
            placeholder={kind === "mtt" ? "Dream River" : "Fox Den"}
            onChange={(event) => setMatch(event.target.value)}
          />
        </label>
        <label className="text-ink-2 text-[12px] font-semibold sm:col-span-2">
          Почему выбрано — строка на плашке
          <input
            className={cn(fieldClass, "mt-1")}
            value={note}
            maxLength={200}
            placeholder="Гарантия ×300 к бай-ину"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !clubId || match.trim().length < 2}
          className="bg-gold-grad text-ink-ongold h-10 rounded-md px-4 text-[14px] font-bold disabled:opacity-40 sm:col-span-2"
        >
          Добавить в Editor&apos;s Pick
        </button>
      </form>

      {(["mtt", "cash"] as PickKind[]).map((section) => {
        const items = (picks.data ?? []).filter((pick) => pick.kind === section);
        return (
          <section key={section} className="mt-5">
            <h2 className="text-ink-3 mb-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
              {KIND_LABEL[section]} · {items.length}
            </h2>
            {picks.isSuccess && items.length === 0 ? (
              <p className="text-ink-3 text-[13px]">Пока пусто.</p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {items.map((pick) => (
                <PickRow
                  key={pick.id}
                  pick={pick}
                  busy={busy}
                  onToggle={() => change.mutate({ id: pick.id, is_active: !pick.is_active })}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: "Убрать из Editor's Pick?",
                      description: `«${pick.match}» · ${pick.club_name}`,
                      confirmLabel: "Удалить",
                      cancelLabel: "Отмена",
                    });
                    if (ok) remove.mutate(pick.id);
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
