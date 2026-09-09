import { BellIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/features/bookmarks/hooks";
import { isPushSupported, usePushSubscription, useSubscribePush } from "@/features/push/hooks";
import { pushErrorMessage } from "@/features/push/lib/pushErrorMessage";

const DISMISS_STORAGE_KEY = "day2-push-banner-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

export function EnableRemindersBanner() {
  const { data: bookmarks } = useBookmarks();
  const pushSubscription = usePushSubscription();
  const subscribePush = useSubscribePush();
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const hasServerBookmark = (bookmarks?.length ?? 0) > 0;
  const hasPushSubscription = Boolean(pushSubscription.data);
  const visible =
    isPushSupported() &&
    hasServerBookmark &&
    !hasPushSubscription &&
    !dismissed &&
    !pushSubscription.isLoading;

  if (!visible) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-sky-900/60 bg-sky-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="font-medium text-sky-100">Push-напоминания</p>
        <p className="text-sm text-slate-300">
          Включите уведомления, чтобы получать напоминания о закладках вовремя.
        </p>
      </div>
      {subscribePush.error ? (
        <p className="text-sm text-rose-300" data-testid="push-banner-error">
          {pushErrorMessage(subscribePush.error)}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => void subscribePush.mutateAsync().catch(() => undefined)}
          disabled={subscribePush.isPending}
        >
          <BellIcon />
          Включить напоминания
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="px-2"
          aria-label="Скрыть"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
