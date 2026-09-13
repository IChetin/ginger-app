import { Skeleton } from "@/components/ui/skeleton";

/** Заглушка страницы, пока проверяется сессия (AuthGuard, AdminGuard). */
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
