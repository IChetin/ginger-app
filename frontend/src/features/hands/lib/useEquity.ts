import { useEffect, useRef, useState } from "react";

import {
  computeEquity,
  equityCanRunSync,
  type EquityRequest,
  type EquityResult,
} from "@/features/hands/lib/equity";

const CACHE_LIMIT = 48;
const EQUITY_TIMEOUT_MS = 6_000;
const equityCache = new Map<string, EquityResult>();

export type EquityHookValue = {
  result: EquityResult | null;
  failed: boolean;
};

function cacheKey(request: EquityRequest): string {
  return [
    request.holes.map((hole) => hole.join("")).join("|"),
    request.board.join(""),
    String(request.randomOpponents ?? 0),
    String(request.iterations),
    String(request.seed ?? ""),
  ].join("#");
}

function cacheGet(key: string): EquityResult | undefined {
  const hit = equityCache.get(key);
  if (!hit) return undefined;
  equityCache.delete(key);
  equityCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, result: EquityResult): void {
  if (equityCache.has(key)) equityCache.delete(key);
  equityCache.set(key, result);
  while (equityCache.size > CACHE_LIMIT) {
    const oldest = equityCache.keys().next().value;
    if (oldest == null) break;
    equityCache.delete(oldest);
  }
}

function spawnWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./equity.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

function runSync(request: EquityRequest): EquityResult | null {
  try {
    return computeEquity(request);
  } catch {
    return null;
  }
}

type WorkerReply = { id: string; result?: EquityResult; error?: string };

function attachWorkerHandlers(
  worker: Worker,
  requestId: { current: number },
  pendingKey: { current: string },
  setResult: (value: EquityResult | null) => void,
  setFailed: (value: boolean) => void,
): void {
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    if (event.data.id !== String(requestId.current)) return;
    if (event.data.result) {
      cacheSet(pendingKey.current, event.data.result);
      setFailed(false);
      setResult(event.data.result);
      return;
    }
    setFailed(true);
    setResult(null);
  };
  worker.onerror = () => {
    setFailed(true);
  };
}

export function useEquity(
  holes: string[][] | null,
  board: string[],
  options?: { randomOpponents?: number; iterations?: number },
): EquityHookValue {
  const [result, setResult] = useState<EquityResult | null>(null);
  const [failed, setFailed] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const pendingKey = useRef("");
  const randomOpponents = options?.randomOpponents ?? 0;
  const iterations = options?.iterations ?? 50_000;
  const holesKey = holes?.map((hole) => hole.join("")).join("|") ?? "";
  const boardKey = board.join("");

  useEffect(() => {
    const worker = spawnWorker();
    if (!worker) return;
    workerRef.current = worker;
    attachWorkerHandlers(worker, requestId, pendingKey, setResult, setFailed);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const players = (holes?.length ?? 0) + randomOpponents;
    if (!holes || holes.length < 1 || players < 2 || holes.some((hole) => hole.length !== 2)) {
      setResult(null);
      setFailed(false);
      return;
    }
    const payload: EquityRequest = {
      holes,
      board,
      iterations,
      randomOpponents,
    };
    const key = cacheKey(payload);
    const cached = cacheGet(key);
    requestId.current += 1;
    if (cached) {
      setFailed(false);
      setResult(cached);
      return;
    }
    pendingKey.current = key;
    const id = String(requestId.current);
    setResult(null);
    setFailed(false);

    if (equityCanRunSync(payload)) {
      const sync = runSync(payload);
      if (sync) {
        cacheSet(key, sync);
        setFailed(false);
        setResult(sync);
        return;
      }
      setFailed(true);
      return;
    }

    const worker = workerRef.current;
    if (!worker) {
      setFailed(true);
      return;
    }
    worker.postMessage({ ...payload, id });
    const timer = window.setTimeout(() => {
      if (String(requestId.current) !== id) return;
      worker.terminate();
      const next = spawnWorker();
      workerRef.current = next;
      if (next) {
        attachWorkerHandlers(next, requestId, pendingKey, setResult, setFailed);
      }
      setFailed(true);
      setResult(null);
    }, EQUITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // holes/board identity is captured via holesKey/boardKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holesKey, boardKey, randomOpponents, iterations]);

  return { result, failed };
}
