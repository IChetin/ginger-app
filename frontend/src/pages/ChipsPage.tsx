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

function ClubIcon({ account, className }: { account: PlayerAccount; className: string }) {
  const src = APP_ICONS[account.club.app];
  return src ? (
    <img src={src} alt="" aria-hidden="true" className={cn("shrink-0 rounded-[22%]", className)} />
  ) : null;
}

/** Фишки × курс клуба: «$100», «₽5 000». Без курса или без суммы — ничего. */
function moneyFor(account: PlayerAccount, chips: number): string | null {
  const { chip_value, chip_currency_code, currency_symbol } = account.club;
  if (!chip_value || !chip_currency_code || chips <= 0) return null;
  return formatMoney(chips * Number(chip_value), currency_symbol, chip_currency_code);
}

/**
 * Клубы игрока плитками: тап добавляет клуб в заявку или убирает его. Запрос в другой клуб —
 * три тапа: клуб, сумма, отправить (проверка по кликам, экраны §4).
 */
function ClubTiles({
  accounts,
  rows,
  onToggle,
}: {
  accounts: PlayerAccount[];
  rows: Row[];
  onToggle: (accountId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Клубы в заявке"
      className="-mx-3 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pb-0.5 [&::-webkit-scrollbar]:hidden"
    >
      {accounts.map((account) => {
        const selected = rows.some((row) => row.accountId === account.id);
        return (
          <button
            key={account.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${account.club.name} · ${account.nickname}`}
            onClick={() => onToggle(account.id)}
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 rounded-md border pr-3 pl-2 text-left",
              selected ? "border-line-gold bg-gold-soft" : "border-line bg-surface",
            )}
          >
            <ClubIcon account={account} className="h-6 w-6" />
            <span className="flex flex-col leading-tight">
              <span className={cn("text-[13.5px] font-bold", selected ? "text-gold" : "text-ink")}>
                {account.club.name}
              </span>
              <span className="text-ink-3 text-[11px]">{account.nickname}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AmountBlock({
  row,
  account,
  onChange,
}: {
  row: Row;
  account: PlayerAccount;
  onChange: (row: Row) => void;
}) {
  const selected = parseAmount(row.amount);
  const money = moneyFor(account, selected);
  const { chip_value, chip_currency_code, currency_symbol } = account.club;
  const rate =
    chip_value && chip_currency_code
      ? formatMoney(chip_value, currency_symbol, chip_currency_code)
      : null;

  return (
    <div className="bg-surface border-line rounded-lg border p-3" data-testid="amount-row">
      <div className="flex items-center gap-2">
        <ClubIcon account={account} className="h-5 w-5" />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-ink text-[14px] font-bold">{account.club.name}</span>
          <span className="text-ink-3 text-[12px]">
            {" "}
            · {account.nickname} · ID {account.app_account_id}
          </span>
        </span>
        <span
          className={cn(
            "font-display num shrink-0 text-[17px] font-bold",
            money ? "text-value-hi" : "text-ink-3",
          )}
        >
          {money ?? "—"}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {amountPresets(account.club).map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={selected === preset}
            onClick={() => onChange({ ...row, amount: String(preset) })}
            className={cn(
              "font-display num h-11 rounded-md border text-[16px] font-bold",
              selected === preset
                ? "border-line-gold bg-gold-soft text-gold"
                : "border-line bg-surface-2 text-ink",
            )}
          >
            {formatNumber(preset)}
          </button>
        ))}
      </div>
      <div className="border-line bg-surface-2 focus-within:border-gold mt-1.5 flex h-11 items-center gap-2 rounded-md border px-3">
        <input
          aria-label="Своя сумма"
          inputMode="decimal"
          placeholder="Своя сумма"
          value={row.amount}
          onChange={(event) => onChange({ ...row, amount: event.target.value })}
          className="text-ink num min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
        <span className="text-ink-3 shrink-0 text-[12px]">
          фиш.{rate ? ` · 1 фишка = ${rate}` : ""}
        </span>
      </div>
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

  const toggleAccount = (accountId: string) => {
    setRows((current) => {
      if (current.some((row) => row.accountId === accountId)) {
        // Последний клуб не убираем: заявка без клуба не имеет смысла.
        return current.length > 1 ? current.filter((row) => row.accountId !== accountId) : current;
      }
      return [...current, newRow(accountId)];
    });
  };

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
    <div className="flex flex-col gap-2">
      {accounts.length > 1 ? (
        <ClubTiles accounts={accounts} rows={rows} onToggle={toggleAccount} />
      ) : null}

      {rows.map((row) => {
        const account = byId.get(row.accountId);
        return account ? (
          <AmountBlock
            key={row.key}
            row={row}
            account={account}
            onChange={(next) =>
              setRows((current) => current.map((item) => (item.key === next.key ? next : item)))
            }
          />
        ) : null;
      })}

      {kind === "withdrawal" ? (
        <textarea
          aria-label="Реквизиты для вывода"
          placeholder="Куда вывести: карта или кошелёк"
          value={requisites}
          onChange={(event) => setRequisites(event.target.value)}
          rows={2}
          className="border-line bg-surface text-ink focus:border-gold rounded-lg border px-3 py-2.5 text-[14px] outline-none"
        />
      ) : null}

      <div className="border-line-strong bg-surface mt-1 rounded-lg border p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink-2 text-[13px] font-semibold">
            {kind === "withdrawal" ? "К выводу" : "Итого"}
          </span>
          <span
            className="font-display num text-value-hi text-right text-[22px] font-bold"
            data-testid="request-total"
          >
            {totals.length
              ? totals.map((line) => formatMoney(line.amount, line.symbol, line.code)).join(" · ")
              : "—"}
          </span>
        </div>
        {!player.cashdesk_open ? (
          <p className="text-warn mt-1 text-[12px]">
            Касса работает {player.cashdesk_hours} — заявка встанет в очередь.
          </p>
        ) : null}
        {create.isError ? (
          <p role="alert" className="text-danger mt-1 text-[13px] font-semibold">
            {create.error instanceof ApiError
              ? create.error.message
              : "Не удалось отправить заявку"}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!valid || create.isPending}
          onClick={() => void submit()}
          className="bg-gold-grad text-ink-ongold shadow-sheen-glow mt-2.5 h-12 w-full rounded-md text-[16px] font-bold disabled:opacity-45 disabled:shadow-none"
        >
          {create.isPending
            ? "Отправляем…"
            : kind === "withdrawal"
              ? "Запросить вывод"
              : "Запросить фишки"}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-ink-3 mb-1.5 text-[11px] font-bold tracking-[0.06em] uppercase">
      {children}
    </h2>
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
        <h1 className="text-[18px] font-bold">Фишки</h1>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
            me.cashdesk_open ? "bg-live-soft text-live" : "bg-surface-2 text-ink-3",
          )}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {me.cashdesk_open ? "Касса открыта" : "Касса закрыта"}
        </span>
        <span className="flex-1" />
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
          <SectionTitle>В работе</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {open.map((item) => (
              <RequestRow key={item.id} request={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-3 pt-3">
        {confirmed.length === 0 ? (
          <div className="border-line-gold bg-surface rounded-lg border border-dashed px-4 py-5 text-center">
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
          <SectionTitle>История</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {history.slice(0, 20).map((item) => (
              <RequestRow key={item.id} request={item} repeat />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
