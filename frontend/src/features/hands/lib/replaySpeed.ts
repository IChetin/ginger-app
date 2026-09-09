const SPEEDS = [0.5, 1, 2] as const;

export function nextReplaySpeed(current: number): number {
  const index = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
}
