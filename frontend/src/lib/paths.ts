export function eventPublicKey(seriesSlug: string, eventSlug: string): string {
  return `${seriesSlug}-${eventSlug}`;
}

export function seriesPath(series: { slug: string }, opts?: { day?: string | null }): string {
  const base = `/series/${series.slug}`;
  const day = opts?.day;
  if (day) {
    return `${base}?day=${encodeURIComponent(day)}`;
  }
  return base;
}

export function seriesSchedulePath(series: { slug: string }): string {
  return `/series/${series.slug}/schedule`;
}

export function eventPath(event: { slug: string }, series: { slug: string }): string {
  return `/events/${eventPublicKey(series.slug, event.slug)}`;
}

