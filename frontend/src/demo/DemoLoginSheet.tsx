import { Link, useLocation } from "react-router-dom";

import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { buildLoginLocation } from "@/features/auth/lib/redirect";

export function DemoLoginSheet({
  open,
  onOpenChange,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
}) {
  const location = useLocation();
  const login = buildLoginLocation(`${location.pathname}${location.search}`);

  return (
    <ProfileSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex flex-col gap-2.5" data-testid="demo-login-sheet">
        <Link
          to={login.pathname}
          state={login.state}
          className="bg-gold-grad text-ink-ongold shadow-sheen inline-flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold"
          onClick={() => onOpenChange(false)}
        >
          Войти
        </Link>
        <Link
          to="/register"
          state={login.state}
          className="text-gold inline-flex h-11 items-center justify-center text-[13.5px] font-bold"
          onClick={() => onOpenChange(false)}
        >
          Зарегистрироваться
        </Link>
      </div>
    </ProfileSheet>
  );
}
