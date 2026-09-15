import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "tournaments", to: "/tournaments", label: "MTT" },
  { key: "cash", to: "/cash", label: "CASH" },
] as const;

/**
 * «MTT | CASH» вместо заголовка: текущий раздел — заголовок страницы, соседний — ссылка.
 * Названия разделов — только по-английски (решение Ивана 15.09): так их зовут игроки.
 */
export function ScheduleTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Расписание" className="flex shrink-0 items-baseline gap-2.5">
      {TABS.map((tab) =>
        tab.key === active ? (
          <h1 key={tab.key} className="text-[16px] font-extrabold tracking-tight">
            {tab.label}
          </h1>
        ) : (
          <Link
            key={tab.key}
            to={tab.to}
            className={cn("text-ink-3 hover:text-ink-2 text-[16px] font-extrabold tracking-tight")}
          >
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
