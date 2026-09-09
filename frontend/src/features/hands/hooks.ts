import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";
import type {
  HandCreatePayload,
  HandPublishPayload,
  HandsListParams,
  HandUpdatePayload,
} from "@/api/types/hands";
import { useDemo } from "@/demo/DemoContext";
import { DEMO_HANDS_LOGIN, listDemoHands } from "@/demo/hands";
import { useMe } from "@/features/auth/hooks";
import {
  createHand,
  deleteHand,
  fetchHand,
  fetchHandEvents,
  fetchHandLinkTargets,
  fetchHands,
  publishHand,
  updateHand,
} from "@/features/hands/api";
import { handKeys } from "@/features/hands/queryKeys";

const DEMO_READONLY = new Error("demo_readonly");

function useHandsSource() {
  const { data: user } = useMe();
  const { isDemo, requestLogin } = useDemo();
  return {
    isDemo,
    enabled: isDemo || Boolean(user),
    keyPart: isDemo ? ("demo" as const) : ("live" as const),
    requestLogin,
  };
}

export function useHandsList(params: HandsListParams = {}, options?: { enabled?: boolean }) {
  const { isDemo, enabled, keyPart } = useHandsSource();
  return useQuery({
    queryKey: [...handKeys.list(params), keyPart],
    queryFn: () => (isDemo ? listDemoHands(params) : fetchHands(params)),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useHand(ref: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: handKeys.detail(ref ?? ""),
    queryFn: () => fetchHand(ref!),
    enabled: Boolean(ref) && (options?.enabled ?? true),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useHandEvents(options?: { enabled?: boolean }) {
  const { isDemo, enabled, keyPart } = useHandsSource();
  return useQuery({
    queryKey: [...handKeys.events(), keyPart],
    queryFn: () => (isDemo ? [] : fetchHandEvents()),
    enabled: enabled && (options?.enabled ?? true),
  });
}

export function useHandLinkTargets(q?: string, options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  const query = q?.trim() || undefined;
  return useQuery({
    queryKey: handKeys.linkTargets(query),
    queryFn: () => fetchHandLinkTargets(query),
    enabled: Boolean(user) && (options?.enabled ?? true),
  });
}

export function useCreateHand() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: (body: HandCreatePayload) => {
      if (isDemo) {
        requestLogin(DEMO_HANDS_LOGIN);
        return Promise.reject(DEMO_READONLY);
      }
      return createHand(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: handKeys.all });
    },
  });
}

export function usePublishHand() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: HandPublishPayload }) => {
      if (isDemo) {
        requestLogin(DEMO_HANDS_LOGIN);
        return Promise.reject(DEMO_READONLY);
      }
      return publishHand(id, body);
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: handKeys.all });
      if (row.slug) {
        queryClient.setQueryData(handKeys.detail(row.slug), row);
      }
      queryClient.setQueryData(handKeys.detail(row.id), row);
    },
  });
}

export function useUpdateHand(slug: string) {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: (body: HandUpdatePayload) => {
      if (isDemo) {
        requestLogin(DEMO_HANDS_LOGIN);
        return Promise.reject(DEMO_READONLY);
      }
      return updateHand(slug, body);
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: handKeys.all });
      if (row.slug) {
        queryClient.setQueryData(handKeys.detail(row.slug), row);
      }
    },
  });
}

export function useDeleteHand() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: (ref: string) => {
      if (isDemo) {
        requestLogin(DEMO_HANDS_LOGIN);
        return Promise.reject(DEMO_READONLY);
      }
      return deleteHand(ref);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: handKeys.all });
    },
  });
}
