import { useSyncExternalStore } from "react";

import {
  getResolvedTheme,
  getThemeChoice,
  setThemeChoice,
  subscribeThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

export function useTheme(): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
} {
  const choice = useSyncExternalStore(subscribeThemeChoice, getThemeChoice, getThemeChoice);
  const resolved = useSyncExternalStore(subscribeThemeChoice, getResolvedTheme, getResolvedTheme);

  return { choice, resolved, setTheme: setThemeChoice };
}
