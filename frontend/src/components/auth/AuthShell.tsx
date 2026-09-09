import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  children: ReactNode;
  onBack?: () => void;
  toast?: string | null;
};

export function AuthShell({ children, onBack, toast }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  // `key === "default"` means this is the first entry of the router history:
  // navigate(-1) would leave the app or do nothing (direct link, new tab).
  const goBack = () => {
    if (location.key === "default") {
      navigate("/", { replace: true });
      return;
    }
    navigate(-1);
  };

  return (
    <div className="bg-stage text-ink flex min-h-screen justify-center" data-mobile-shell-outer>
      <div
        data-mobile-shell
        className="bg-bg relative flex min-h-screen w-full max-w-[420px] flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center py-3.5">
          <button
            type="button"
            aria-label="Назад"
            className="bg-surface-2 text-ink-2 inline-flex h-[38px] min-h-11 w-[38px] min-w-11 items-center justify-center rounded-md"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
              goBack();
            }}
          >
            <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        </div>

        <div className="mt-7 mb-1.5 inline-flex items-center gap-1.5 text-[26px] font-extrabold tracking-[-0.02em]">
          Day
          <span className="bg-gold-grad text-ink-ongold shadow-sheen inline-flex h-[34px] w-[34px] -rotate-[4deg] items-center justify-center rounded-[10px] text-xl font-extrabold">
            2
          </span>
        </div>

        {children}

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className="border-line-strong bg-surface-2 text-ink fixed bottom-6 left-1/2 z-40 w-[calc(100%-40px)] max-w-[380px] -translate-x-1/2 rounded-md border px-4 py-3 text-center text-sm font-semibold"
            data-testid="auth-toast"
          >
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
