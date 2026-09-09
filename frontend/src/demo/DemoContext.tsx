import { createContext, useContext } from "react";

import type { BaseCurrencyCode } from "@/api/types/auth";

export type DemoLoginReason = {
  title?: string;
  description?: string;
};

export type DemoContextValue = {
  isDemo: boolean;
  baseCurrency: BaseCurrencyCode;
  setBaseCurrency: (code: BaseCurrencyCode) => void;
  requestLogin: (reason?: DemoLoginReason) => void;
};

export const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return ctx;
}
