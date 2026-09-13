import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Drawer } from "@base-ui/react/drawer";
import { AlertTriangle, CircleHelp } from "lucide-react";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "danger" | "default";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Если задан — кнопка действия показывает loading, пока промис не завершится. */
  onConfirm?: () => void | Promise<void>;
};

export type PromptOptions = {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "number";
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

type ConfirmRequest = {
  kind: "confirm";
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
  reject: (reason?: unknown) => void;
};

type PromptRequest = {
  kind: "prompt";
  options: PromptOptions;
  resolve: (value: string | null) => void;
};

type DialogRequest = ConfirmRequest | PromptRequest;

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const preferred =
      root.querySelector<HTMLElement>("[data-confirm-input]") ??
      root.querySelector<HTMLElement>("[data-confirm-cancel]");
    preferred?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}

function DialogIcon({ variant }: { variant: ConfirmVariant }) {
  const Icon = variant === "danger" ? AlertTriangle : CircleHelp;
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[12px]",
        variant === "danger" ? "bg-danger-soft text-danger" : "bg-gold-soft text-gold",
      )}
      aria-hidden
    >
      <Icon className="size-5" strokeWidth={2} />
    </span>
  );
}

function ActionButton({
  variant,
  loading,
  disabled,
  children,
  onClick,
  className,
}: {
  variant: ConfirmVariant;
  loading: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-confirm-action=""
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "flex h-[50px] items-center justify-center rounded-md text-[15px] font-extrabold transition-opacity disabled:opacity-60",
        "motion-reduce:transition-none",
        variant === "danger"
          ? "border-danger text-danger border bg-transparent"
          : "bg-gold-grad text-ink-ongold shadow-sheen",
        className,
      )}
    >
      {loading ? "Подождите…" : children}
    </button>
  );
}

function CancelButton({
  disabled,
  children,
  onClick,
  className,
}: {
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-confirm-cancel=""
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-ink-2 flex h-[50px] items-center justify-center rounded-md text-[15px] font-bold transition-colors",
        "hover:bg-gold-soft disabled:opacity-60 motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

type FooterButtons = {
  cancel: ReactNode;
  action: ReactNode;
};

type ShellProps = {
  open: boolean;
  title: string;
  description?: string;
  titleId: string;
  descriptionId: string;
  variant: ConfirmVariant;
  loading: boolean;
  onDismiss: () => void;
  children?: ReactNode;
  buttons: FooterButtons;
};

function DialogShell({
  open,
  title,
  description,
  titleId,
  descriptionId,
  variant,
  loading,
  onDismiss,
  children,
  buttons,
}: ShellProps) {
  const isDesktop = useIsDesktop(640);
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open && isDesktop);
  useFocusTrap(panelRef, open && isDesktop);

  useEffect(() => {
    if (!open || loading || !isDesktop) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onDismiss, isDesktop]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const header = (
    <div className="flex items-start gap-3">
      <DialogIcon variant={variant} />
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-ink text-[18px] leading-tight font-extrabold">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="text-ink-2 mt-1.5 text-[14px] leading-snug">
            {description}
          </p>
        ) : (
          <span id={descriptionId} className="sr-only">
            {title}
          </span>
        )}
      </div>
    </div>
  );

  const footer = (
    <div className={cn("mt-5 gap-2.5", isDesktop ? "flex justify-end" : "flex flex-col")}>
      {isDesktop ? (
        <>
          {buttons.cancel}
          {buttons.action}
        </>
      ) : (
        <>
          {buttons.action}
          {buttons.cancel}
        </>
      )}
    </div>
  );

  if (isDesktop) {
    return createPortal(
      <div className="fixed inset-0 z-[100]" data-testid="confirm-dialog-desktop">
        <button
          type="button"
          aria-label="Закрыть"
          className="absolute inset-0 bg-black/60"
          disabled={loading}
          onClick={() => {
            if (!loading) onDismiss();
          }}
        />
        <div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            "border-line-strong bg-surface absolute top-1/2 left-1/2 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border p-5",
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
          )}
        >
          {header}
          {children}
          {footer}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) {
          onDismiss();
        }
      }}
      modal
      disablePointerDismissal={loading}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-[100] bg-black/60" />
        <Drawer.Viewport className="fixed inset-0 z-[100] flex items-end justify-center">
          <Drawer.Popup
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initialFocus={(openType) => {
              if (
                openType === "keyboard" ||
                openType === "mouse" ||
                openType === "touch" ||
                openType === "pen"
              ) {
                const root = document.querySelector<HTMLElement>(
                  '[data-testid="confirm-dialog-mobile"]',
                );
                return (
                  root?.querySelector<HTMLElement>("[data-confirm-input]") ??
                  root?.querySelector<HTMLElement>("[data-confirm-cancel]") ??
                  true
                );
              }
              return true;
            }}
            className={cn(
              "border-line-strong bg-surface w-full max-w-[420px] rounded-t-[20px] border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none",
              "motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none",
            )}
            data-testid="confirm-dialog-mobile"
          >
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            {header}
            {children}
            {footer}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>,
    document.body,
  );
}

