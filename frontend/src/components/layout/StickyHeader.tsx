import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Высота компактной строки шапки (без safe-area). */
export const STICKY_HEADER_COMPACT_PX = 52;

/**
 * CSS `top` для второго липкого слоя (лента дней, день в PDF-расписании).
 * `--sticky-h` — фактическая высота шапки; fallback, пока ResizeObserver не отработал.
 */
export const STICKY_BELOW_HEADER_TOP =
  "var(--sticky-h, calc(3.25rem + env(safe-area-inset-top, 0px)))" as const;

/** Сжимать, когда ушли ниже этой отметки. */
const COMPACT_AFTER_Y = 80;
/** Разворачивать только когда вернулись выше этой отметки (гистерезис, не то же значение). */
const EXPAND_BEFORE_Y = 40;

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

const backBtnClass =
  "bg-surface-2 text-ink-2 inline-flex h-[38px] min-h-11 w-[38px] min-w-11 shrink-0 items-center justify-center rounded-md";

type Props = {
  /** Заголовок в компактной строке (и в полном виде, если нет expandedContent / titleInExpanded). */
  title?: ReactNode;
  /** Подзаголовок — только в полном виде. */
  subtitle?: ReactNode;
  /** Контент вместо title/subtitle в полном виде (крошка серии и т.п.). Скрывается при сжатии. */
  expandedContent?: ReactNode;
  /** Показывать title в полном виде. false — только в компактном (страница серии). */
  titleInExpanded?: boolean;
  actions?: ReactNode;
  /** Доп. классы колонки заголовка (например min-w-[80px] в реплеере). */
  titleClassName?: string;
  /** Если задан — в компактном режиме вместо actions. */
  compactActions?: ReactNode;
  showBack?: boolean;
  /** Иконка слева: стрелка назад или крестик закрытия. */
  backKind?: "back" | "close";
  backAriaLabel?: string;
  backFallback?: string;
  onBack?: () => void;
  /** Компактный режим при скролле. false для изначально узких шапок. */
  compactible?: boolean;
  /** Всегда компактная строка — для экранов без скролла. */
  forceCompact?: boolean;
  className?: string;
  /** Строка под основной (вкладки админки и т.п.) — липнет вместе с шапкой. */
  footer?: ReactNode;
  /** Заменяет блок title/subtitle (поле поиска). */
  children?: ReactNode;
};

export function StickyHeader({
  title,
  subtitle,
  expandedContent,
  titleInExpanded = true,
  actions,
  titleClassName,
  compactActions,
  showBack = true,
  backKind = "back",
  backAriaLabel,
  backFallback = "/",
  onBack,
  compactible = true,
  forceCompact = false,
  className,
  footer,
  children,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      root.style.setProperty("--sticky-h", `${height}px`);
    };
    publish();
    if (typeof ResizeObserver === "undefined") {
      return () => root.style.removeProperty("--sticky-h");
    }
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sticky-h");
    };
  }, [compact, footer, compactible]);

  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 0);
      if (!compactible) {
        setCompact(false);
        return;
      }
      setCompact((was) => {
        if (y < EXPAND_BEFORE_Y) return false;
        if (y > COMPACT_AFTER_Y) return true;
        return was;
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [compactible]);

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (location.key === "default") {
      navigate(backFallback, { replace: true });
      return;
    }
    navigate(-1);
  };

  const isCompact = forceCompact || (compactible && compact);
  const showExpandedBlock = !isCompact && (expandedContent != null || subtitle != null);
  const showTitle = title != null && (isCompact || (titleInExpanded && expandedContent == null));
  const resolvedActions = isCompact && compactActions !== undefined ? compactActions : actions;

  return (
    <header
      ref={headerRef}
      data-testid="sticky-header"
      data-compact={isCompact ? "true" : "false"}
      className={cn(
        "sticky top-0 z-20",
        "bg-bg/88 backdrop-blur-[14px]",
        "pt-[env(safe-area-inset-top,0px)]",
        scrolled && "border-line border-b",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-4",
          isCompact ? "h-[52px] py-0" : "min-h-[52px] py-3",
        )}
      >
        {showBack ? (
          <button
            type="button"
            aria-label={backAriaLabel ?? (backKind === "close" ? "Закрыть" : "Назад")}
            className={backBtnClass}
            onClick={goBack}
          >
            <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
              {backKind === "close" ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M15 5l-7 7 7 7" />
              )}
            </svg>
          </button>
        ) : null}

        {children ? (
          <div
            data-testid="sticky-header-title"
            className={cn("min-w-0 flex-1 overflow-hidden", titleClassName)}
          >
            {children}
          </div>
        ) : (
          <div
            data-testid="sticky-header-title"
            className={cn("min-w-0 flex-1 overflow-hidden", titleClassName)}
          >
            {showExpandedBlock ? (
              <div className="min-w-0">
                {expandedContent != null ? (
                  expandedContent
                ) : (
                  <>
                    {subtitle != null ? (
                      <div className="text-ink-3 truncate text-[11px] font-bold tracking-wide uppercase">
                        {subtitle}
                      </div>
                    ) : null}
                    {showTitle ? (
                      <div className="truncate text-[17px] font-extrabold">{title}</div>
                    ) : null}
                  </>
                )}
              </div>
            ) : showTitle ? (
              <div
                className={cn(
                  "min-w-0 font-extrabold",
                  isCompact ? "text-[15px]" : "text-[17px]",
                  typeof title === "string" && "truncate",
                )}
              >
                {title}
              </div>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
          </div>
        )}

        {resolvedActions != null ? (
          <div className="flex shrink-0 items-center gap-2">{resolvedActions}</div>
        ) : null}
      </div>
      {footer}
    </header>
  );
}
