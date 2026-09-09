import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names; prefer this over clsx/classnames in components. */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
