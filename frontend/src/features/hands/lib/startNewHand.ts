import { generateHandSlug } from "@/features/hands/lib/handSlug";

export interface HandCreateState {
  creating: true;
  draftId: string;
  slug: string;
}

export function newHandLocation(): { pathname: string; state: HandCreateState } {
  const draftId = crypto.randomUUID();
  const slug = generateHandSlug();
  return { pathname: `/hand/${slug}`, state: { creating: true, draftId, slug } };
}

export function isHandCreateState(state: unknown, slug: string | undefined): state is HandCreateState {
  if (!state || typeof state !== "object" || !slug) return false;
  const row = state as Record<string, unknown>;
  return row.creating === true && typeof row.draftId === "string" && row.slug === slug;
}
