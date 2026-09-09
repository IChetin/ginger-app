import {
  PushPermissionDeniedError,
  PushSubscribeFailedError,
  PushUnavailableError,
} from "@/features/push/api";
import { pushBlockerMessage, pushPermissionDeniedMessage } from "@/features/push/lib/pushEnv";

/** Every push failure the user can act on, in the wording of their own browser. */
export function pushErrorMessage(error: unknown): string {
  if (error instanceof PushUnavailableError) {
    return pushBlockerMessage(error.blocker);
  }
  if (error instanceof PushPermissionDeniedError) {
    return pushPermissionDeniedMessage();
  }
  if (error instanceof PushSubscribeFailedError) {
    return `Не удалось подписаться на push: ${error.reason}`;
  }
  return "Не удалось включить push-уведомления";
}
