import { useCallback, useEffect, useMemo, useState } from "react";

import { pluralRu } from "@/lib/plural";

export const SAVE_INDICATOR_DELAY_MS = 2000;

export type DraftSaveVisible = "hidden" | "saving" | "offline" | "error";

export function formatSavedAgo(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "Ещё не сохранялось";
  const ms = Math.max(0, nowMs - then);
  if (ms < 45_000) return "Сохранено только что";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `Сохранено ${minutes} ${pluralRu(minutes, "минуту", "минуты", "минут")} назад`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Сохранено ${hours} ${pluralRu(hours, "час", "часа", "часов")} назад`;
  }
  const days = Math.round(hours / 24);
  return `Сохранено ${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
}

export function useDraftSaveIndicator() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [inFlight, setInFlight] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!inFlight) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SAVE_INDICATOR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [inFlight]);

  const visible: DraftSaveVisible = failed
    ? "error"
    : !online
      ? "offline"
      : slow
        ? "saving"
        : "hidden";

  const rememberSaved = useCallback((iso: string) => {
    setLastSavedAt(iso);
  }, []);

  const markLocalSaved = useCallback(() => {
    setLastSavedAt(new Date().toISOString());
  }, []);

  const beginRequest = useCallback(() => {
    setFailed(false);
    setInFlight(true);
  }, []);

  const succeed = useCallback(() => {
    setInFlight(false);
    setFailed(false);
    setLastSavedAt(new Date().toISOString());
  }, []);

  const fail = useCallback(() => {
    setInFlight(false);
    setFailed(true);
  }, []);

  const cancelRequest = useCallback(() => {
    setInFlight(false);
  }, []);

  return useMemo(
    () => ({
      visible,
      lastSavedAt,
      rememberSaved,
      markLocalSaved,
      beginRequest,
      succeed,
      fail,
      cancelRequest,
    }),
    [
      visible,
      lastSavedAt,
      rememberSaved,
      markLocalSaved,
      beginRequest,
      succeed,
      fail,
      cancelRequest,
    ],
  );
}
