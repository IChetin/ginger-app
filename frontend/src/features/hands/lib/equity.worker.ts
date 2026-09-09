import { computeEquity, type EquityRequest, type EquityResult } from "@/features/hands/lib/equity";

export type { EquityRequest, EquityResult };

self.onmessage = (event: MessageEvent<EquityRequest & { id: string }>) => {
  const { id, ...request } = event.data;
  try {
    const result = computeEquity(request);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "equity failed" });
  }
};
