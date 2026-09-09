import { ApiError } from "@/api/client";
import type { NotificationPreviewResponse } from "@/api/types/notifications";

export function isPreviewTokenError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "preview_stale" || error.code === "preview_invalid")
  );
}

export function previewTokenErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "preview_stale") {
      return "Превью устарело. Запросите превью ещё раз перед сохранением.";
    }
    if (error.code === "preview_invalid") {
      return "Токен превью недействителен. Запросите превью ещё раз.";
    }
    return error.message;
  }
  return "Не удалось сохранить изменения";
}

/**
 * Always preview first. If confirmation is not required, auto-save with the token.
 * Otherwise expose the preview to the caller for a confirmation dialog.
 */
export async function runPreviewSave(options: {
  preview: () => Promise<NotificationPreviewResponse>;
  save: (previewToken: string) => Promise<unknown>;
  onNeedsConfirmation: (preview: NotificationPreviewResponse) => void;
}): Promise<"done" | "needs_confirmation"> {
  const preview = await options.preview();
  if (!preview.requires_confirmation) {
    await options.save(preview.preview_token);
    return "done";
  }
  options.onNeedsConfirmation(preview);
  return "needs_confirmation";
}
