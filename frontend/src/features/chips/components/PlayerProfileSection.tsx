import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { usePlayerMe, useUpdatePlayerMe } from "@/features/chips/hooks";

const rowClass = "border-line flex items-center gap-2 border-t px-3 py-2.5 first:border-t-0";

/**
 * Игровая часть профиля (экраны §3.7): тип игрока, аккаунты, день рождения, согласие
 * на публикацию выигрышей (вопрос 11.18), приглашение. У менеджера без игрока не показывается.
 */
export function PlayerProfileSection() {
  const player = usePlayerMe();
  const update = useUpdatePlayerMe();
  const me = player.data;
  if (!me) return null;

  const confirmed = me.accounts.filter((account) => account.status === "confirmed").length;
  const pending = me.accounts.filter((account) => account.status === "pending").length;

  return (
    <section className="mx-4 mb-3" data-testid="player-profile">
      <div className="border-line bg-surface rounded-md border text-[14px]">
        <div className={rowClass}>
          <span className="text-ink-2 flex-1">Тип игрока</span>
          <b>{me.kind === "deposit" ? "Депозитный" : "Кредитный"}</b>
        </div>
        <Link to="/chips/accounts" className={rowClass}>
          <span className="text-ink-2 flex-1">Аккаунты в клубах</span>
          <b>
            {confirmed}
            {pending > 0 ? ` · ${pending} на проверке` : ""}
          </b>
          <span className="text-ink-3" aria-hidden="true">
            ›
          </span>
        </Link>
        <label className={rowClass}>
          <span className="text-ink-2 flex-1">
            День рождения
            <span className="text-ink-3 block text-[11.5px]">По желанию — поздравим</span>
          </span>
          <input
            type="date"
            aria-label="День рождения"
            value={me.birthday ?? ""}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ birthday: event.target.value || null })}
            className="border-line-strong bg-surface-2 h-9 rounded-md border px-2 text-[13px]"
          />
        </label>
        <label className={rowClass}>
          <span className="text-ink-2 flex-1">
            Показывать мой ник в выигрышах
            <span className="text-ink-3 block text-[11.5px]">
              Иначе в ленте — «Player X выиграл…»
            </span>
          </span>
          <input
            type="checkbox"
            aria-label="Показывать мой ник в выигрышах"
            checked={me.results_consent}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ results_consent: event.target.checked })}
            className="size-5"
          />
        </label>
        <Link to="/referral" className={rowClass}>
          <span className="text-ink-2 flex-1">Пригласить друга</span>
          <span className="text-ink-3" aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
      {update.isError ? (
        <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
          {update.error instanceof ApiError ? update.error.message : "Не удалось сохранить"}
        </p>
      ) : null}
    </section>
  );
}
