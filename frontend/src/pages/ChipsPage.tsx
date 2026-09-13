import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ChipRequest, ChipRequestKind, PlayerAccount, PlayerMe } from "@/api/types/chips";
import { RequestRow } from "@/features/chips/components/RequestRow";
import { useChipRequests, useCreateChipRequest, usePlayerMe } from "@/features/chips/hooks";
import {
  amountPresets,
  computeTotals,
  formatMoney,
  formatNumber,
  isOpen,
  parseAmount,
} from "@/features/chips/lib/format";
import { APP_ICONS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  key: number;
  accountId: string;
  amount: string;
}

let rowKey = 0;
const newRow = (accountId: string, amount = ""): Row => ({ key: ++rowKey, accountId, amount });

function initialRows(
  accounts: PlayerAccount[],
  repeat: ChipRequest | undefined,
  last: ChipRequest | undefined,
  clubId: string | null = null,
): Row[] {
  const ids = new Set(accounts.map((account) => account.id));
  const fromRepeat = repeat?.items
    .filter((item) => ids.has(item.account_id))
    .map((item) => newRow(item.account_id, String(Number(item.amount))));
  if (fromRepeat && fromRepeat.length > 0) return fromRepeat;
  // «Запросить фишки сюда» с карточки клуба.
  const inClub = clubId ? accounts.find((account) => account.club.id === clubId) : undefined;
  if (inClub) return [newRow(inClub.id)];
  // По умолчанию — клуб последней заявки (ТЗ §3.1).
  const lastAccount = last?.items.find((item) => ids.has(item.account_id))?.account_id;
  const first = lastAccount ?? accounts[0]?.id;
  return first ? [newRow(first)] : [];
}