function ConfirmView({ request, onSettled }: { request: ConfirmRequest; onSettled: () => void }) {
  const { options, resolve, reject } = request;
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const variant = options.variant ?? "default";
  const confirmLabel = options.confirmLabel ?? "Подтвердить";
  const cancelLabel = options.cancelLabel ?? "Отмена";

  const finish = useCallback(
    (value: boolean) => {
      resolve(value);
      onSettled();
    },
    [onSettled, resolve],
  );

  const fail = useCallback(
    (error: unknown) => {
      reject(error);
      onSettled();
    },
    [onSettled, reject],
  );

  const handleCancel = useCallback(() => {
    if (loading) return;
    finish(false);
  }, [finish, loading]);

  const handleConfirm = useCallback(() => {
    if (loading) return;
    if (!options.onConfirm) {
      finish(true);
      return;
    }
    setLoading(true);
    void Promise.resolve()
      .then(() => options.onConfirm?.())
      .then(() => finish(true))
      .catch((error: unknown) => fail(error));
  }, [fail, finish, loading, options]);

  return (
    <DialogShell
      open
      title={options.title}
      description={options.description}
      titleId={titleId}
      descriptionId={descriptionId}
      variant={variant}
      loading={loading}
      onDismiss={handleCancel}
      buttons={{
        cancel: (
          <CancelButton
            disabled={loading}
            onClick={handleCancel}
            className="w-full min-w-[100px] px-4 sm:w-auto"
          >
            {cancelLabel}
          </CancelButton>
        ),
        action: (
          <ActionButton
            variant={variant}
            loading={loading}
            onClick={handleConfirm}
            className="w-full min-w-[120px] px-5 sm:w-auto"
          >
            {confirmLabel}
          </ActionButton>
        ),
      }}
    />
  );
}

function PromptView({ request, onSettled }: { request: PromptRequest; onSettled: () => void }) {
  const { options, resolve } = request;
  const [value, setValue] = useState(options.defaultValue ?? "");
  const titleId = useId();
  const descriptionId = useId();
  const confirmLabel = options.confirmLabel ?? "ОК";
  const cancelLabel = options.cancelLabel ?? "Отмена";

  const finish = useCallback(
    (next: string | null) => {
      resolve(next);
      onSettled();
    },
    [onSettled, resolve],
  );

  const handleCancel = useCallback(() => finish(null), [finish]);

  const handleConfirm = useCallback(() => {
    finish(value);
  }, [finish, value]);

  return (
    <DialogShell
      open
      title={options.title}
      description={options.description}
      titleId={titleId}
      descriptionId={descriptionId}
      variant="default"
      loading={false}
      onDismiss={handleCancel}
      buttons={{
        cancel: (
          <CancelButton onClick={handleCancel} className="w-full min-w-[100px] px-4 sm:w-auto">
            {cancelLabel}
          </CancelButton>
        ),
        action: (
          <ActionButton
            variant="default"
            loading={false}
            onClick={handleConfirm}
            className="w-full min-w-[120px] px-5 sm:w-auto"
          >
            {confirmLabel}
          </ActionButton>
        ),
      }}
    >
      <input
        data-confirm-input=""
        type={options.inputType ?? "text"}
        inputMode={options.inputMode}
        value={value}
        placeholder={options.placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleConfirm();
          }
        }}
        className="tracker-input mt-4"
      />
    </DialogShell>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const requestRef = useRef<DialogRequest | null>(null);

  const clear = useCallback(() => {
    requestRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve, reject) => {
      if (requestRef.current) {
        if (requestRef.current.kind === "confirm") {
          requestRef.current.resolve(false);
        } else {
          requestRef.current.resolve(null);
        }
      }
      const next: ConfirmRequest = { kind: "confirm", options, resolve, reject };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      if (requestRef.current) {
        if (requestRef.current.kind === "confirm") {
          requestRef.current.resolve(false);
        } else {
          requestRef.current.resolve(null);
        }
      }
      const next: PromptRequest = { kind: "prompt", options, resolve };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {request?.kind === "confirm" ? <ConfirmView request={request} onSettled={clear} /> : null}
      {request?.kind === "prompt" ? <PromptView request={request} onSettled={clear} /> : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}

export function usePrompt(): (options: PromptOptions) => Promise<string | null> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("usePrompt must be used within ConfirmProvider");
  }
  return ctx.prompt;
}
