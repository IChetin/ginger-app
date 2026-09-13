import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAdminChipRequests, usePendingAccounts } from "@/features/admin/chips/hooks";
import { useAdminClubs } from "@/features/admin/clubs/hooks";
import { useAdminThreads } from "@/features/admin/threads/hooks";
import { cn } from "@/lib/utils";

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={cn("size-[18px] shrink-0", className)}
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

function formatHeaderDate(date: Date): string {
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "Europe/Moscow" });
  const day = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  });
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day}`;
}

/** Карточка-ссылка: число, подпись и подсказка. Подсвечивается, когда есть что разбирать. */
function DashboardCard({
  to,
  icon,
  value,
  title,
  hint,
  attention,
}: {
  to: string;
  icon: ReactNode;
  value: number | null;
  title: string;
  hint: string;
  attention: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "hover:border-line-strong flex gap-3 rounded-[14px] border p-3.5 text-left transition-colors",
        attention
          ? "border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[linear-gradient(var(--warn-soft),var(--warn-soft)),var(--surface)]"
          : "border-line bg-surface",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[11px]",
          attention ? "bg-warn-soft text-warn" : "bg-gold-soft text-gold",
        )}
      >
        <Icon>{icon}</Icon>
      </span>
      <span className="min-w-0">
        <span className="num block text-[22px] leading-tight font-extrabold">
          {value === null ? "—" : value}
        </span>
        <span className="mt-0.5 block text-[13px] font-bold">{title}</span>
        <span className="text-ink-3 mt-0.5 block text-xs">{hint}</span>
      </span>
      <Icon className="text-ink-3 ml-auto self-center">
        <path d="M9 6l6 6-6 6" />
      </Icon>
    </Link>
  );
}

export function AdminDashboardPage() {
  const requests = useAdminChipRequests("open");
  const pendingAccounts = usePendingAccounts();
  const threads = useAdminThreads("open");
  const clubs = useAdminClubs();

  const openRequests = requests.data?.length ?? null;
  const pending = pendingAccounts.data?.length ?? null;
  const unreadThreads = threads.data ? threads.data.filter((t) => t.unread).length : null;
  const clubsCount = clubs.data?.length ?? null;

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex flex-wrap items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Панель управления</div>
          <div className="num text-ink-3 text-xs">{formatHeaderDate(new Date())}</div>
        </div>
      </header>

      <div className="max-w-[1180px] flex-1 px-6 pt-5 pb-10">
        <div className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">Касса</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
          <DashboardCard
            to="/admin/chips"
            value={openRequests}
            title="заявок на фишки в работе"
            hint="Пополнения и выводы"
            attention={(openRequests ?? 0) > 0}
            icon={
              <>
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
              </>
            }
          />
          <DashboardCard
            to="/admin/threads"
            value={unreadThreads}
            title="непрочитанных диалогов"
            hint="Вопросы и разборы раздач"
            attention={(unreadThreads ?? 0) > 0}
            icon={
              <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
            }
          />
          <DashboardCard
            to="/admin/players"
            value={pending}
            title="аккаунтов ждут подтверждения"
            hint="Игроки в клубах"
            attention={(pending ?? 0) > 0}
            icon={
              <>
                <circle cx="9" cy="8" r="4" />
                <path d="M2 21c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
              </>
            }
          />
        </div>

        <div className="text-ink-3 mt-[22px] mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">
          Расписание
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
          <DashboardCard
            to="/admin/grids"
            value={clubsCount}
            title="клубов"
            hint="Загрузка и правка сеток турниров"
            attention={false}
            icon={
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 4v16M13 13h5M13 17h3" />
              </>
            }
          />
        </div>

        <div className="mt-[22px] flex flex-wrap gap-2.5">
          <Link
            to="/"
            className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
          >
            <Icon>
              <path d="M14 4h6v6M20 4l-9 9" />
              <path d="M18 14v5H5V6h5" />
            </Icon>
            Открыть приложение
          </Link>
        </div>
      </div>
    </>
  );
}
