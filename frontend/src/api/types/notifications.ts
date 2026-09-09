export type NotificationDeliveryStatus = "pending" | "sent" | "failed";

export type NotificationPreviewEntityType = "series" | "event" | "flight";

export type NotificationType =
  | "reminder"
  | "schedule_published"
  | "time_changed"
  | "event_cancelled"
  | "guarantee_changed"
  | "series_starting"
  | "series_cancelled";

export interface NotificationHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  status: NotificationDeliveryStatus;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationDiff {
  old: string;
  new: string;
}

export interface NotificationListItem {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string;
  url: string;
  sent_at: string | null;
  read_at: string | null;
  is_unread: boolean;
  diff: NotificationDiff | null;
}

export interface NotificationListResponse {
  items: NotificationListItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface NotificationListParams {
  type?: "reminders" | "changes";
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationReadPayload {
  ids?: string[];
  all?: boolean;
}

export interface NotificationReadResponse {
  marked: number;
}

export interface NotificationUnreadCountResponse {
  count: number;
}

export interface NotificationPreviewDiff {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface NotificationPreviewImpact {
  type: string;
  title: string;
  body: string;
  url: string;
  recipient_count: number;
}

export interface NotificationPreviewResponse {
  preview_token: string;
  expires_in_seconds: number;
  entity_type: NotificationPreviewEntityType;
  entity_id: string;
  diffs: NotificationPreviewDiff[];
  impacts: NotificationPreviewImpact[];
  total_recipients: number;
  requires_confirmation: boolean;
}
