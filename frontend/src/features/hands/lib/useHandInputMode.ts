import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateCurrentUser } from "@/api/client";
import type { HandInputMode, UserMe } from "@/api/types/auth";
import {
  HAND_INPUT_MODES,
  isHandInputMode,
  resolveHandInputMode,
} from "@/config/features";
import { useMe } from "@/features/auth/hooks";
import { authKeys } from "@/features/auth/queryKeys";

export const HAND_INPUT_MODE_STORAGE_KEY = "day2.hand_input_mode";

function readStoredMode(): HandInputMode {
  try {
    const raw = localStorage.getItem(HAND_INPUT_MODE_STORAGE_KEY);
    if (isHandInputMode(raw)) return raw;
  } catch {
    // private mode / SSR
  }
  return resolveHandInputMode(null);
}

function writeStoredMode(mode: HandInputMode): void {
  try {
    localStorage.setItem(HAND_INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function useHandInputMode(): {
  mode: HandInputMode;
  setMode: (mode: HandInputMode) => void;
  available: readonly HandInputMode[];
  canChoose: boolean;
} {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const [guestMode, setGuestMode] = useState<HandInputMode>(readStoredMode);
  const latestRef = useRef<HandInputMode>(
    resolveHandInputMode(user?.hand_input_mode ?? guestMode),
  );
  const syncedUserId = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  const persist = useMutation({
    mutationFn: (hand_input_mode: HandInputMode) => updateCurrentUser({ hand_input_mode }),
    onSuccess: (saved) => {
      writeStoredMode(saved.hand_input_mode);
      queryClient.setQueryData(authKeys.me(), (current: UserMe | undefined) => {
        if (!current) return saved;
        if (latestRef.current !== saved.hand_input_mode) {
          return { ...saved, hand_input_mode: latestRef.current };
        }
        return saved;
      });
    },
  });

  useEffect(() => {
    if (!user) {
      syncedUserId.current = null;
      return;
    }
    if (syncedUserId.current === user.id) return;
    syncedUserId.current = user.id;
    if (dirtyRef.current) {
      if (latestRef.current !== user.hand_input_mode) {
        persist.mutate(latestRef.current);
      }
      return;
    }
    const next = resolveHandInputMode(user.hand_input_mode);
    writeStoredMode(next);
    setGuestMode(next);
    latestRef.current = next;
  }, [persist, user]);

  const mode = resolveHandInputMode(user?.hand_input_mode ?? guestMode);

  const setMode = useCallback(
    (next: HandInputMode) => {
      const resolved = resolveHandInputMode(next);
      if (resolved === latestRef.current && resolved === mode) return;
      dirtyRef.current = true;
      latestRef.current = resolved;
      writeStoredMode(resolved);
      setGuestMode(resolved);
      if (user) {
        queryClient.setQueryData(authKeys.me(), { ...user, hand_input_mode: resolved });
        persist.mutate(resolved);
      }
    },
    [mode, persist, queryClient, user],
  );

  return {
    mode,
    setMode,
    available: HAND_INPUT_MODES,
    canChoose: HAND_INPUT_MODES.length > 1,
  };
}
