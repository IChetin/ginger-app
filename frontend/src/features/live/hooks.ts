import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import type {
  LiveCandidateRead,
  LiveEventCreateItem,
  LiveEventUpdatePayload,
  LiveSessionCreatePayload,
  LiveSessionFinishPayload,
  LiveSessionRead,
} from "@/api/types/live";
import { ApiError } from "@/api/client";
import { useMe } from "@/features/auth/hooks";
import { fetchActiveLiveSession, fetchLiveCandidates } from "@/features/live/api";
import {
  clearLocalSession,
  clearOutbox,
  enqueueOutbox,
  getLocalActiveSession,
  getOutbox,
  getOutboxCount,
  putLocalSession,
  replaceOutbox,
  type LocalLiveSession,
  visibleEvents,
} from "@/features/live/lib/liveIdb";
import { mergeServerSession, syncLiveOutbox } from "@/features/live/lib/sync";
import { liveQueryKeys } from "@/features/live/queryKeys";
import { trackerKeys } from "@/features/tracker/queryKeys";

function newId(): string {
  return crypto.randomUUID();
}

export function useActiveLiveSession() {
  const { data: user } = useMe();

  const query = useQuery({
    queryKey: liveQueryKeys.active(),
    enabled: Boolean(user),
    queryFn: async (): Promise<LocalLiveSession | null> => {
      const local = await getLocalActiveSession();
      try {
        const remote = await fetchActiveLiveSession();
        const mapped = mergeServerSession(remote, local);
        await putLocalSession(mapped);
        const synced = await syncLiveOutbox();
        if (synced.ok && synced.session) {
          return synced.session;
        }
        if (!synced.ok && !synced.conflict && synced.resultId) {
          await clearLocalSession();
          await clearOutbox();
          return null;
        }
        return mapped;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // Stale local conflict / leftover after finish: nothing active on server.
          if (local?.conflict || (local && local.status !== "active")) {
            await clearLocalSession();
            await clearOutbox();
            return null;
          }
          if (local && local.status === "active") {
            const synced = await syncLiveOutbox();
            if (synced.ok && synced.session) {
              return synced.session;
            }
            if (!synced.ok && !synced.conflict && synced.resultId) {
              await clearLocalSession();
              await clearOutbox();
              return null;
            }
            if (!synced.ok && synced.conflict) {
              // Closed on server with no result_id on this path — drop local trap.
              await clearLocalSession();
              await clearOutbox();
              return null;
            }
            return local;
          }
          await clearLocalSession();
          return null;
        }
        if (local) {
          void syncLiveOutbox();
          return local;
        }
        throw error;
      }
    },
    staleTime: 10_000,
  });

  return query;
}

export function useLivePendingCount() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    void getOutboxCount().then(setCount);
  }, []);
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);
  return { count, refresh };
}

export function useLiveCandidates(
  enabled: boolean,
  opts?: { eventId?: string | null; flightId?: string | null },
) {
  return useQuery({
    queryKey: liveQueryKeys.candidates(opts?.eventId, opts?.flightId),
    queryFn: () => fetchLiveCandidates(opts),
    enabled,
  });
}

