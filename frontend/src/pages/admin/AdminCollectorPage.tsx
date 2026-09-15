import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CollectorRun,
  TournamentChange,
  TournamentChangeKind,
} from "@/features/admin/collector/api";
import {
  applyTournamentChange,
  dismissTournamentChange,
  fetchCollectorStatus,
  fetchTournamentChanges,
} from "@/features/admin/collector/api";
import { isAdminUser, useMe } from "@/features/admin/hooks";
import { APP_LABELS, formatStartShort } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const KIND_TITLE: Record<TournamentChangeKind, string> = {
  new: "Новые в лобби — нет в сетке",
  missing: "Пропали из лобби — есть в сетке",
  changed: "Отличаются от сетки",
};

const APPLY_LABEL: Record<TournamentChangeKind, string> = {
  new: "Добавить старт",
  missing: "Отменить старт",
  changed: "Поправить сетку",
};

const FIELD_LABEL: Record<string, string> = {
  buyin: "Бай-ин",
  guarantee: "Гарантия",
  bounty_kind: "Формат",
  game_type: "Игра",
  lobby_name: "Имя в лобби",
};

const queryKeys = {
  status: ["admin", "collector", "status"] as const,
  changes: ["admin", "collector", "changes"] as const,
};

function ago(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн. назад`;
}

function RunCard({ run }: { run: CollectorRun }) {
  const tone =
    run.status === "failed"
      ? "bg-danger-soft text-danger"
      : run.status === "running"
        ? "bg-gold-soft text-gold"
        : "bg-[var(--live-soft)] text-[var(--action-live-fg)]";
  return (
    <div className="border-line bg-surface rounded-md border px-3 py-2" data-testid="collector-run">
      <div className="flex items-center gap-2">
        <span className="text-ink text-[14px] font-bold">
          {APP_LABELS[run.app]} · {run.kind === "mtt" ? "турниры" : "кэш"}
        </span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", tone)}>
          {run.status === "running" ? "идёт" : run.status === "ok" ? "готово" : "ошибка"}
        </span>
      </div>
      <p className="text-ink-3 text-[12px]">
        Начат {ago(run.started_at)}
        {run.finished_at ? ` · закончен ${ago(run.finished_at)}` : ""}
      </p>
      {run.error ? <p className="text-danger mt-0.5 text-[12px]">{run.error}</p> : null}
    </div>
  );
}

function ChangeDetails({ change }: { change: TournamentChange }) {
  if (change.kind === "changed") {
    return (
      <ul className="text-ink-2 mt-0.5 text-[12px]">
        {Object.entries(change.payload).map(([field, value]) => {
          const diff = value as { ours: unknown; lobby: unknown };
          return (
            <li key={field}>
              {FIELD_LABEL[field] ?? field}: {String(diff.ours ?? "—")} →{" "}
              <span className="text-ink font-semibold">{String(diff.lobby ?? "—")}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (change.kind === "new") {
    const buyin = change.payload.buyin;
    return (
      <p className="text-ink-2 mt-0.5 text-[12px]">
        {buyin != null ? `Бай-ин ${String(buyin)}` : "Бай-ин не распознан"}
        {change.payload.guarantee != null ? ` · гарантия ${String(change.payload.guarantee)}` : ""}
      </p>
    );
  }
  return null;
}

/** Сборщик лобби: жив ли, и расхождения лобби с сеткой, которые решает человек. */
export function AdminCollectorPage() {
  const { data: me } = useMe();
  const canResolve = isAdminUser(me);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: queryKeys.status, queryFn: fetchCollectorStatus });
  const changes = useQuery({ queryKey: queryKeys.changes, queryFn: fetchTournamentChanges });
  const resolve = useMutation({
    mutationFn: (vars: { id: string; apply: boolean }) =>
      vars.apply ? applyTournamentChange(vars.id) : dismissTournamentChange(vars.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "collector"] });
    },
  });

  const grouped = (["new", "missing", "changed"] as TournamentChangeKind[])
    .map((kind) => [kind, (changes.data ?? []).filter((change) => change.kind === kind)] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-collector">
      <h1 className="text-[20px] font-extrabold">Сборщик</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Телефон обходит лобби клубов: утром турниры, вечером кэш. Параметры турниров и ссылки
        применяются сами, здесь — то, что решает человек.
      </p>

      <h2 className="text-ink-3 mt-4 mb-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
        Последние проходы
      </h2>
      {status.data && status.data.runs.length === 0 ? (
        <p className="text-ink-3 text-[13px]">Сборщик ещё не выходил на связь.</p>
      ) : null}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {status.data?.runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}
      </div>

      <h2 className="text-ink-3 mt-5 mb-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
        Ждут решения · {status.data?.pending_changes ?? 0}
      </h2>
      {changes.isSuccess && changes.data.length === 0 ? (
        <p className="text-ink-3 text-[13px]">Лобби совпадает с сеткой.</p>
      ) : null}
      {grouped.map(([kind, items]) => (
        <section key={kind} className="mt-3">
          <h3 className="text-ink mb-1 text-[13px] font-bold">
            {KIND_TITLE[kind]} · {items.length}
          </h3>
          <div className="flex flex-col gap-1.5">
            {items.map((change) => (
              <div
                key={change.id}
                className="border-line bg-surface rounded-md border px-3 py-2"
                data-testid="tournament-change"
              >
                <p className="text-ink text-[14px] font-bold">{change.title}</p>
                <p className="text-ink-3 text-[12px]">
                  {change.club_name} · {APP_LABELS[change.app]} ·{" "}
                  {formatStartShort(change.starts_at)}
                </p>
                <ChangeDetails change={change} />
                {canResolve ? (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: change.id, apply: true })}
                      className="bg-gold-grad text-ink-ongold h-9 rounded-md px-3 text-[13px] font-bold disabled:opacity-40"
                    >
                      {APPLY_LABEL[kind]}
                    </button>
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: change.id, apply: false })}
                      className="border-line-strong text-ink-2 h-9 rounded-md border px-3 text-[13px] font-bold disabled:opacity-40"
                    >
                      Оставить как есть
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
