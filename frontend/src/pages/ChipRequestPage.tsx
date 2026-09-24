import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ChipRequest } from "@/api/types/chips";
import { screenshotUrl } from "@/features/chips/api";
import { StatusBadge } from "@/features/chips/components/RequestRow";
import { useChipRequest, useUploadScreenshot } from "@/features/chips/hooks";
import { compressImage } from "@/features/chips/lib/compressImage";
import {
  findPhone,
  formatDateMsk,
  formatMoney,
  formatNumber,
  formatPhone,
  formatRemaining,
  isOpen,
  requestSteps,
  type StepState,
} from "@/features/chips/lib/format";
import { useNow } from "@/features/tournaments/hooks";
import { cn } from "@/lib/utils";

const MARK_CLASS: Record<StepState, string> = {
  done: "bg-gold border-gold",
  current: "border-gold bg-gold-soft",
  todo: "border-line-strong bg-surface",
  failed: "bg-danger border-danger",
};

const LABEL_CLASS: Record<StepState, string> = {
  done: "text-ink-2",
  current: "text-gold",
  todo: "text-ink-3",
  failed: "text-danger",
};

/** Шкала заявки: ромбы-отметки, как срезанные углы в фирменном стиле. */
function RequestStepper({ request }: { request: ChipRequest }) {
  const steps = requestSteps(request);
  return (
    <ol className="mt-3 flex items-start" aria-label="Ход заявки" data-testid="request-steps">
      {steps.map((step, index) => (
        <li
          key={`${index}-${step.label}`}
          aria-current={step.state === "current" ? "step" : undefined}
          className="flex flex-1 flex-col items-center gap-1 text-center"
        >
          <div className="flex w-full items-center" aria-hidden="true">
            <span
              className={cn(
                "h-px flex-1",
                index === 0
                  ? "bg-transparent"
                  : steps[index - 1]?.state === "done"
                    ? "bg-gold"
                    : "bg-line-strong",
              )}
            />
            <span className={cn("h-2.5 w-2.5 shrink-0 rotate-45 border", MARK_CLASS[step.state])} />
            <span
              className={cn(
                "h-px flex-1",
                index === steps.length - 1
                  ? "bg-transparent"
                  : step.state === "done"
                    ? "bg-gold"
                    : "bg-line-strong",
              )}
            />
          </div>
          <span className={cn("text-[11px] leading-tight font-semibold", LABEL_CLASS[step.state])}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Box({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "gold" | "danger" | "live";
  children: React.ReactNode;
}) {
  const toneClass = {
    plain: "border-line bg-surface",
    gold: "border-line-gold bg-gold-soft",
    danger: "border-danger/35 bg-danger-soft",
    live: "border-live/35 bg-live-soft",
  }[tone];
  return <div className={`mt-2 rounded-md border px-3 py-2.5 ${toneClass}`}>{children}</div>;
}

/**
 * Ожидание с крутящимся колесом (фидбэк Ивана 24.09): игрок должен видеть, что заявка
 * живая и в работе, а не зависла. Сколько уже ждёт — тоже на виду.
 */
function Waiting({
  title,
  since,
  children,
}: {
  title: string;
  since: string;
  children?: ReactNode;
}) {
  const now = useNow(30_000);
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  return (
    <Box tone="gold">
      <div className="flex items-center gap-3" role="status" data-testid="request-waiting">
        <span
          aria-hidden="true"
          className="border-line-strong border-t-gold h-8 w-8 shrink-0 animate-spin rounded-full border-[3px] motion-reduce:animate-none"
        />
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-[14px] font-bold">{title}</span>
          <span className="text-ink-2 block text-[12.5px]">
            {minutes < 1 ? "Только что" : `Ждёте ${minutes} мин`} · обычно около 5 минут в часы
            кассы. Можно свернуть приложение — пришлём уведомление.
          </span>
        </span>
      </div>
      {children}
    </Box>
  );
}

function PaymentBlock({ request }: { request: ChipRequest }) {
  const now = useNow(1000);
  const upload = useUploadScreenshot(request.id);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"all" | "phone" | null>(null);
  const remaining = request.payment_deadline_at
    ? new Date(request.payment_deadline_at).getTime() - now.getTime()
    : null;
  // Перевод по СБП — по номеру телефона: его копируют отдельно от остального текста.
  const phone = findPhone(request.payment_requisites);

  const copy = async (what: "all" | "phone") => {
    try {
      await navigator.clipboard.writeText(
        what === "phone" && phone ? phone : (request.payment_requisites ?? ""),
      );
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Box tone="gold">
      <div className="flex items-baseline justify-between">
        <span className="text-ink text-[14px] font-bold">Реквизиты для оплаты</span>
        {remaining !== null ? (
          <span
            className={cn(
              "num text-right",
              remaining > 0 && remaining < 3 * 60_000 ? "text-danger" : "text-warn",
            )}
            data-testid="payment-timer"
          >
            {remaining > 0 ? (
              <>
                <span className="text-[11px] font-semibold">Осталось</span>{" "}
                <span className="font-display text-[24px] leading-none font-bold">
                  {formatRemaining(remaining)}
                </span>
              </>
            ) : (
              <span className="text-[15px] font-bold">Время вышло</span>
            )}
          </span>
        ) : null}
      </div>
      <pre className="text-ink mt-1.5 font-sans text-[14px] leading-snug whitespace-pre-wrap">
        {request.payment_requisites}
      </pre>
      <div className="mt-2 flex gap-1.5">
        {phone ? (
          <button
            type="button"
            data-testid="copy-phone"
            onClick={() => void copy("phone")}
            className="border-line-gold bg-surface text-ink flex h-11 flex-[1.4] flex-col items-center justify-center rounded-md border leading-tight"
          >
            <span className="text-[13px] font-bold">
              {copied === "phone" ? "Номер скопирован" : "Скопировать номер"}
            </span>
            <span className="num text-ink-3 text-[11px]">{formatPhone(phone)}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void copy("all")}
          className="border-line-strong bg-surface text-ink h-11 flex-1 rounded-md border text-[13px] font-bold"
        >
          {copied === "all" ? "Скопировано" : phone ? "Всё целиком" : "Скопировать"}
        </button>
      </div>
      <button
        type="button"
        disabled={upload.isPending || (remaining !== null && remaining <= 0)}
        onClick={() => input.current?.click()}
        className="bg-gold-grad text-ink-ongold mt-1.5 h-11 w-full rounded-md text-[14px] font-bold disabled:opacity-45"
      >
        {upload.isPending ? "Отправляем…" : "Приложить скриншот оплаты"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label="Скриншот оплаты"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void (async () => {
            const blob = await compressImage(file);
            upload.mutate({ file: blob, filename: file.name || "payment.jpg" });
          })();
        }}
      />
      <p className="text-ink-3 mt-1.5 text-[11.5px]">
        Скриншот останавливает таймер — дальше менеджер проверит оплату.
      </p>
      {upload.isError ? (
        <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
          {upload.error instanceof ApiError
            ? upload.error.message
            : "Не удалось отправить скриншот"}
        </p>
      ) : null}
    </Box>
  );
}

export function ChipRequestPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const query = useChipRequest(requestId);

  if (query.isPending) {
    return <div className="bg-surface mx-3 mt-4 h-48 rounded-md" />;
  }
  if (query.isError) {
    return (
      <div className="border-line bg-surface mx-3 mt-4 rounded-md border px-4 py-6 text-center">
        <p className="text-ink text-[15px] font-bold">Заявка не найдена</p>
        <Link to="/chips" className="text-gold mt-2 inline-block text-[13px] font-bold">
          К фишкам
        </Link>
      </div>
    );
  }

  const request = query.data;
  const withdrawal = request.kind === "withdrawal";
  const repeatUrl = `/chips?repeat=${request.id}${withdrawal ? "&kind=withdrawal" : ""}`;

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="chip-request-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/chips" className="text-gold text-[13px] font-bold" aria-label="Назад к фишкам">
          ← Фишки
        </Link>
        <span className="flex-1" />
        <StatusBadge status={request.status} kind={request.kind} />
      </header>
      <h1 className="text-[17px] font-extrabold tracking-tight">
        {withdrawal ? "Вывод" : "Заявка на фишки"}
      </h1>
      <p className="text-ink-3 text-[12px]">{formatDateMsk(request.created_at)} МСК</p>
      <RequestStepper request={request} />

      <div className="border-line bg-surface mt-2 rounded-md border">
        {request.items.map((item) => (
          <div
            key={item.id}
            className="border-line flex items-baseline gap-2 border-t px-3 py-2 first:border-t-0"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[14px] font-bold">
                {item.club.name}
              </span>
              <span className="text-ink-3 block text-[11.5px]">
                {item.account_nickname} · ID {item.account_app_id}
              </span>
            </span>
            <span className="text-right">
              <span className="num text-ink block text-[15px] font-extrabold">
                {formatNumber(item.amount)} фиш.
              </span>
              {item.money_amount && item.chip_currency_code ? (
                <span className="num text-ink-3 block text-[11.5px]">
                  {formatMoney(
                    item.money_amount,
                    item.club.currency_symbol,
                    item.chip_currency_code,
                  )}
                </span>
              ) : null}
            </span>
          </div>
        ))}
        {request.totals.length > 0 ? (
          <div className="border-line flex justify-between border-t px-3 py-2">
            <span className="text-ink-3 text-[12px] font-semibold">Итого</span>
            <span className="num text-ink text-[15px] font-extrabold">
              {request.totals
                .map((total) =>
                  formatMoney(total.amount, total.currency_symbol, total.currency_code),
                )
                .join(" · ")}
            </span>
          </div>
        ) : null}
      </div>

      {request.status === "sent" ? (
        <Waiting title="Ожидайте — заявка отправлена менеджеру" since={request.created_at} />
      ) : null}
      {request.status === "accepted" ? (
        <Waiting title="Заявка в работе у менеджера" since={request.updated_at} />
      ) : null}
      {request.status === "awaiting_payment" ? <PaymentBlock request={request} /> : null}
      {request.status === "paid" ? (
        <Waiting title="Ожидайте — проверяем оплату" since={request.updated_at}>
          <a href={screenshotUrl(request.id)} target="_blank" rel="noreferrer">
            <img
              src={screenshotUrl(request.id)}
              alt="Скриншот оплаты"
              className="border-line mt-2 max-h-40 rounded-md border"
            />
          </a>
        </Waiting>
      ) : null}
      {request.status === "completed" ? (
        <Box tone="live">
          <p className="text-ink text-[14px] font-bold">
            {withdrawal ? "Вывод отправлен" : "Фишки начислены"}
          </p>
        </Box>
      ) : null}
      {request.status === "rejected" ? (
        <Box tone="danger">
          <p className="text-danger text-[14px] font-bold">Заявка отклонена</p>
          <p className="text-ink mt-0.5 text-[13px]">{request.reject_comment}</p>
        </Box>
      ) : null}
      {request.status === "expired" ? (
        <Box tone="danger">
          <p className="text-danger text-[14px] font-bold">Время на оплату вышло</p>
          <p className="text-ink-2 text-[12.5px]">Заявку можно повторить в один тап.</p>
        </Box>
      ) : null}
      {withdrawal && request.withdrawal_requisites ? (
        <Box>
          <p className="text-ink-3 text-[12px] font-semibold">Реквизиты для вывода</p>
          <p className="text-ink text-[14px] whitespace-pre-wrap">
            {request.withdrawal_requisites}
          </p>
        </Box>
      ) : null}

      <Link
        to={`/dialogs/new?request=${request.id}`}
        className="border-line-strong bg-surface text-ink mt-3 flex h-10 w-full items-center justify-center rounded-md border text-[14px] font-bold"
      >
        Написать по заявке
      </Link>

      {!isOpen(request.status) ? (
        <button
          type="button"
          onClick={() => navigate(repeatUrl)}
          className="bg-gold-grad text-ink-ongold mt-3 h-11 w-full rounded-md text-[15px] font-bold"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}
