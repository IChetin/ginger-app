import type { ReactNode } from "react";

export type FilterSelectionMode = "multi" | "single";

export interface FilterOptionConfig {
  value: string;
  label: string;
  count?: number;
  /** When true, option is shown inactive (still visible) unless selected. */
  disabled?: boolean;
}

export interface FilterGroupConfig {
  id: string;
  title: string;
  mode?: FilterSelectionMode;
  options: FilterOptionConfig[];
  hint?: string;
  /** Extra content under options (e.g. custom date range). */
  footer?: ReactNode;
}

export interface SegmentOption {
  value: string;
  label: string;
  count?: number;
}

export interface AppliedChip {
  groupId: string;
  value: string;
  label: string;
}

export type FilterValues = Record<string, string[]>;

export function countSelected(values: FilterValues, groupIds?: string[]): number {
  const ids = groupIds ?? Object.keys(values);
  return ids.reduce((sum, id) => sum + (values[id]?.length ?? 0), 0);
}

export function toggleValue(
  values: FilterValues,
  groupId: string,
  value: string,
  mode: FilterSelectionMode = "multi",
): FilterValues {
  const current = values[groupId] ?? [];
  if (mode === "single") {
    const next = current.includes(value) ? [] : [value];
    return { ...values, [groupId]: next };
  }
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return { ...values, [groupId]: next };
}

export function removeValue(values: FilterValues, groupId: string, value: string): FilterValues {
  const current = values[groupId] ?? [];
  return { ...values, [groupId]: current.filter((item) => item !== value) };
}

export function clearValues(groupIds: string[]): FilterValues {
  return Object.fromEntries(groupIds.map((id) => [id, []]));
}