export function useLiveActions() {
  const queryClient = useQueryClient();
  const { refresh } = useLivePendingCount();

  const invalidate = async () => {
    refresh();
    await queryClient.invalidateQueries({ queryKey: liveQueryKeys.active() });
  };

  const startLinked = useMutation({
    mutationFn: async (input: {
      event_id: string;
      flight_id: string;
      buyin: string;
      currency_code: string;
      display_name: string;
      display_series: string;
      currency_symbol: string;
      reentry_allowed: boolean;
    }) => {
      const sessionId = newId();
      const entryId = newId();
      const now = new Date().toISOString();
      const existing = await getLocalActiveSession();
      if (existing && existing.status === "active" && !existing.conflict) {
        const sameEvent = existing.event_id === input.event_id;
        const sameFlight =
          input.flight_id == null ||
          existing.flight_id == null ||
          existing.flight_id === input.flight_id;
        if (sameEvent && sameFlight) {
          return existing;
        }
        throw Object.assign(new Error("Active live session already exists"), {
          activeSession: true,
        });
      }
      // Fresh start from the picker: drop leftover conflict/outbox from a prior finish.
      await clearOutbox();
      if (existing) {
        await clearLocalSession();
      }
      const payload: LiveSessionCreatePayload = {
        id: sessionId,
        event_id: input.event_id,
        flight_id: input.flight_id,
        started_at: now,
      };
      const local: LocalLiveSession = {
        id: sessionId,
        event_id: input.event_id,
        flight_id: input.flight_id,
        manual_name: null,
        manual_venue: null,
        manual_buyin: null,
        manual_currency: null,
        started_at: now,
        finished_at: null,
        status: "active",
        place: null,
        field_size: null,
        payout: null,
        result_id: null,
        display_name: input.display_name,
        display_series: input.display_series,
        buyin: input.buyin,
        currency: { code: input.currency_code, symbol: input.currency_symbol },
        reentry_allowed: input.reentry_allowed,
        events: [
          {
            id: entryId,
            type: "entry",
            amount: input.buyin,
            currency_code: input.currency_code,
            text: null,
            occurred_at: now,
            created_at: now,
            deleted_at: null,
          },
        ],
        created_at: now,
        updated_at: now,
      };
      await putLocalSession(local);
      await enqueueOutbox("create_session", payload as unknown as Record<string, unknown>);
      const synced = await syncLiveOutbox();
      if (!synced.ok) {
        if (!synced.conflict && synced.resultId) {
          await clearLocalSession();
          await clearOutbox();
          throw Object.assign(new Error(synced.message), {
            resultId: synced.resultId,
          });
        }
        // Fresh start failed (incl. stale closed-session conflict): don't trap the UI.
        await clearLocalSession();
        await clearOutbox();
        throw new Error(synced.message || "Не удалось начать турнир");
      }
      return synced.session ?? (await getLocalActiveSession()) ?? local;
    },
    onSuccess: async () => invalidate(),
  });

  const startManual = useMutation({
    mutationFn: async (input: {
      name: string;
      venue?: string;
      buyin: string;
      currency_code: string;
      currency_symbol: string;
      started_at: string;
    }) => {
      const sessionId = newId();
      const entryId = newId();
      const now = input.started_at;
      const existing = await getLocalActiveSession();
      if (!existing || existing.conflict || existing.status !== "active") {
        await clearOutbox();
        if (existing) {
          await clearLocalSession();
        }
      }
      const payload: LiveSessionCreatePayload = {
        id: sessionId,
        manual_name: input.name,
        manual_venue: input.venue ?? null,
        manual_buyin: input.buyin,
        manual_currency: input.currency_code,
        started_at: now,
      };
      const local: LocalLiveSession = {
        id: sessionId,
        event_id: null,
        flight_id: null,
        manual_name: input.name,
        manual_venue: input.venue ?? null,
        manual_buyin: input.buyin,
        manual_currency: input.currency_code,
        started_at: now,
        finished_at: null,
        status: "active",
        place: null,
        field_size: null,
        payout: null,
        result_id: null,
        display_name: input.name,
        display_series: input.venue ?? null,
        buyin: input.buyin,
        currency: { code: input.currency_code, symbol: input.currency_symbol },
        reentry_allowed: true,
        events: [
          {
            id: entryId,
            type: "entry",
            amount: input.buyin,
            currency_code: input.currency_code,
            text: null,
            occurred_at: now,
            created_at: now,
            deleted_at: null,
          },
        ],
        created_at: now,
        updated_at: now,
      };
      await putLocalSession(local);
      await enqueueOutbox("create_session", payload as unknown as Record<string, unknown>);
      const synced = await syncLiveOutbox();
      if (!synced.ok) {
        if (!synced.conflict && synced.resultId) {
          await clearLocalSession();
          await clearOutbox();
          throw Object.assign(new Error(synced.message), {
            resultId: synced.resultId,
          });
        }
        await clearLocalSession();
        await clearOutbox();
        throw new Error(synced.message || "Не удалось начать турнир");
      }
      return synced.session ?? (await getLocalActiveSession()) ?? local;
    },
    onSuccess: async () => invalidate(),
  });

  const addReentry = useMutation({
    mutationFn: async (session: LocalLiveSession) => {
      const id = newId();
      const now = new Date().toISOString();
      const amount = session.buyin;
      const event: LiveEventCreateItem = {
        id,
        type: "reentry",
        amount,
        currency_code: session.currency.code,
        occurred_at: now,
      };
      const next: LocalLiveSession = {
        ...session,
        events: [
          ...session.events,
          {
            ...event,
            text: null,
            created_at: now,
            deleted_at: null,
            amount,
            currency_code: session.currency.code,
          },
        ],
        updated_at: now,
      };
      await putLocalSession(next);
      await enqueueOutbox("create_events", { session_id: session.id, events: [event] });
      void syncLiveOutbox();
      return next;
    },
    onSuccess: async () => invalidate(),
  });

  const addNote = useMutation({
    mutationFn: async (input: {
      session: LocalLiveSession;
      text: string;
      occurred_at: string;
    }) => {
      const id = newId();
      const now = new Date().toISOString();
      const event: LiveEventCreateItem = {
        id,
        type: "note",
        text: input.text,
        occurred_at: input.occurred_at,
      };
      const next: LocalLiveSession = {
        ...input.session,
        events: [
          ...input.session.events,
          {
            id,
            type: "note",
            amount: null,
            currency_code: null,
            text: input.text,
            occurred_at: input.occurred_at,
            created_at: now,
            deleted_at: null,
          },
        ],
        updated_at: now,
      };
      await putLocalSession(next);
      await enqueueOutbox("create_events", {
        session_id: input.session.id,
        events: [event],
      });
      void syncLiveOutbox();
      return next;
    },
    onSuccess: async () => invalidate(),
  });

  const patchEvent = useMutation({
    mutationFn: async (input: {
      session: LocalLiveSession;
      eventId: string;
      patch: LiveEventUpdatePayload;
    }) => {
      const next: LocalLiveSession = {
        ...input.session,
        events: input.session.events.map((item) =>
          item.id === input.eventId
            ? {
                ...item,
                amount: input.patch.amount ?? item.amount,
                text: input.patch.text ?? item.text,
                occurred_at: input.patch.occurred_at ?? item.occurred_at,
              }
            : item,
        ),
        updated_at: new Date().toISOString(),
      };
      await putLocalSession(next);
      await enqueueOutbox("patch_event", { id: input.eventId, ...input.patch });
      void syncLiveOutbox();
      return next;
    },
    onSuccess: async () => invalidate(),
  });

  const removeEvent = useMutation({
    mutationFn: async (input: { session: LocalLiveSession; eventId: string }) => {
      const now = new Date().toISOString();
      const next: LocalLiveSession = {
        ...input.session,
        events: input.session.events.map((item) =>
          item.id === input.eventId ? { ...item, deleted_at: now } : item,
        ),
        updated_at: now,
      };
      await putLocalSession(next);
      await enqueueOutbox("delete_event", { id: input.eventId });
      void syncLiveOutbox();
      return next;
    },
    onSuccess: async () => invalidate(),
  });

  const finish = useMutation({
    mutationFn: async (input: {
      session: LocalLiveSession;
      body: LiveSessionFinishPayload;
    }) => {
      const now = new Date().toISOString();
      const next: LocalLiveSession = {
        ...input.session,
        status: "finished",
        finished_at: now,
        place: input.body.place ?? null,
        field_size: input.body.field_size ?? null,
        payout: input.body.payout,
        updated_at: now,
      };
      await putLocalSession(next);
      await enqueueOutbox("finish", {
        session_id: input.session.id,
        body: input.body,
      });
      const result = await syncLiveOutbox();
      if (!result.ok) {
        await putLocalSession(input.session);
        const queue = await getOutbox();
        await replaceOutbox(queue.filter((item) => item.kind !== "finish"));
        throw new Error(
          result.conflict
            ? result.message
            : result.message || "Не удалось сохранить результат",
        );
      }
      await clearLocalSession();
      return result;
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: trackerKeys.all });
    },
  });

  const cancel = useMutation({
    mutationFn: async (session: LocalLiveSession) => {
      const now = new Date().toISOString();
      await putLocalSession({
        ...session,
        status: "cancelled",
        finished_at: now,
        updated_at: now,
      });
      await enqueueOutbox("cancel", { session_id: session.id });
      const result = await syncLiveOutbox();
      if (result.ok) {
        await clearLocalSession();
        await clearOutbox();
      }
      return result;
    },
    onSuccess: async () => invalidate(),
  });

  const dismissConflict = useMutation({
    mutationFn: async () => {
      await clearLocalSession();
      await clearOutbox();
    },
    onSuccess: async () => invalidate(),
  });

  return {
    startLinked,
    startManual,
    addReentry,
    addNote,
    patchEvent,
    removeEvent,
    finish,
    cancel,
    dismissConflict,
  };
}

export type { LiveCandidateRead, LiveSessionRead, LocalLiveSession };
export { visibleEvents };
