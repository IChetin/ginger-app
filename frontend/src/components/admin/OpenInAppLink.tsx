import { cn } from "@/lib/utils";

const iconClass =
  "size-[18px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  href: string;
  className?: string;
};

/** Public app surface in a new tab — keeps admin edit context. */
export function OpenInAppLink({ href, className }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title="Открыть в приложении"
      aria-label="Открыть в приложении"
      className={cn(
        "border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex size-[38px] items-center justify-center rounded-[10px] border bg-transparent",
        className,
      )}
    >
      <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 14v5H5V6h5" />
      </svg>
    </a>
  );
}
