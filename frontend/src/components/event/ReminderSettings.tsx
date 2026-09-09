import type { FlightRead } from "@/api/types/schedule";
import { ReminderOffsetChips } from "@/components/bookmarks/ReminderOffsetChips";
import { useMe } from "@/features/auth/hooks";
import {
  isOptimisticBookmarkId,
  useBookmarkTarget,
  usePutGuestBookmark,
  useUpdateBookmark,
} from "@/features/bookmarks/hooks";
import type { ReminderPresetOffset } from "@/features/bookmarks/lib/reminderPresets";

type Props = {
  flight: FlightRead;
};

export function ReminderSettings({ flight }: Props) {
  const { data: user } = useMe();
  const { isBookmarked, bookmark, reminderOffsets, createdAt } = useBookmarkTarget(
    "flight",
    flight.id,
  );
  const updateBookmark = useUpdateBookmark();
  const putGuestBookmark = usePutGuestBookmark();

  if (!isBookmarked) {
    return null;
  }

  const flightTitle = flight.label ?? "старт";

  const persist = async (next: number[]) => {
    if (next.length === 0) {
      return;
    }
    if (user) {
      if (!bookmark || isOptimisticBookmarkId(bookmark.id)) {
        return;
      }
      await updateBookmark.mutateAsync({
        bookmarkId: bookmark.id,
        body: { reminder_offsets: next },
      });
      return;
    }
    await putGuestBookmark.mutateAsync({
      target_type: "flight",
      target_id: flight.id,
      reminder_offsets: next,
      created_at: createdAt ?? new Date().toISOString(),
    });
  };

  const toggleOffset = (offset: ReminderPresetOffset) => {
    const has = reminderOffsets.includes(offset);
    if (has && reminderOffsets.length === 1) {
      return;
    }
    const next = has
      ? reminderOffsets.filter((value) => value !== offset)
      : [...reminderOffsets, offset].sort((a, b) => a - b);
    void persist(next);
  };

  return (
    <div
      className="border-line-gold bg-surface mt-3 rounded-md border p-3.5"
      data-testid="reminder-settings"
    >
      <div className="text-ink-2 text-[13px] font-bold">Напомним о {flightTitle}</div>
      <ReminderOffsetChips
        className="mt-2.5"
        offsets={reminderOffsets}
        disabled={putGuestBookmark.isPending || updateBookmark.isPending}
        onToggle={toggleOffset}
      />
    </div>
  );
}
