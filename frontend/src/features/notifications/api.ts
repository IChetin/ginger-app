import { apiGet, apiPost, buildQuery } from "@/api/client";
import type {
  NotificationListParams,
  NotificationListResponse,
  NotificationReadPayload,
  NotificationReadResponse,
  NotificationUnreadCountResponse,
} from "@/api/types/notifications";

export function fetchNotifications(
  params: NotificationListParams = {},
): Promise<NotificationListResponse> {
  return apiGet(`/api/v1/notifications${buildQuery(params)}`);
}

export function markNotificationsRead(
  body: NotificationReadPayload,
): Promise<NotificationReadResponse> {
  return apiPost("/api/v1/notifications/read", body);
}

export function fetchUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
  return apiGet("/api/v1/notifications/unread-count");
}
