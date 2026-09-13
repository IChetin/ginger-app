import type { PlayerKind } from "@/api/types/chips";

export type ThreadTopic = "question" | "hand_review" | "data_change" | "chip_request";
export type ThreadStatus = "open" | "answered" | "closed";

export interface ThreadMessage {
  id: string;
  from_manager: boolean;
  author_nickname: string | null;
  body: string | null;
  attachment_id: string | null;
  created_at: string;
}

export interface ThreadSummary {
  id: string;
  topic: ThreadTopic;
  status: ThreadStatus;
  subject: string;
  chip_request_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  /** Игроку — непрочитанный ответ менеджера; менеджеру — непрочитанное сообщение игрока. */
  unread: boolean;
  player_id: string;
  player_nickname: string | null;
  player_kind: PlayerKind | null;
}

export interface Thread extends ThreadSummary {
  messages: ThreadMessage[];
  manager_hours: string;
}

export interface ThreadCreatePayload {
  topic: ThreadTopic;
  subject?: string;
  body: string;
  chip_request_id?: string;
}
