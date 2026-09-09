import { useState } from "react";

import { ReminderOffsetsDialog } from "@/features/bookmarks/components/ReminderOffsetsDialog";
import {
  isOptimisticBookmarkId,
  useBookmarkTarget,
  useCreateBookmark,
  useDeleteBookmark,
  usePutGuestBookmark,
  useRemoveGuestBookmark,
} from "@/features/bookmarks/hooks";
import { DEFAULT_REMINDER_OFFSETS } from "@/features/bookmarks/lib/reminderPresets";
import { useMe } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";

const iconClass =
  "h-[18px] w-[18px] stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  flightId: string;
  disabled?: boolean;
  /** Shown as the tooltip/label when the flight already started. */
  disabledReason?: string;
  className?: string;
  /**
   * `dialog` (default) — SeriesPage UX: pick offsets in a dialog.
   * `inline` — EventPage: create with default offsets, settings shown separately.
   */
  mode?: "dialog" | "inline";
  onBookmarkChange?: (bookmarked: boolean) => void;
};

/** Flight reminder bell — real guest/server bookmark integration, Day2 styling. */
export function ReminderBell({
  flightId,
  disabled = false,
  disabledReason,
  className,
  mode = "dialog",
  onBookmarkChange,
}: Props) {
  const { data: user, isLoading: authLoading } = useMe();
  const { isBookmarked, bookmark } = useBookmarkTarget("flight", flightId);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const putGuestBookmark = usePutGuestBookmark();
  const removeGuestBookmark = useRemoveGuestBookmark();

  const [dialogOpen, setDialogOpen] = useState(false);

  const isPending =
    createBookmark.isPending ||
    deleteBookmark.isPending ||
    putGuestBookmark.isPending ||
    removeGuestBookmark.isPending ||
    authLoading;

  const defaultOffsets = user?.default_reminder_offsets ?? DEFAULT_REMINDER_OFFSETS;

  const handleRemove = async () => {
    if (user) {
      if (!bookmark || isOptimisticBookmarkId(bookmark.id)) {
        return;
      }
      await deleteBookmark.mutateAsync(bookmark.id);
      onBookmarkChange?.(false);
      return;
    }
    await removeGuestBookmark.mutateAsync({ targetType: "flight", targetId: flightId });
    onBookmarkChange?.(false);
  };

  const handleCreate = async (reminderOffsets?: number[]) => {
    const offsets = reminderOffsets ?? defaultOffsets;
    if (user) {
      await createBookmark.mutateAsync({
        target_type: "flight",
        target_id: flightId,
        reminder_offsets: offsets,
      });
      setDialogOpen(false);
      onBookmarkChange?.(true);
      return;
    }
    await putGuestBookmark.mutateAsync({
      target_type: "flight",
      target_id: flightId,
      reminder_offsets: offsets,
      created_at: new Date().toISOString(),
    });
    setDialogOpen(false);
    onBookmarkChange?.(true);
  };

  const handleClick = async () => {
    if (disabled || isPending) {
      return;
    }
    if (isBookmarked) {
      await handleRemove();
      return;
    }
    if (mode === "inline") {
      await handleCreate(defaultOffsets);
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label={
          disabled
            ? (disabledReason ?? "Напоминание недоступно")
            : isBookmarked
              ? "Напоминание включено"
              : "Напомнить"
        }
        aria-pressed={isBookmarked}
        disabled={disabled || isPending}
        title={disabled ? disabledReason : undefined}
        className={cn(
          "inline-flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-md",
          "bg-surface-2 text-ink-2 disabled:cursor-not-allowed disabled:opacity-50",
          isBookmarked && !disabled && "bg-gold-soft text-gold",
          className,
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleClick();
        }}
      >
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z"
            fill={isBookmarked && !disabled ? "currentColor" : "none"}
          />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      </button>

      {mode === "dialog" ? (
        <ReminderOffsetsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultOffsets={defaultOffsets}
          isSubmitting={createBookmark.isPending || putGuestBookmark.isPending}
          onSubmit={handleCreate}
        />
      ) : null}
    </>
  );
}
