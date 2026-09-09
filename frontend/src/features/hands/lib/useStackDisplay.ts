import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateCurrentUser } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { useMe } from "@/features/auth/hooks";
import { authKeys } from "@/features/auth/queryKeys";
import {
  STACK_DISPLAY_STORAGE_KEY,
  isStackDisplayMode,
  type StackDisplayMode,
} from "@/features/hands/lib/stackDisplay";

function readStoredMode(): StackDisplayMode {
  try {
    const raw = localStorage.getItem(STACK_DISPLAY_STORAGE_KEY);
    if (isStackDisplayMode(raw)) return raw;
  } catch {
    // private mode / SSR
  }
  return "chips";
}

function writeStoredMode(mode: StackDisplayMode): void {
  try {
    localStorage.setItem(STACK_DISPLAY_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function useStackDisplay(): {
  mode: StackDisplayMode;
  setMode: (mode: StackDisplayMode) => void;
  toggle: () => void;
} {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const [guestMode, setGuestMode] = useState<StackDisplayMode>(readStoredMode);
  const latestRef = useRef<StackDisplayMode>(user?.stack_display ?? guestMode);
  const syncedUserId = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  const persist = useMutation({
    mutationFn: (stack_display: StackDisplayMode) => updateCurrentUser({ stack_display }),
    onSuccess: (saved) => {
      writeStoredMode(saved.stack_display);
      queryClient.setQueryData(authKeys.me(), (current: UserMe | undefined) => {
        if (!current) return saved;
        if (latestRef.current !== saved.stack_display) {
          return { ...saved, stack_display: latestRef.current };
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
      if (latestRef.current !== user.stack_display) {
        persist.mutate(latestRef.current);
      }
      return;
    }
    writeStoredMode(user.stack_display);
    setGuestMode(user.stack_display);
    latestRef.current = user.stack_display;
  }, [persist, user]);

  const mode: StackDisplayMode = user?.stack_display ?? guestMode;

  const setMode = useCallback(
    (next: StackDisplayMode) => {
      if (next === latestRef.current && next === mode) return;
      dirtyRef.current = true;
      latestRef.current = next;
      writeStoredMode(next);
      setGuestMode(next);
      if (user) {
        queryClient.setQueryData(authKeys.me(), { ...user, stack_display: next });
        persist.mutate(next);
      }
    },
    [mode, persist, queryClient, user],
  );

  const toggle = useCallback(() => {
    setMode(mode === "bb" ? "chips" : "bb");
  }, [mode, setMode]);

  return { mode, setMode, toggle };
}
