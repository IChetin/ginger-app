import type { PaginatedResponse } from "@/api/types/schedule";
import type { HandListItem, HandsListParams } from "@/api/types/hands";
import fixture from "@/demo/hands.json";

export const DEMO_HANDS_LOGIN = {
  title: "Войдите, чтобы сохранять раздачи",
  description: "Пример нельзя изменить. После входа руки и разборы будут только вашими.",
} as const;

export const DEMO_HAND_SLUGS = ["demo-1", "demo-2", "demo-3"] as const;

export function isDemoHandSlug(slug: string | undefined): boolean {
  return slug != null && (DEMO_HAND_SLUGS as readonly string[]).includes(slug);
}

interface DemoHandRow {
  id: string;
  slug: string;
  title: string;
  note: string;
  series_id: string;
  series_name: string;
  created_offset_days: number;
  views_count: number;
  preview: HandListItem["preview"];
}

function addUtcDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

function toListItem(row: DemoHandRow, now: Date): HandListItem {
  const created = addUtcDays(now, row.created_offset_days).toISOString();
  return {
    id: row.id,
    slug: row.slug,
    status: "published",
    current_step: null,
    current_street: null,
    title: row.title,
    note: row.note,
    is_public: true,
    views_count: row.views_count,
    created_at: created,
    updated_at: created,
    preview: row.preview,
    event: null,
    series: { id: row.series_id, name: row.series_name },
  };
}

/** Список демо-раздач с датами относительно `now`, чтобы карточки не устаревали. */
export function listDemoHands(
  params: HandsListParams = {},
  now: Date = new Date(),
): PaginatedResponse<HandListItem> {
  const status = params.status ?? "all";
  let items = (fixture.items as DemoHandRow[]).map((row) => toListItem(row, now));
  if (status === "draft") {
    items = [];
  }
  if (params.event_id) {
    items = [];
  }
  const needle = params.q?.trim().toLowerCase();
  if (needle) {
    items = items.filter((item) => {
      const haystack = [item.note, item.title, item.series?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}
