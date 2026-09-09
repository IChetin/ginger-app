import { useMutation, useQueryClient } from "@tanstack/react-query";

import { migrateBookmarks } from "@/features/bookmarks/api";
import {
  deleteGuestBookmark,
  getAllGuestBookmarks,
} from "@/features/bookmarks/lib/guestBookmarksIdb";
import { bookmarkKeys, guestBookmarkKeys } from "@/features/bookmarks/queryKeys";

export function useMigrateGuestBookmarks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const items = await getAllGuestBookmarks();
      if (items.length === 0) {
        return null;
      }

      const response = await migrateBookmarks({
        items: items.map((item) => ({
          target_type: item.target_type,
          target_id: item.target_id,
          reminder_offsets: item.reminder_offsets,
        })),
      });

      const migratedKeys = new Set(
        response.items.map((item) => `${item.target_type}:${item.target_id}`),
      );

      await Promise.all(
        items
          .filter((item) => migratedKeys.has(`${item.target_type}:${item.target_id}`))
          .map((item) => deleteGuestBookmark(item.target_type, item.target_id)),
      );

      return response;
    },
    onSuccess: async (data) => {
      if (data) {
        await queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
        await queryClient.invalidateQueries({ queryKey: guestBookmarkKeys.all });
      }
    },
  });
}
