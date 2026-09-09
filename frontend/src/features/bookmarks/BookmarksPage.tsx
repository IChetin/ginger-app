import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { BookmarkListItem } from "@/api/types/bookmarks";
import { BookmarkFlightRow } from "@/components/bookmarks/BookmarkFlightRow";
import { BookmarkSeriesRow } from "@/components/bookmarks/BookmarkSeriesRow";
import { BookmarksEmpty } from "@/components/bookmarks/BookmarksEmpty";
import { IntervalSheet } from "@/components/bookmarks/IntervalSheet";
import { UndoToast } from "@/components/bookmarks/UndoToast";
import { HeaderProfileButton } from "@/components/layout/HeaderProfileButton";
import { DemoBanner } from "@/demo/DemoBanner";
import {
  DEMO_BOOKMARK_LOGIN,
  GUEST_BOOKMARKS_BANNER,
} from "@/demo/bookmarks";
import { useDemo } from "@/demo/DemoContext";
import { AuthGate } from "@/features/auth/AuthGate";
import { useMe } from "@/features/auth/hooks";
import { useBookmarkListItems, useUpdateBookmark } from "@/features/bookmarks/hooks";
import { useDeferredBookmarkDelete } from "@/features/bookmarks/hooks/useDeferredBookmarkDelete";
import {
  isPastBookmarkItem,
  sortPastBookmarkListItems,
} from "@/features/bookmarks/lib/bookmarkDisplay";
import { DetailSkeleton, ErrorState } from "@/features/schedule/components/QueryState";

export function BookmarksPage() {
  const { data: user, isPending: authPending } = useMe();
  const { requestLogin } = useDemo();
  const list = useBookmarkListItems();
  const updateBookmark = useUpdateBookmark();
  const { pendingItem, scheduleDelete, undo } = useDeferredBookmarkDelete();
  const isDemoList = list.source === "demo";

  const [intervalItem, setIntervalItem] = useState<BookmarkListItem | null>(null);

  const blockWrite = () => {
    requestLogin(DEMO_BOOKMARK_LOGIN);
  };

  const upcoming = useMemo(
    () => list.items.filter((item) => !isPastBookmarkItem(item)),
    [list.items],
  );
  const past = useMemo(
    () => sortPastBookmarkListItems(list.items.filter((item) => isPastBookmarkItem(item))),
    [list.items],
  );
  const flights = useMemo(
    () => upcoming.filter((item) => item.target_type === "flight"),
    [upcoming],
  );
  const series = useMemo(
    () => upcoming.filter((item) => item.target_type === "series"),
    [upcoming],
  );

  const showIntervals = Boolean(user) || isDemoList;
  const showPendingNote = Boolean(user) || isDemoList;

  return (
    <div
      className="relative min-h-screen"
      data-testid="bookmarks-page"
      data-demo={isDemoList ? "true" : undefined}
    >
      <div className="border-line bg-bg/90 sticky top-0 z-20 border-b backdrop-blur-[14px]">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2.5">
          <h1 className="text-ink text-[23px] font-extrabold tracking-[-0.02em]">Закладки</h1>
          <div className="flex items-center gap-2">
          {user ? (
            <Link
              to="/notifications"
              className="text-gold text-[13px] font-bold"
              data-testid="bookmarks-all-notifications"
            >
              Все уведомления
            </Link>
          ) : (
            <Link
              to="/login"
              state={{ returnTo: "/notifications" }}
              className="text-gold text-[13px] font-bold"
              data-testid="bookmarks-all-notifications"
            >
              Все уведомления
            </Link>
          )}
          <HeaderProfileButton compact />
          </div>
        </div>
      </div>

      {isDemoList ? <DemoBanner /> : null}
      {list.source === "guest" && !list.isLoading ? (
        <DemoBanner message={GUEST_BOOKMARKS_BANNER} testId="guest-bookmarks-banner" />
      ) : null}

      {list.isLoading || authPending ? (
        <div className="px-4 pt-4">
          <DetailSkeleton />
        </div>
      ) : null}
      {list.isError ? (
        <div className="px-4 pt-4">
          <ErrorState
            message="Не удалось загрузить закладки"
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : null}
      {user && !list.isLoading && !list.isError && list.items.length === 0 ? (
        <BookmarksEmpty />
      ) : null}
      {!list.isLoading && !list.isError && list.items.length > 0 ? (
        <div className="pb-4">
          {flights.length > 0 ? (
            <section className="px-4 pt-[18px]">
              <h2 className="text-ink-3 mb-2.5 text-[13px] font-bold tracking-[0.06em] uppercase">
                Турниры
              </h2>
              <div className="flex flex-col gap-2.5">
                {flights.map((item) => (
                  <BookmarkFlightRow
                    key={item.key}
                    item={item}
                    showIntervals={showIntervals}
                    onOpenIntervals={() => {
                      if (isDemoList) {
                        blockWrite();
                        return;
                      }
                      setIntervalItem(item);
                    }}
                    onDisable={() => {
                      if (isDemoList) {
                        blockWrite();
                        return;
                      }
                      scheduleDelete(item);
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {series.length > 0 ? (
            <section className="px-4 pt-[18px]">
              <h2 className="text-ink-3 mb-2.5 text-[13px] font-bold tracking-[0.06em] uppercase">
                Серии
              </h2>
              <div className="flex flex-col gap-2.5">
                {series.map((item) => (
                  <BookmarkSeriesRow
                    key={item.key}
                    item={item}
                    showPendingNote={showPendingNote}
                    onDisable={() => {
                      if (isDemoList) {
                        blockWrite();
                        return;
                      }
                      scheduleDelete(item);
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {past.length > 0 ? (
            <section className="px-4 pt-[18px]" data-testid="bookmarks-past">
              <h2 className="text-ink-3 mb-2.5 text-[13px] font-bold tracking-[0.06em] uppercase">
                Прошедшие
              </h2>
              <div className="flex flex-col gap-2.5 opacity-60">
                {past.map((item) =>
                  item.target_type === "flight" ? (
                    <BookmarkFlightRow
                      key={item.key}
                      item={item}
                      showIntervals={false}
                      onDisable={() => {
                        if (isDemoList) {
                          blockWrite();
                          return;
                        }
                        scheduleDelete(item);
                      }}
                    />
                  ) : (
                    <BookmarkSeriesRow
                      key={item.key}
                      item={item}
                      showPendingNote={false}
                      onDisable={() => {
                        if (isDemoList) {
                          blockWrite();
                          return;
                        }
                        scheduleDelete(item);
                      }}
                    />
                  ),
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <IntervalSheet
        open={Boolean(intervalItem)}
        onOpenChange={(open) => {
          if (!open) {
            setIntervalItem(null);
          }
        }}
        offsets={intervalItem?.reminder_offsets ?? []}
        isSubmitting={updateBookmark.isPending}
        onSave={async (offsets) => {
          if (isDemoList) {
            blockWrite();
            return;
          }
          if (!intervalItem?.bookmarkId) {
            return;
          }
          await updateBookmark.mutateAsync({
            bookmarkId: intervalItem.bookmarkId,
            body: { reminder_offsets: offsets },
          });
          setIntervalItem(null);
        }}
      />

      <UndoToast open={Boolean(pendingItem)} onUndo={undo} />

      {!user && !authPending && !list.isLoading ? (
        <AuthGate
          icon={
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path d="M6 4h12v17l-6-4-6 4z" />
            </svg>
          }
          title="Напоминания о турнирах"
          description="Отметьте серию или турнир — напомним к старту и сообщим, если расписание изменится."
          returnTo="/bookmarks"
        />
      ) : null}
    </div>
  );
}
