import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { adminScreenshotUrl, type ChipRequestAdmin } from "@/features/admin/chips/api";
import {
  useAdminChipRequest,
  useChipRequestAction,
  useRequisiteTemplates,
} from "@/features/admin/chips/hooks";
import { StatusBadge } from "@/features/chips/components/RequestRow";
import {
  formatDateMsk,
  formatMoney,
  formatNumber,
  formatRemaining,
  isOpen,
  statusLabel,
} from "@/features/chips/lib/format";
import { useNow } from "@/features/tournaments/hooks";

const primaryButton =
  "bg-gold-grad text-ink-ongold h-11 w-full rounded-md text-[15px] font-bold disabled:opacity-45";
const secondaryButton =
  "border-line-strong bg-surface-2 text-ink h-10 rounded-md border text-[13px] font-bold disabled:opacity-45";

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Не получилось — попробуйте ещё раз";
}

function RequisitesForm({
  onSend,
  pending,
}: {
  onSend: (vars: { templateId?: string; text?: string }) => void;
  pending: boolean;
}) {
  const templates = useRequisiteTemplates();
  const active = templates.data?.filter((template) => template.is_active) ?? [];
  const [text, setText] = useState("");

  return (
    <div className="border-line-gold bg-gold-soft mt-2 rounded-md border px-3 py-2.5">
      <p className="text-ink text-[14px] font-bold">Реквизиты игроку</p>
      <p className="text-ink-3 text-[11.5px]">
        После отправки у игрока 20 минут на оплату. Пуш уйдёт сразу.
      </p>
      {active.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {active.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={pending}
              onClick={() => onSend({ templateId: template.id })}
              className="border-line-strong bg-surface text-ink rounded-md border px-3 py-2 text-left disabled:opacity-45"
            >
              <span className="block text-[13px] font-bold">{template.title}</span>
              <span className="text-ink-3 block truncate text-[11.5px]">{template.body}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-ink-2 mt-1.5 text-[12px]">
          Шаблонов нет —{" "}
          <Link to="/admin/requisites" className="text-gold font-bold">
            завести
          </Link>{" "}
          или впишите текстом.
        </p>
      )}
      <textarea
        aria-label="Реквизиты текстом"
        placeholder="Или текстом: карта, банк, получатель"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        className="border-line-strong bg-surface mt-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
      />
      <button
        type="button"
        disabled={pending || !text.trim()}
        onClick={() => onSend({ text: text.trim() })}
        className={`${secondaryButton} mt-1.5 w-full`}
      >
        Отправить текст
      </button>
    </div>
  );
}