function AmountRow({
  row,
  accounts,
  usedIds,
  canRemove,
  onChange,
  onRemove,
}: {
  row: Row;
  accounts: PlayerAccount[];
  usedIds: Set<string>;
  canRemove: boolean;
  onChange: (row: Row) => void;
  onRemove: () => void;
}) {
  const account = accounts.find((item) => item.id === row.accountId);
  const selected = parseAmount(row.amount);
  return (
    <div className="bg-surface border-line rounded-md border p-2.5" data-testid="amount-row">
      <div className="flex items-center gap-2">
        {account && APP_ICONS[account.club.app] ? (
          <img src={APP_ICONS[account.club.app]} alt="" className="h-5 w-5 rounded-[22%]" />
        ) : null}
        <select
          aria-label="Клуб и аккаунт"
          className="text-ink min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none"
          value={row.accountId}
          onChange={(event) => onChange({ ...row, accountId: event.target.value })}
        >
          {accounts.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={usedIds.has(item.id) && item.id !== row.accountId}
            >
              {item.club.name} · {item.nickname}
            </option>
          ))}
        </select>
        {canRemove ? (
          <button
            type="button"
            aria-label="Убрать клуб"
            onClick={onRemove}
            className="text-ink-3 h-8 w-8 rounded-md text-[14px]"
          >
            ✕
          </button>
        ) : null}
      </div>
      {account ? (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {amountPresets(account.club).map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={selected === preset}
                onClick={() => onChange({ ...row, amount: String(preset) })}
                className={cn(
                  "num h-9 rounded-md border text-[14px] font-bold",
                  selected === preset
                    ? "border-line-gold bg-gold-soft text-gold"
                    : "border-line bg-surface-2 text-ink",
                )}
              >
                {formatNumber(preset)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              aria-label="Своя сумма"
              inputMode="decimal"
              placeholder="или своя сумма"
              value={row.amount}
              onChange={(event) => onChange({ ...row, amount: event.target.value })}
              className="border-line bg-surface-2 text-ink num h-9 min-w-0 flex-1 rounded-md border px-2.5 text-[14px] outline-none"
            />
            {account.club.chip_value && account.club.chip_currency_code ? (
              <span className="text-ink-3 shrink-0 text-[11px]">
                1 фишка ={" "}
                {formatMoney(
                  account.club.chip_value,
                  account.club.currency_symbol,
                  account.club.chip_currency_code,
                )}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function RequestForm({
  player,
  kind,
  accounts,
  rows: startRows,
}: {
  player: PlayerMe;
  kind: ChipRequestKind;
  accounts: PlayerAccount[];
  rows: Row[];
}) {
  const navigate = useNavigate();
  const create = useCreateChipRequest();
  const [rows, setRows] = useState<Row[]>(startRows);
  const [requisites, setRequisites] = useState("");

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const usedIds = new Set(rows.map((row) => row.accountId));
  const totals = computeTotals(
    rows.flatMap((row) => {
      const account = byId.get(row.accountId);
      return account ? [{ club: account.club, amount: parseAmount(row.amount) }] : [];
    }),
  );
  const valid =
    rows.length > 0 &&
    rows.every((row) => byId.has(row.accountId) && parseAmount(row.amount) > 0) &&
    (kind === "topup" || requisites.trim().length > 0);
  const freeAccount = accounts.find((account) => !usedIds.has(account.id));

  const submit = async () => {
    if (!valid) return;
    try {
      const request = await create.mutateAsync({
        kind,
        items: rows.map((row) => ({
          account_id: row.accountId,
          amount: String(parseAmount(row.amount)),
        })),
        ...(kind === "withdrawal" ? { withdrawal_requisites: requisites.trim() } : {}),
      });
      navigate(`/chips/${request.id}`);
    } catch {
      // Сообщение показывается ниже из create.error.
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <AmountRow
          key={row.key}
          row={row}
          accounts={accounts}
          usedIds={usedIds}
          canRemove={rows.length > 1}
          onChange={(next) => setRows(rows.map((item, i) => (i === index ? next : item)))}
          onRemove={() => setRows(rows.filter((_, i) => i !== index))}
        />
      ))}
      {freeAccount ? (
        <button
          type="button"
          onClick={() => setRows([...rows, newRow(freeAccount.id)])}
          className="text-gold self-start px-1 py-1 text-[13px] font-bold"
        >
          + Добавить ещё клуб
        </button>
      ) : null}

      {kind === "withdrawal" ? (
        <textarea
          aria-label="Реквизиты для вывода"
          placeholder="Куда вывести: карта или кошелёк"
          value={requisites}
          onChange={(event) => setRequisites(event.target.value)}
          rows={2}
          className="border-line bg-surface text-ink rounded-md border px-2.5 py-2 text-[14px] outline-none"
        />
      ) : null}

      <div className="flex items-baseline justify-between px-0.5 pt-1">
        <span className="text-ink-3 text-[12px] font-semibold">Итого</span>
        <span className="num text-ink text-[16px] font-extrabold" data-testid="request-total">
          {totals.length
            ? totals.map((line) => formatMoney(line.amount, line.symbol, line.code)).join(" · ")
            : "—"}
        </span>
      </div>
      {!player.cashdesk_open ? (
        <p className="text-ink-3 text-[12px]">
          Касса работает {player.cashdesk_hours} — заявка встанет в очередь.
        </p>
      ) : null}
      {create.isError ? (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {create.error instanceof ApiError ? create.error.message : "Не удалось отправить заявку"}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!valid || create.isPending}
        onClick={() => void submit()}
        className="bg-gold-grad text-ink-ongold mt-1 h-11 rounded-md text-[15px] font-bold disabled:opacity-45"
      >
        {kind === "withdrawal" ? "Запросить вывод" : "Запросить фишки"}
      </button>
    </div>
  );
}

export function ChipsPage() {
  const player = usePlayerMe();
  const requests = useChipRequests(player.isSuccess);
  const [params, setParams] = useSearchParams();
  const kind: ChipRequestKind = params.get("kind") === "withdrawal" ? "withdrawal" : "topup";
  const repeatId = params.get("repeat");

  const confirmed = useMemo(
    () => (player.data?.accounts ?? []).filter((account) => account.status === "confirmed"),
    [player.data],
  );
  const open = (requests.data ?? []).filter((item) => isOpen(item.status));
  const history = (requests.data ?? []).filter((item) => !isOpen(item.status));

  if (player.isPending) {
    return <div className="bg-surface mx-3 mt-4 h-40 rounded-md" data-testid="chips-loading" />;
  }
  if (player.isError) {
    const notPlayer = player.error instanceof ApiError && player.error.code === "not_a_player";
    return (
      <div className="border-line bg-surface mx-3 mt-4 rounded-md border px-4 py-6 text-center">
        <p className="text-ink text-[15px] font-bold">
          {notPlayer ? "Фишки доступны игрокам клуба" : "Не удалось загрузить"}
        </p>
        <p className="text-ink-2 mt-1 text-[13px]">
          {notPlayer
            ? "Войдите по приглашению от менеджера"
            : player.error instanceof ApiError
              ? player.error.message
              : "Проверьте соединение"}
        </p>
      </div>
    );
  }

  const me = player.data;
  const repeat = repeatId ? requests.data?.find((item) => item.id === repeatId) : undefined;
  const lastTopup = requests.data?.find((item) => item.kind === kind);
  const formReady = !repeatId || requests.isSuccess;

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="chips-page">
      <header className="border-line bg-bg/90 sticky top-0 z-20 flex items-center gap-2 border-b px-3 pt-2.5 pb-2 backdrop-blur-[14px]">
        <h1 className="flex-1 text-[17px] font-extrabold tracking-tight">Фишки</h1>
        <Link to="/chips/accounts" className="text-gold text-[13px] font-bold">
          Аккаунты
        </Link>
      </header>

      {me.kind === "deposit" ? (
        <div
          role="tablist"
          className="bg-surface border-line mx-3 mt-2.5 flex rounded-full border p-0.5"
        >
          {(["topup", "withdrawal"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setParams(value === "withdrawal" ? { kind: value } : {})}
              className={cn(
                "h-8 flex-1 rounded-full text-[13px] font-bold",
                kind === value ? "bg-surface-3 text-ink" : "text-ink-3",
              )}
            >
              {value === "topup" ? "Запрос" : "Вывод"}
            </button>
          ))}
        </div>
      ) : null}

      {open.length > 0 ? (
        <section className="px-3 pt-3">
          <h2 className="text-ink-3 mb-1.5 text-[11px] font-bold tracking-[0.04em] uppercase">
            В работе
          </h2>
          <div className="flex flex-col gap-1.5">
            {open.map((item) => (
              <RequestRow key={item.id} request={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-3 pt-3">
        {confirmed.length === 0 ? (
          <div className="border-line-gold bg-surface rounded-md border border-dashed px-4 py-5 text-center">
            <p className="text-ink text-[15px] font-bold">Привяжите аккаунт в клубе</p>
            <p className="text-ink-2 mt-1 text-[13px]">
              {me.accounts.some((account) => account.status === "pending")
                ? "Аккаунт на проверке у менеджера — после подтверждения можно запрашивать фишки"
                : "Без него фишки не запросить: укажите клуб, ник и ID в приложении"}
            </p>
            <Link
              to="/chips/accounts"
              className="bg-gold-grad text-ink-ongold mt-3 inline-flex h-10 items-center rounded-md px-5 text-[14px] font-bold"
            >
              Привязать аккаунт
            </Link>
          </div>
        ) : formReady ? (
          <RequestForm
            key={`${kind}-${repeatId ?? "new"}`}
            player={me}
            kind={kind}
            accounts={confirmed}
            rows={initialRows(confirmed, repeat, lastTopup, params.get("club"))}
          />
        ) : null}
      </section>

      {history.length > 0 ? (
        <section className="px-3 pt-4">
          <h2 className="text-ink-3 mb-1.5 text-[11px] font-bold tracking-[0.04em] uppercase">
            История
          </h2>
          <div className="flex flex-col gap-1.5">
            {history.slice(0, 20).map((item) => (
              <RequestRow key={item.id} request={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
