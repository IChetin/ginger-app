import { useEffect } from "react";

import { useMe } from "@/api/auth";
import { setPreferredUserTimezone } from "@/lib/time";

/** Keeps `getUserTimezone()` in sync with the signed-in profile preference. */
export function UserTimezoneSync() {
  const { data: user, isError } = useMe();

  useEffect(() => {
    if (isError || !user) {
      setPreferredUserTimezone(null);
      return;
    }
    setPreferredUserTimezone(user.timezone);
  }, [isError, user]);

  return null;
}
