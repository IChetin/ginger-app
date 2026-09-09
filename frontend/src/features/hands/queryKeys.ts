import type { HandsListParams } from "@/api/types/hands";

export const handKeys = {
  all: ["hands"] as const,
  list: (params: HandsListParams = {}) => [...handKeys.all, "list", params] as const,
  detail: (slug: string) => [...handKeys.all, "detail", slug] as const,
  events: () => [...handKeys.all, "events"] as const,
  linkTargets: (q?: string) => [...handKeys.all, "link-targets", q ?? ""] as const,
  opponentNames: () => [...handKeys.all, "opponent-names"] as const,
};
