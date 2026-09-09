import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function FeedSkeleton() {
  return (
    <div className="space-y-3" data-testid="feed-skeleton">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="detail-skeleton">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-3" data-testid="calendar-skeleton">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-4 py-10 text-center"
      data-testid="empty-state"
    >
      <p className="text-base font-medium text-slate-100">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-6 text-center",
        className,
      )}
      data-testid="error-state"
    >
      <p className="text-sm text-rose-200">{message}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
