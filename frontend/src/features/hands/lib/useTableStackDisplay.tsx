import { createContext, useContext, type ReactNode } from "react";

import type { StackDisplayMode } from "@/features/hands/lib/stackDisplay";
import { useStackDisplay } from "@/features/hands/lib/useStackDisplay";

const TableStackDisplayContext = createContext<{
  mode: StackDisplayMode;
  setMode: (mode: StackDisplayMode) => void;
  toggle: () => void;
} | null>(null);

/** Общий режим фишки/BB: профиль, реплеер, стол, ставка, форма игрока. */
export function TableStackDisplayProvider({ children }: { children: ReactNode }) {
  const value = useStackDisplay();
  return (
    <TableStackDisplayContext.Provider value={value}>{children}</TableStackDisplayContext.Provider>
  );
}

export function useTableStackDisplay(): {
  mode: StackDisplayMode;
  setMode: (mode: StackDisplayMode) => void;
  toggle: () => void;
} {
  const ctx = useContext(TableStackDisplayContext);
  const persist = useStackDisplay();
  return ctx ?? persist;
}
