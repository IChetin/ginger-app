import { useState } from "react";

import { ApiError } from "@/api/client";
import { formatMoney } from "@/features/chips/lib/format";
import { usePublicClubs } from "@/features/chips/hooks";
import { useAdminWins, useCreateWin, useDeleteWin } from "@/features/feed/api";

const CURRENCIES = ["RUB", "USDT", "USD"] as const;

const todayMsk = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

const inputClass =
  "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px]";

/** Выигрыши для ленты (этап 7): менеджер заносит — лента показывает сразу. */
export function AdminWinsPage() {
  const wins = useAdminWins();
  const clubs = usePublicClubs();
  const create = useCreateWin();
  const remove = useDeleteWin();

  const [nickname, setNickname] = useState("");
  const [clubId, setClubId] = useState("");
  const [tournament, setTournament] = useState("");
  const [place, setPlace] = useState("");
  const [prize, setPrize] = useState("");
  const [currency, setCurrency] = useState<string>("RUB");
  const [wonOn, setWonOn] = useState(todayMsk);

  const valid = nickname.trim() && tournament.trim() && Number(prize.replace(",", ".")) > 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-wins">
      <h1 className="text-[20px] font-extrabold">Выигрыши</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Попадают в ленту на главной. Если игрок привязан и не дал согласия на публикацию, лента
        покажет «Игрок клуба».
      </p>

      <form
        className="border-line bg-surface mt-3 grid grid-cols-2 gap-1.5 rounded-md border px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          create.mutate(
            {
              player_nickname: nickname.trim(),
              club_id: clubId || null,
              tournament_name: tournament.trim(),
              place: place ? Number(place) : null,
              prize_amount: prize.replace(",", ".").replace(/\s/g, ""),
              currency_code: currency,
              won_on: wonOn || null,
            },
            {
              onSuccess: () => {
                setTournament("");
                setPlace("");
                setPrize("");
              },
            },
          );
        }}
      >
        <p className="text-ink col-span-2 text-[14px] font-bold">Новый выигрыш</p>
        <input
          aria-label="Ник игрока"
          placeholder="Ник игрока"
          value={nickname}
          maxLength={64}
          onChange={(event) => setNickname(event.target.value)}
          className={inputClass}
        />
        <select
          aria-label="Клуб"
          value={clubId}
          onChange={(event) => setClubId(event.target.value)}
          className={inputClass}
        >
          <option value="">Клуб не указан</option>
          {clubs.data?.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Турнир"
          placeholder="Турнир"
          value={tournament}
          maxLength={160}
          onChange={(event) => setTournament(event.target.value)}
          className={`${inputClass} col-span-2`}
        />
        <input
          aria-label="Место"
          placeholder="Место"
          inputMode="numeric"
          value={place}
          onChange={(event) => setPlace(event.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
        <input
          aria-label="Дата"
          type="date"
          value={wonOn}
          onChange={(event) => setWonOn(event.target.value)}
          className={inputClass}
        />
        <input
          aria-label="Приз"
          placeholder="Приз"
          inputMode="decimal"
          value={prize}
          onChange={(event) => setPrize(event.target.value)}
          className={inputClass}
        />
        <select
          aria-label="Валюта"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className={inputClass}
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={create.isPending || !valid}
          className="bg-gold-grad text-ink-ongold col-span-2 mt-1 h-10 rounded-md text-[14px] font-bold disabled:opacity-45"
        >
          Добавить в ленту
        </button>
        {create.isError ? (
          <p role="alert" className="text-danger col-span-2 text-[12px] font-semibold">
            {create.error instanceof ApiError ? create.error.message : "Не удалось сохранить"}
          </p>
        ) : null}
      </form>

      <div className="mt-3 flex flex-col gap-1.5">
        {wins.data?.map((win) => (
          <div
            key={win.id}
            data-testid="admin-win"
            className="border-line bg-surface flex items-center gap-2 rounded-md border px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[14px] font-bold">
                {win.player_nickname}
                {win.place ? ` · ${win.place} место` : ""}
              </span>
              <span className="text-ink-3 block truncate text-[12px]">
                {win.tournament_name}
                {win.club ? ` · ${win.club.name}` : ""} · {win.won_on}
              </span>
            </span>
            <span className="num text-ink shrink-0 text-[14px] font-bold">
              {formatMoney(win.prize_amount, win.currency_symbol, win.currency_code)}
            </span>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(win.id)}
              aria-label={`Удалить выигрыш ${win.player_nickname}`}
              className="text-danger h-8 shrink-0 rounded-md px-2 text-[12px] font-bold"
            >
              Удалить
            </button>
          </div>
        ))}
        {wins.isSuccess && wins.data.length === 0 ? (
          <p className="text-ink-3 text-center text-[13px]">Выигрышей пока нет</p>
        ) : null}
      </div>
    </div>
  );
}
