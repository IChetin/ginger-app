import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ChipRequest } from "@/api/types/chips";
import { screenshotUrl } from "@/features/chips/api";
import { StatusBadge } from "@/features/chips/components/RequestRow";
import { useChipRequest, useUploadScreenshot } from "@/features/chips/hooks";
import { compressImage } from "@/features/chips/lib/compressImage";
import {
  formatDateMsk,
  formatMoney,
  formatNumber,
  formatRemaining,
  isOpen,
} from "@/features/chips/lib/format";
import { useNow } from "@/features/tournaments/hooks";

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

function PaymentBlock({ request }: { request: ChipRequest }) {
  const now = useNow(1000);
  const upload = useUploadScreenshot(request.id);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const remaining = request.payment_deadline_at
    ? new Date(request.payment_deadline_at).getTime() - now.getTime()
    : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request.payment_requisites ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Box tone="gold">
      <div className="flex items-baseline justify-between">
        <span className="text-ink text-[14px] font-bold">Реквизиты для оплаты</span>
        {remaining !== null ? (
          <span className="text-warn num text-[15px] font-extrabold" data-testid="payment-timer">
            {remaining > 0 ? `Осталось ${formatRemaining(remaining)}` : "Время вышло"}
          </span>
        ) : null}
      </div>
      <pre className="text-ink mt-1.5 font-sans text-[14px] leading-snug whitespace-pre-wrap">
        {request.payment_requisites}
      </pre>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => void copy()}
          className="border-line-strong bg-surface text-ink h-10 flex-1 rounded-md border text-[13px] font-bold"
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
        <button
          type="button"
          disabled={upload.isPending || (remaining !== null && remaining <= 0)}
          onClick={() => input.current?.click()}
          className="bg-gold-grad text-ink-ongold h-10 flex-[1.4] rounded-md text-[13px] font-bold disabled:opacity-45"
        >
          {upload.isPending ? "Отправляем…" : "Приложить скриншот"}
        </button>
      </div>
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

      {request.status === "sent" || request.status === "accepted" ? (
        <Box>
          <p className="text-ink text-[14px] font-bold">Заявка у менеджера</p>
          <p className="text-ink-2 text-[12.5px]">
            В часы кассы (12:00–03:00 МСК) обычно около 5 минут. Экран обновится сам.
          </p>
        </Box>
      ) : null}
      {request.status === "awaiting_payment" ? <PaymentBlock request={request} /> : null}
      {request.status === "paid" ? (
        <Box>
          <p className="text-ink text-[14px] font-bold">Скриншот получен — проверяем оплату</p>
          <a href={screenshotUrl(request.id)} target="_blank" rel="noreferrer">
            <img
              src={screenshotUrl(request.id)}
              alt="Скриншот оплаты"
              className="border-line mt-2 max-h-40 rounded-md border"
            />
          </a>
        </Box>
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
