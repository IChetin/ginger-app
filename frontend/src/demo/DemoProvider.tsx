import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { BaseCurrencyCode } from "@/api/types/auth";
import { DemoContext, type DemoLoginReason } from "@/demo/DemoContext";
import { DemoLoginSheet } from "@/demo/DemoLoginSheet";
import { useMe } from "@/features/auth/hooks";

const DEFAULT_LOGIN: Required<DemoLoginReason> = {
  title: "Войдите, чтобы вести свою статистику",
  description: "Пример нельзя изменить. После входа результаты будут только вашими.",
};

export function DemoProvider({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  const isDemo = !isPending && !user;
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrencyCode>("RUB");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<Required<DemoLoginReason>>(DEFAULT_LOGIN);

  const requestLogin = useCallback((reason?: DemoLoginReason) => {
    setLoginReason({
      title: reason?.title ?? DEFAULT_LOGIN.title,
      description: reason?.description ?? DEFAULT_LOGIN.description,
    });
    setLoginOpen(true);
  }, []);

  const value = useMemo(
    () => ({ isDemo, baseCurrency, setBaseCurrency, requestLogin }),
    [isDemo, baseCurrency, requestLogin],
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
      <DemoLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        title={loginReason.title}
        description={loginReason.description}
      />
    </DemoContext.Provider>
  );
}
