import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useHand } from "@/features/hands/hooks";
import { getLocalDraftBySlug, type LocalHandDraft } from "@/features/hands/lib/draftIdb";
import { isHandCreateState, newHandLocation } from "@/features/hands/lib/startNewHand";
import { HandInputPage } from "@/features/hands/pages/HandInputPage";
import { HandReplayPage } from "@/features/hands/pages/HandReplayPage";
import { DetailSkeleton, ErrorState } from "@/features/schedule/components/QueryState";

function HandLookupShell({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8">{children}</div>;
}

export function HandNewRedirect() {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    const loc = newHandLocation();
    navigate(loc.pathname, { replace: true, state: loc.state });
  }, [navigate]);
  return null;
}

export function HandPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const creating = isHandCreateState(location.state, slug);
  const query = useHand(slug, { enabled: Boolean(slug) && !creating });
  const [local, setLocal] = useState<LocalHandDraft | null | undefined>(
    creating ? null : undefined,
  );

  useEffect(() => {
    if (!slug || creating) return;
    let cancelled = false;
    void getLocalDraftBySlug(slug).then((row) => {
      if (!cancelled) setLocal(row);
    });
    return () => {
      cancelled = true;
    };
  }, [creating, slug]);

  if (query.data?.status === "published") return <HandReplayPage />;
  if (query.data?.status === "draft") return <HandInputPage />;
  if (creating || local) return <HandInputPage />;
  if (query.isPending || local === undefined) {
    return (
      <HandLookupShell>
        <DetailSkeleton />
      </HandLookupShell>
    );
  }
  return (
    <div className="px-4 py-16">
      <ErrorState message="Раздача не найдена" />
    </div>
  );
}

export function HandDraftRedirect() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const query = useHand(draftId);

  useEffect(() => {
    if (query.data?.slug) navigate(`/hand/${query.data.slug}`, { replace: true });
  }, [navigate, query.data?.slug]);

  if (query.isPending || query.data?.slug) {
    return (
      <HandLookupShell>
        <DetailSkeleton />
      </HandLookupShell>
    );
  }
  return (
    <div className="px-4 py-16">
      <ErrorState message="Раздача не найдена" />
    </div>
  );
}