function RejectForm({
  onReject,
  pending,
}: {
  onReject: (comment: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-danger mt-3 h-10 w-full text-[14px] font-bold"
      >
        Отклонить
      </button>
    );
  }
  return (
    <div className="border-danger/35 bg-danger-soft mt-3 rounded-md border px-3 py-2.5">
      <label className="text-danger block text-[13px] font-bold">
        Причина — игрок увидит её в пуше
        <textarea
          aria-label="Причина отказа"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          autoFocus
          className="border-line-strong bg-surface text-ink mt-1 block w-full rounded-md border px-2.5 py-2 text-[14px] font-normal"
        />
      </label>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${secondaryButton} flex-1`}
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={pending || !comment.trim()}
          onClick={() => onReject(comment.trim())}
          className="bg-danger h-10 flex-1 rounded-md text-[13px] font-bold text-white disabled:opacity-45"
        >
          Отклонить заявку
        </button>
      </div>
    </div>
  );
}

function Actions({ request }: { request: ChipRequestAdmin }) {
  const action = useChipRequestAction(request.id);
  const now = useNow(1000);
  const depositTopup = request.kind === "topup" && request.player.kind === "deposit";
  const withdrawal = request.kind === "withdrawal";
  const completeLabel = withdrawal ? "Вывод отправлен" : "Фишки выданы";

  if (!isOpen(request.status)) return null;
  const remaining = request.payment_deadline_at
    ? new Date(request.payment_deadline_at).getTime() - now.getTime()
    : null;

  return (
    <section className="mt-3">
      {depositTopup && (request.status === "sent" || request.status === "accepted") ? (
        <RequisitesForm
          pending={action.isPending}
          onSend={(vars) => action.mutate({ type: "requisites", ...vars })}
        />
      ) : null}

      {!depositTopup && request.status === "sent" ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: "accept" })}
            className={`${secondaryButton} flex-1`}
          >
            Взять в работу
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: "complete" })}
            className="bg-gold-grad text-ink-ongold h-10 flex-[1.4] rounded-md text-[14px] font-bold disabled:opacity-45"
          >
            {completeLabel}
          </button>
        </div>
      ) : null}
      {!depositTopup && request.status === "accepted" ? (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => action.mutate({ type: "complete" })}
          className={primaryButton}
        >
          {completeLabel}
        </button>
      ) : null}

      {request.status === "awaiting_payment" ? (
        <div className="border-line bg-surface rounded-md border px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-ink text-[14px] font-bold">Ждём оплату</span>
            {remaining !== null ? (
              <span className="text-warn num text-[14px] font-extrabold">
                {remaining > 0 ? formatRemaining(remaining) : "время вышло"}
              </span>
            ) : null}
          </div>
          <pre className="text-ink-2 mt-1 font-sans text-[12.5px] whitespace-pre-wrap">
            {request.payment_requisites}
          </pre>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: "complete" })}
            className={`${secondaryButton} mt-2 w-full`}
          >
            Оплата пришла без скриншота — выдать
          </button>
        </div>
      ) : null}

      {request.status === "paid" ? (
        <div className="border-line-gold bg-gold-soft rounded-md border px-3 py-2.5">
          <p className="text-ink text-[14px] font-bold">Скриншот оплаты</p>
          <a href={adminScreenshotUrl(request.id)} target="_blank" rel="noreferrer">
            <img
              src={adminScreenshotUrl(request.id)}
              alt="Скриншот оплаты"
              className="border-line mt-1.5 max-h-72 rounded-md border"
            />
          </a>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: "complete" })}
            className={`${primaryButton} mt-2`}
          >
            Оплата пришла — {completeLabel.toLowerCase()}
          </button>
        </div>
      ) : null}

      <RejectForm
        pending={action.isPending}
        onReject={(comment) => action.mutate({ type: "reject", comment })}
      />
      {action.isError ? (
        <p role="alert" className="text-danger mt-1 text-[13px] font-semibold">
          {errorText(action.error)}
        </p>
      ) : null}
    </section>
  );
}

export function AdminChipRequestPage() {
  const { requestId = "" } = useParams();
  const query = useAdminChipRequest(requestId);

  if (query.isPending) {
    return <div className="bg-surface mx-3 mt-4 h-48 rounded-md" />;
  }
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-3 py-4">
        <p className="text-ink text-[15px] font-bold">Заявка не найдена</p>
        <Link to="/admin/chips" className="text-gold mt-2 inline-block text-[13px] font-bold">
          К очереди
        </Link>
      </div>
    );
  }

  const request = query.data;
  const withdrawal = request.kind === "withdrawal";

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-chip-request">
      <div className="flex items-center gap-2">
        <Link to="/admin/chips" className="text-gold text-[13px] font-bold">
          ← Очередь
        </Link>
        <span className="flex-1" />
        <StatusBadge status={request.status} kind={request.kind} />
      </div>
      <h1 className="mt-1 text-[18px] font-extrabold">
        {request.player.nickname}
        <span className="text-ink-3 ml-1.5 text-[12px] font-semibold">
          {request.player.kind === "deposit" ? "депозитный" : "кредитный"}
          {request.player.status !== "active" ? ` · ${request.player.status}` : ""}
        </span>
      </h1>
      <p className="text-ink-3 text-[12px]">
        {withdrawal ? "Вывод" : "Пополнение"} · {formatDateMsk(request.created_at)} МСК ·{" "}
        {request.player.email}
      </p>

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
              <span className="text-ink-3 block text-[11.5px] select-all">
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
      </div>

      {withdrawal && request.withdrawal_requisites ? (
        <div className="border-line bg-surface mt-2 rounded-md border px-3 py-2">
          <p className="text-ink-3 text-[12px] font-semibold">Куда выводить</p>
          <p className="text-ink text-[14px] whitespace-pre-wrap select-all">
            {request.withdrawal_requisites}
          </p>
        </div>
      ) : null}
      {request.status === "rejected" ? (
        <p className="text-danger mt-2 text-[13px]">Отказ: {request.reject_comment}</p>
      ) : null}

      <Actions request={request} />

      <details className="mt-4 text-[12px]">
        <summary className="text-ink-3 cursor-pointer font-bold">История заявки</summary>
        <ul className="text-ink-2 mt-1 space-y-0.5">
          {request.events.map((event, index) => (
            <li key={index}>
              {formatDateMsk(event.created_at)} · {statusLabel(event.to_status, request.kind)}
              {event.actor_nickname ? ` · ${event.actor_nickname}` : ""}
              {event.comment ? ` · «${event.comment}»` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
