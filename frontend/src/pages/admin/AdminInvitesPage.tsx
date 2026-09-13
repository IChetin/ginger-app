import { useState } from "react";

import { ApiError } from "@/api/client";
import type { PlayerKind } from "@/api/types/chips";
import type { Invite, InviteCreated } from "@/features/admin/chips/api";
import { useCreateInvite, useInvites, useRevokeInvite } from "@/features/admin/chips/hooks";
import { formatDateMsk } from "@/features/chips/lib/format";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<Invite["state"], string> = {
  active: "Активен",
  used: "Использован",
  expired: "Истёк",
  revoked: "Отозван",
};

function CreatedLink({ invite }: { invite: InviteCreated }) {
  const url = `${window.location.origin}${invite.path}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div
      data-testid="invite-created"
      className="border-line-gold bg-gold-soft mt-2 rounded-md border px-3 py-2.5"
    >
      <p className="text-ink text-[13px] font-bold">Ссылка готова — она показывается один раз</p>
      <p className="text-ink-2 mt-1 text-[12.5px] break-all select-all">{url}</p>
      <button
        type="button"
        onClick={() => void copy()}
        className="bg-gold-grad text-ink-ongold mt-2 h-10 w-full rounded-md text-[14px] font-bold"
      >
        {copied ? "Скопировано" : "Скопировать ссылку"}
      </button>
    </div>
  );
}

/** Инвайты: без ссылки регистрация закрыта. Ссылку отправляете игроку сами — в личку. */
export function AdminInvitesPage() {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [kind, setKind] = useState<PlayerKind>("credit");
  const [note, setNote] = useState("");

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-invites">
      <h1 className="text-[20px] font-extrabold">Инвайты</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Ссылка живёт 7 дней и срабатывает один раз. Тип игрока задаётся сразу.
      </p>

      <div className="border-line bg-surface mt-3 rounded-md border px-3 py-2.5">
        <div className="bg-surface-2 flex rounded-md p-0.5 text-[13px] font-bold">
          {(["credit", "deposit"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "h-9 flex-1 rounded-[6px]",
                kind === value ? "bg-surface text-ink" : "text-ink-3",
              )}
            >
              {value === "credit" ? "Кредитный" : "Депозитный"}
            </button>
          ))}
        </div>
        <input
          aria-label="Кому"
          placeholder="Кому (для себя): Вася из вторника"
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          className="border-line-strong bg-surface-2 mt-2 block h-10 w-full rounded-md border px-2.5 text-[14px]"
        />
        <button
          type="button"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(
              { player_kind: kind, note: note.trim() || undefined },
              { onSuccess: () => setNote("") },
            )
          }
          className="border-line-strong bg-surface-2 text-ink mt-2 h-10 w-full rounded-md border text-[14px] font-bold disabled:opacity-45"
        >
          Создать ссылку
        </button>
        {create.isError ? (
          <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
            {create.error instanceof ApiError ? create.error.message : "Не удалось создать"}
          </p>
        ) : null}
      </div>
      {create.data ? <CreatedLink invite={create.data} /> : null}

      <div className="mt-3 flex flex-col gap-1.5">
        {invites.data?.map((invite) => (
          <div
            key={invite.id}
            data-testid="invite-row"
            className="border-line bg-surface flex items-center gap-2 rounded-md border px-2.5 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[13px] font-bold">
                {invite.note || (invite.player_kind === "deposit" ? "Депозитный" : "Кредитный")}
              </span>
              <span className="text-ink-3 block truncate text-[11.5px]">
                {STATE_LABEL[invite.state]}
                {invite.used_by_nickname ? ` · ${invite.used_by_nickname}` : ""}
                {invite.state === "active" ? ` · до ${formatDateMsk(invite.expires_at)}` : ""}
              </span>
            </span>
            {invite.state === "active" ? (
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invite.id)}
                className="text-danger h-9 rounded-md px-2 text-[12px] font-bold disabled:opacity-45"
              >
                Отозвать
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
