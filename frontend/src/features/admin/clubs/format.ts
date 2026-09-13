import type { TemplateAdmin } from "@/features/admin/clubs/api";

const DAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Дни шаблона по-человечески: «ежедневно», «ср, сб», «последнее вс», «25.09». */
export function formatTemplateDays(template: TemplateAdmin): string {
  if (template.valid_from && template.valid_from === template.valid_until) {
    const [, month, day] = template.valid_from.split("-");
    return `${day}.${month}`;
  }
  const days = template.weekdays.map((day) => DAY_SHORT[day]).join(", ");
  if (template.month_week !== null) {
    const week = template.month_week === -1 ? "последнее" : `${template.month_week}-е`;
    return `${week} ${days}`;
  }
  return template.weekdays.length === 7 ? "ежедневно" : days;
}
