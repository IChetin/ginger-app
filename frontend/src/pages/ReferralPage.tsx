import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { renderSVG } from "uqr";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useReferral, useRotateReferral } from "@/features/chips/hooks";

/**
 * «Пригласить друга» (лояльность E5): один экран на два сценария.
 * Лицом к лицу — крупный QR, друг наводит камеру. Онлайн — «Поделиться ссылкой».
 */
export function ReferralPage() {
  const referral = useReferral();
  const rotate = useRotateReferral();
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);

  const url = referral.data ? `${window.location.origin}${referral.data.path}` : "";
  const qr = useMemo(
    () => (url ? renderSVG(url, { border: 2, whiteColor: "#ffffff", blackColor: "#1b1712" }) : ""),
    [url],
  );

  const share = async () => {
    const text = "Заходи в Ginger — фишки, турниры и связь с менеджером";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Ginger", text, url });
        return;
      } catch {
        // закрыл окно «Поделиться» — просто копируем
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const reissue = async () => {
    const ok = await confirm({
      title: "Перевыпустить ссылку?",
      description:
        "Старая ссылка и QR перестанут работать. Уже зарегистрированные друзья останутся за вами.",
      confirmLabel: "Перевыпустить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (ok) rotate.mutate();
  };

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="referral-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/more" className="text-gold text-[13px] font-bold">
          ← Ещё
        </Link>
      </header>
      <h1 className="text-[20px] font-extrabold tracking-tight">Пригласить друга</h1>
      <p className="text-ink-2 text-[13px]">
        Друг регистрируется по вашей ссылке сам — без одобрения. Вы закрепляетесь за ним навсегда.
      </p>

      {referral.isPending ? <div className="bg-surface mt-3 h-72 rounded-md" /> : null}
      {referral.isError ? (
        <p role="alert" className="text-danger mt-3 text-[13px] font-semibold">
          Ссылка недоступна. Если аккаунт заблокирован — напишите менеджеру.
        </p>
      ) : null}

      {referral.data ? (
        <>
          <div className="border-line bg-surface mt-3 flex flex-col items-center rounded-md border px-3 py-4">
            <div
              data-testid="referral-qr"
              aria-label="QR-код ссылки-приглашения"
              role="img"
              className="w-[min(240px,70vw)] overflow-hidden rounded-md bg-white [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="text-ink-3 mt-2 text-[12px]">Покажите экран — друг наведёт камеру</p>
            <p className="text-ink mt-1 text-[13px] font-semibold break-all select-all">{url}</p>
          </div>

          {referral.data.paused ? (
            <p className="border-danger/35 bg-danger-soft text-danger mt-2 rounded-md border px-3 py-2 text-[13px] font-semibold">
              Ссылка приостановлена: за сутки по ней {referral.data.registrations_24h} регистраций
              при лимите {referral.data.daily_limit}. Перевыпустите её, если она утекла.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void share()}
            className="bg-gold-grad text-ink-ongold mt-3 h-12 w-full rounded-md text-[15px] font-bold"
          >
            {copied ? "Ссылка скопирована" : "Поделиться ссылкой"}
          </button>

          <div className="text-ink-2 mt-3 flex items-center justify-between text-[13px]">
            <span>
              Пришло по ссылке: <b className="text-ink num">{referral.data.invited_total}</b>
            </span>
            <button
              type="button"
              disabled={rotate.isPending}
              onClick={() => void reissue()}
              className="text-ink-3 font-bold disabled:opacity-45"
            >
              Перевыпустить
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
