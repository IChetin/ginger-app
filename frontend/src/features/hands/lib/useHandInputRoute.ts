import { useEffect, useRef, useState } from "react";
import { useLocation, useMatch, useParams } from "react-router-dom";

import { useHand } from "@/features/hands/hooks";
import { getLocalDraftBySlug } from "@/features/hands/lib/draftIdb";
import { isHandCreateState } from "@/features/hands/lib/startNewHand";

export function useHandInputRoute() {
  const { slug, draftId: legacyDraftId } = useParams<{ slug?: string; draftId?: string }>();
  const isPublishedEdit = Boolean(useMatch({ path: "/hand/:slug/edit", end: true }));
  const location = useLocation();
  const creating = isHandCreateState(location.state, slug);
  const creatingDraftId = creating ? location.state.draftId : undefined;
  const existing = useHand(slug, { enabled: Boolean(slug) && !creating });
  const [idbId, setIdbId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || creatingDraftId) return;
    let cancelled = false;
    void getLocalDraftBySlug(slug).then((row) => {
      if (!cancelled) setIdbId(row?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [creatingDraftId, slug]);

  const generatedId = useRef<string | null>(
    isPublishedEdit || slug || legacyDraftId || creatingDraftId ? null : crypto.randomUUID(),
  );
  const draftId =
    existing.data?.status === "draft"
      ? existing.data.id
      : (creatingDraftId ?? idbId ?? legacyDraftId ?? generatedId.current);

  return { slug, isPublishedEdit, existing, draftId, creating };
}
