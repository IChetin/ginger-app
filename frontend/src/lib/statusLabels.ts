import type { SeriesStatus } from "@/api/types/schedule";

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  announced: "Анонс",
  schedule_published: "Сетка опубликована",
  running: "Идёт",
  finished: "Завершена",
  cancelled: "Отменена",
};
