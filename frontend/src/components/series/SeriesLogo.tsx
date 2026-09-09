import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  organizerName: string;
  logoUrl: string | null;
  posterUrl: string | null;
  abbrev: string;
  className?: string;
};

/**
 * 60×60 series tile: organizer logo → series poster → abbreviation fallback.
 */
export function SeriesLogo({ organizerName, logoUrl, posterUrl, abbrev, className }: Props) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  const logoOk = Boolean(logoUrl) && !failedUrls.has(logoUrl!);
  const posterOk = Boolean(posterUrl) && !failedUrls.has(posterUrl!);
  const src = logoOk ? logoUrl! : posterOk ? posterUrl! : null;
  const fit: "contain" | "cover" | null = logoOk ? "contain" : posterOk ? "cover" : null;

  const onError = () => {
    if (!src) return;
    setFailedUrls((prev) => new Set(prev).add(src));
  };

  return (
    <div
      className={cn(
        "border-line-strong text-gold flex h-[60px] w-[60px] shrink-0 items-center justify-center",
        "overflow-hidden rounded-[14px] border text-[14px] font-extrabold tracking-[0.04em]",
        "bg-[linear-gradient(140deg,var(--surface-3),var(--surface-2))]",
        className,
      )}
      aria-hidden={src ? undefined : true}
    >
      {src && fit ? (
        <img
          src={src}
          alt={organizerName}
          loading="lazy"
          width={60}
          height={60}
          onError={onError}
          className={cn(
            "h-full w-full",
            fit === "contain" && "bg-surface-3 object-contain p-1.5",
            fit === "cover" && "object-cover",
          )}
        />
      ) : (
        <span>{abbrev}</span>
      )}
    </div>
  );
}
