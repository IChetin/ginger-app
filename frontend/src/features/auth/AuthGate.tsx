import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { buildLoginLocation } from "@/features/auth/lib/redirect";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  returnTo?: string;
  children?: ReactNode;
};

export function AuthGate({ icon, title, description, returnTo, children }: Props) {
  const location = useLocation();
  const login = buildLoginLocation(returnTo ?? `${location.pathname}${location.search}`);

  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center" data-testid="auth-gate">
      <div className="bg-gold-soft text-gold flex h-[52px] w-[52px] -rotate-[4deg] items-center justify-center rounded-[16px]">
        <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </span>
      </div>
      <h2 className="text-ink text-base font-bold">{title}</h2>
      <p className="text-ink-2 max-w-[320px] text-[13.5px] leading-snug">{description}</p>
      <Link
        to={login.pathname}
        state={login.state}
        className="bg-gold-grad text-ink-ongold shadow-sheen mt-1 inline-flex h-11 items-center justify-center rounded-md px-5 text-[15px] font-extrabold"
      >
        Войти
      </Link>
      <Link to="/register" state={login.state} className="text-gold text-[13.5px] font-bold">
        Зарегистрироваться
      </Link>
      {children ? <div className="mt-2 w-full">{children}</div> : null}
    </div>
  );
}
