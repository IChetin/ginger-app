import { randomUUID } from "node:crypto";

export function testId(label = "e2e"): string {
  return randomUUID().replace(/-/g, "").slice(0, 10) + label.slice(0, 4);
}

export function testSeriesName(suffix?: string): string {
  const id = testId(suffix ?? "ser");
  return `TEST_${id}`;
}

export function testEmail(suffix?: string): string {
  const id = testId(suffix ?? "usr");
  return `test+${id}@example.com`;
}

export const TEST_PASSWORD = "TestPassword12!";
