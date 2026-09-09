/** Normalize empty/missing labels to backend default. */
export function normalizeStructureSetLabel(label: string | null | undefined): string {
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "default";
}

/** Unique structure set labels in first-seen order. */
export function structureSetLabels(levels: { structure_set_label?: string | null }[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const level of levels) {
    const label = normalizeStructureSetLabel(level.structure_set_label);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels.length > 0 ? labels : ["default"];
}

export function filterLevelsBySet<T extends { structure_set_label?: string | null }>(
  levels: T[],
  label: string,
): T[] {
  const target = normalizeStructureSetLabel(label);
  return levels.filter((level) => normalizeStructureSetLabel(level.structure_set_label) === target);
}
