import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useMe } from "@/features/auth/hooks";
import { fetchOpponentNames } from "@/features/hands/api";
import { mergeNameSuggestions } from "@/features/hands/lib/playerNames";
import {
  forgetUsedName,
  isNamePrivacyHintSeen,
  loadForgottenNames,
  loadRememberedNames,
  markNamePrivacyHintSeen,
  rememberUsedName,
} from "@/features/hands/lib/playerNamesIdb";
import { handKeys } from "@/features/hands/queryKeys";

export function useOpponentNames() {
  const { data: user } = useMe();
  const remote = useQuery({
    queryKey: handKeys.opponentNames(),
    queryFn: fetchOpponentNames,
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const [local, setLocal] = useState<string[]>([]);
  const [forgotten, setForgotten] = useState<string[]>([]);
  const [privacySeen, setPrivacySeen] = useState(true);

  const reloadLocal = useCallback(async () => {
    const [names, seen, skipped] = await Promise.all([
      loadRememberedNames(),
      isNamePrivacyHintSeen(),
      loadForgottenNames(),
    ]);
    setLocal(names);
    setPrivacySeen(seen);
    setForgotten(skipped);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void reloadLocal().catch(() => {
      if (!cancelled) setPrivacySeen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadLocal]);

  const suggestions = useMemo(
    () => mergeNameSuggestions(local, remote.data ?? [], forgotten),
    [forgotten, local, remote.data],
  );

  const remember = useCallback(
    async (name: string) => {
      await rememberUsedName(name).catch(() => undefined);
      await reloadLocal().catch(() => undefined);
    },
    [reloadLocal],
  );

  const forget = useCallback(
    async (name: string) => {
      await forgetUsedName(name).catch(() => undefined);
      await reloadLocal().catch(() => undefined);
    },
    [reloadLocal],
  );

  const markPrivacySeen = useCallback(async () => {
    setPrivacySeen(true);
    await markNamePrivacyHintSeen().catch(() => undefined);
  }, []);

  return {
    suggestions,
    showPrivacyHint: !privacySeen,
    remember,
    forget,
    markPrivacySeen,
  };
}
