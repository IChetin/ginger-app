export const liveQueryKeys = {
  all: ["live"] as const,
  active: () => [...liveQueryKeys.all, "active"] as const,
  candidates: (eventId?: string | null, flightId?: string | null) =>
    [...liveQueryKeys.all, "candidates", eventId ?? null, flightId ?? null] as const,
};
