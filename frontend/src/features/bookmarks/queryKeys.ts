export const bookmarkKeys = {
  all: ["bookmarks"] as const,
  list: () => [...bookmarkKeys.all, "list"] as const,
  overview: () => [...bookmarkKeys.all, "overview"] as const,
};

export const guestBookmarkKeys = {
  all: ["guest-bookmarks"] as const,
  list: () => [...guestBookmarkKeys.all, "list"] as const,
  overview: () => [...guestBookmarkKeys.all, "overview"] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  history: (days: number) => [...notificationKeys.all, "history", days] as const,
};
