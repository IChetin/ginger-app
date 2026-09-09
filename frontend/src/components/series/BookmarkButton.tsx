import { useState } from "react";

import type { BookmarkTargetType } from "@/api/types/bookmarks";
import { ReminderOffsetsDialog } from "@/features/bookmarks/components/ReminderOffsetsDialog";
import {
  isOptimisticBookmarkId,
  useBookmarkTarget,
  useCreateBookmark,
  useDeleteBookmark,
  usePutGuestBookmark,
  useRemoveGuestBookmark,
} from "@/features/bookmarks/hooks";
import { useMe } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";

const iconClass =
  "h-5 w-5 stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  targetType: BookmarkTargetType;
  targetId: string;
  className?: string;
  /** Icon-only (default) or primary text CTA for series page. */
  variant?: "icon" | "cta";
  askOffsetsForFlight?: boolean;
  /** Set for targets that already happened: blocks the button and explains why. */
  disabledReason?: string;
};

/**
 * Day2 bookmark control with real guest/server integration (stage 5).
 */
export function BookmarkButton({
  targetType,
  targetId,
  className,
  variant = "icon",
  askOffsetsForFlight = true,
  disabledReason,
}: Props) {
  const { data: user, isLoading: authLoading } = useMe();
  const { isBookmarked, bookmark } = useBookmarkTarget(targetType, targetId);
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

  const handleRemove = async () => {
    if (user) {
      if (!bookmark || isOptimisticBookmarkId(bookmark.id)) {
        return;
      }
      await deleteBookmark.mutateAsync(bookmark.id);
      return;
    }
    await removeGuestBookmark.mutateAsync({ targetType, targetId });
  };

  const handleCreate = async (reminderOffsets?: number[]) => {
    if (user) {
      await createBookmark.mutateAsync({
        target_type: targetType,
        target_id: targetId,
        reminder_offsets: targetType === "flight" ? reminderOffsets : [],
      });
      setDialogOpen(false);
      return;
    }
    await putGuestBookmark.mutateAsync({
      target_type: targetType,
      target_id: targetId,
      reminder_offsets: targetType === "flight" ? (reminderOffsets ?? []) : [],
      created_at: new Date().toISOString(),
    });
    setDialogOpen(false);
  };

  const handleClick = async () => {
    if (isPending || disabledReason) {
      return;
    }
    if (isBookmarked) {
      await handleRemove();
      return;
    }
    if (targetType === "flight" && askOffsetsForFlight) {
      setDialogOpen(true);
      return;
    }
    await handleCreate([]);
  };

  const dialogSubmitting = createBookmark.isPending || putGuestBookmark.isPending;

  if (variant === "cta") {
    return (
      <>
        <button
          type="button"
          disabled={isPending || Boolean(disabledReason)}
          title={disabledReason}
          className={cn(
            "inline-flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-5",
            "bg-gold-grad text-ink-ongold shadow-gold text-[15px] font-extrabold",
            "disabled:opacity-60",
            className,
          )}
          onClick={() => void handleClick()}
        >
          {disabledReason
            ? "Серия завершена"
            : isBookmarked
              ? "Серия в закладках"
              : "В закладки"}
        </button>
        {targetType === "flight" && askOffsetsForFlight ? (
          <ReminderOffsetsDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            defaultOffsets={user?.default_reminder_offsets}
            isSubmitting={dialogSubmitting}
            onSubmit={handleCreate}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={disabledReason ?? (isBookmarked ? "Убрать из закладок" : "В закладки")}
        aria-pressed={isBookmarked}
        disabled={isPending || Boolean(disabledReason)}
        title={disabledReason}
        className={cn(
          "inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-md",
          "bg-glass text-ink backdrop-blur-[6px] disabled:cursor-not-allowed disabled:opacity-60",
          isBookmarked && "text-gold",
          className,
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleClick();
        }}
      >
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4h12v17l-6-4-6 4z" fill={isBookmarked ? "currentColor" : "none"} />
        </svg>
      </button>

      {targetType === "flight" && askOffsetsForFlight ? (
        <ReminderOffsetsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultOffsets={user?.default_reminder_offsets}
          isSubmitting={dialogSubmitting}
          onSubmit={handleCreate}
        />
      ) : null}
    </>
  );
}
