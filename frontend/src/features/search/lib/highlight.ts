export const POPULAR_SEARCHES = [
  "Сочи",
  "Минск",
  "Кипр",
  "RPT",
  "EAPT",
  "Main Event",
] as const;

/** Highlight case-insensitive substring matches with <mark>. */
export function highlightMatch(text: string, query: string): Array<string | { mark: string }> {
  const q = query.trim();
  if (!q) {
    return [text];
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const parts: Array<string | { mark: string }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push({ mark: text.slice(index, index + q.length) });
    cursor = index + q.length;
  }
  return parts.length ? parts : [text];
}
