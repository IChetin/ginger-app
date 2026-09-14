import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { UserRole } from "@/api/types/auth";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { GingerWordmark } from "@/components/brand/GingerWordmark";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAdminChipRequests, usePendingAccounts } from "@/features/admin/chips/hooks";
import { useAdminThreads } from "@/features/admin/threads/hooks";
import { isAdminUser, useLogout, useMe } from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

const ROLE_FOOTER: Record<UserRole, string> = {
  admin: "Администратор",
  editor: "Редактор",
  user: "Пользователь",
};

function initials(email: string, nickname: string): string {
  const source = nickname.trim() || email.trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "??";
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="size-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-sm font-semibold",
    isActive ? "bg-gold-soft text-gold" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
  );

const footNavClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink";

function SidebarNav({ showUsers, onNavigate }: { showUsers: boolean; onNavigate?: () => void }) {
  const { data: user } = useMe();
  const logout = useLogout();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const openRequests = useAdminChipRequests("open").data?.length ?? 0;
  const pendingAccounts = usePendingAccounts().data?.length ?? 0;
  const unreadThreads = (useAdminThreads("open").data ?? []).filter((t) => t.unread).length;

  return (
    <>
      <Link
        to="/admin"
        aria-label="Панель управления"
        onClick={onNavigate}
        className="text-ink hover:bg-surface-2 mb-[18px] flex cursor-pointer items-center gap-[7px] rounded-[10px] px-2 pt-1.5 text-[17px] font-extrabold"
      >
        <img
          src="/icons/ginger-mark-96.png"
          alt=""
          aria-hidden="true"
          className="h-6 w-6 rounded-full"
        />
        <GingerWordmark className="h-[13px] w-auto" />
        <small className="text-ink-3 ml-1 text-[11px] font-bold tracking-[0.08em] uppercase">
          админка
        </small>
      </Link>

      <div className="text-ink-3 px-2 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.1em] uppercase">
        Касса
      </div>
      <NavLink to="/admin/chips" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
        </NavIcon>
        Заявки
        {openRequests > 0 ? (
          <span className="bg-warn text-ink-ongold ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold">
            {openRequests}
          </span>
        ) : null}
      </NavLink>
      <NavLink to="/admin/threads" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        </NavIcon>
        Диалоги
        {unreadThreads > 0 ? (
          <span className="bg-warn text-ink-ongold ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold">
            {unreadThreads}
          </span>
        ) : null}
      </NavLink>
      <NavLink to="/admin/players" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
        </NavIcon>
        Игроки
        {pendingAccounts > 0 ? (
          <span className="bg-warn text-ink-ongold ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold">
            {pendingAccounts}
          </span>
        ) : null}
      </NavLink>
      <NavLink to="/admin/broadcasts" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" />
          <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
        </NavIcon>
        Рассылки
      </NavLink>
      <NavLink to="/admin/invites" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </NavIcon>
        Инвайты
      </NavLink>
      <NavLink to="/admin/requisites" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </NavIcon>
        Реквизиты
      </NavLink>

      <div className="text-ink-3 px-2 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.1em] uppercase">
        Контент
      </div>
      <NavLink to="/admin" end className={navClass} onClick={onNavigate}>
        <NavIcon>
          <rect x="3" y="3" width="7" height="8" rx="2" />
          <rect x="14" y="3" width="7" height="5" rx="2" />
          <rect x="3" y="15" width="7" height="6" rx="2" />
          <rect x="14" y="12" width="7" height="9" rx="2" />
        </NavIcon>
        Панель
      </NavLink>
      <NavLink to="/admin/grids" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 4v16M13 13h5M13 17h3" />
        </NavIcon>
        Сетки клубов
      </NavLink>
      <NavLink to="/admin/wins" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
          <path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 12v4M9 20h6M10 16h4" />
        </NavIcon>
        Выигрыши
      </NavLink>
      <NavLink to="/admin/organizers" className={navClass} onClick={onNavigate}>
        <NavIcon>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10M9 10h6M9 14h6" />
        </NavIcon>
        Организаторы
      </NavLink>

      {showUsers ? (
        <>
          <div className="text-ink-3 px-2 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.1em] uppercase">
            Управление
          </div>
          <NavLink to="/admin/users" className={navClass} onClick={onNavigate}>
            <NavIcon>
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
              <path d="M17 11h5M19.5 8.5v5" />
            </NavIcon>
            Пользователи
          </NavLink>
        </>
      ) : null}

      <div className="border-line mt-auto flex flex-col gap-1 border-t pt-2.5">
        <Link to="/" className={footNavClass} onClick={onNavigate}>
          <NavIcon>
            <path d="M14 4h6v6M20 4l-9 9" />
            <path d="M18 14v5H5V6h5" />
          </NavIcon>
          Открыть приложение
        </Link>
        <button
          type="button"
          disabled={logout.isPending}
          className={cn(footNavClass, "disabled:opacity-45")}
          onClick={() => {
            onNavigate?.();
            void (async () => {
              const ok = await confirm({
                title: "Выйти из аккаунта?",
                description: "Данные аккаунта сохранятся — войти снова можно по email.",
                confirmLabel: "Выйти",
                cancelLabel: "Отмена",
                variant: "danger",
              });
              if (!ok) return;
              await logout.mutateAsync();
              navigate("/", { replace: true });
            })();
          }}
        >
          <NavIcon>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </NavIcon>
          Выйти
        </button>
        {user ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="bg-gold-grad text-ink-ongold flex size-8 shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold">
              {initials(user.email, user.nickname)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] leading-tight font-bold">{user.email}</div>
              <div className="text-ink-3 text-[11px]">{ROLE_FOOTER[user.role]}</div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function AdminLayout() {
  const { data: user } = useMe();
  const showUsers = isAdminUser(user);
  const isDesktop = useAdminDesktop();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isDesktop) {
      setMenuOpen(false);
    }
  }, [isDesktop]);

  return (
    <div className="admin-shell bg-bg text-ink flex min-h-screen text-sm">
      {isDesktop ? (
        <aside className="border-line bg-surface sticky top-0 flex h-screen w-[236px] shrink-0 flex-col border-r px-3 py-4">
          <SidebarNav showUsers={showUsers} />
        </aside>
      ) : (
        <>
          <button
            type="button"
            aria-label="Открыть меню"
            onClick={() => setMenuOpen(true)}
            className="border-line-strong bg-surface text-ink shadow-elevated fixed top-3 left-3 z-40 inline-flex size-10 items-center justify-center rounded-[10px] border"
          >
            <svg
              className="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed inset-0 z-40 bg-black/60"
                onClick={() => setMenuOpen(false)}
              />
              <aside className="border-line bg-surface shadow-elevated fixed inset-y-0 left-0 z-50 flex w-[min(280px,86vw)] flex-col border-r px-3 py-4">
                <SidebarNav showUsers={showUsers} onNavigate={() => setMenuOpen(false)} />
              </aside>
            </>
          ) : null}
        </>
      )}

      <main className={cn("flex min-w-0 flex-1 flex-col", !isDesktop && "pt-14")}>
        <Outlet />
      </main>
    </div>
  );
}
