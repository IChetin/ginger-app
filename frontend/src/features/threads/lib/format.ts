import type { ThreadStatus, ThreadTopic } from "@/api/types/threads";

export const TOPIC_LABELS: Record<ThreadTopic, string> = {
  question: "Вопрос",
  hand_review: "Разбор раздачи",
  data_change: "Правка данных",
  chip_request: "Заявка на фишки",
};

export function statusLabel(status: ThreadStatus, viewer: "player" | "manager"): string {
  switch (status) {
    case "open":
      return viewer === "player" ? "Ждёт ответа" : "Ждёт вас";
    case "answered":
      return "Отвечен";
    case "closed":
      return "Закрыт";
  }
}

const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "short",
});

/** «14:05» сегодня, «12 сент.» раньше — как в мессенджерах. */
export function shortTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return dayFormat.format(date) === dayFormat.format(now)
    ? timeFormat.format(date)
    : dayFormat.format(date);
}

export function messageTime(iso: string): string {
  const date = new Date(iso);
  return `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}
