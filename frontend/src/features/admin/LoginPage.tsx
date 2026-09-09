import { Navigate, useSearchParams } from "react-router-dom";

import { safeInternalNextPath } from "@/features/auth/lib/redirect";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = safeInternalNextPath(searchParams.get("next"), "/admin");
  const target = next.startsWith("/admin") ? next : "/admin";

  return <Navigate to={`/login?next=${encodeURIComponent(target)}`} replace />;
}
