const UNSAFE_PREFIXES = ["//", "http:", "https:", "javascript:"];

export function safeInternalNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) {
    return fallback;
  }

  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  const lower = trimmed.toLowerCase();
  for (const prefix of UNSAFE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return fallback;
    }
  }

  return trimmed;
}

/**
 * Routes behind AuthGuard/AdminGuard. Sending a guest there right after they
 * declined to log in bounces them straight back to /login.
 */
const AUTH_ONLY_PATTERNS = [/^\/profile(\/|$)/, /^\/admin(\/|$)/, /^\/notifications(\/|$)/];

/** Path a guest can actually open: auth-only targets collapse to the fallback. */
export function guestSafePath(path: string, fallback = "/"): string {
  const safe = safeInternalNextPath(path, fallback);
  const pathname = safe.split(/[?#]/)[0];
  return AUTH_ONLY_PATTERNS.some((pattern) => pattern.test(pathname)) ? fallback : safe;
}

export type LoginLocationState = {
  returnTo?: string;
};

/** Prefer router state.returnTo, fall back to legacy `?next=` query. */
export function resolveReturnTo(
  state: LoginLocationState | null | undefined,
  nextQuery: string | null | undefined,
  fallback = "/",
): string {
  return safeInternalNextPath(state?.returnTo ?? nextQuery, fallback);
}

export function buildLoginLocation(returnTo: string): {
  pathname: string;
  state: LoginLocationState;
} {
  return {
    pathname: "/login",
    state: { returnTo: safeInternalNextPath(returnTo, "/") },
  };
}
