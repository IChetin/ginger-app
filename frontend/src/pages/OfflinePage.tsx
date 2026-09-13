import { Link } from "react-router-dom";

import { usePlayerMe } from "@/features/chips/hooks";

/**
 * Офлайн-раздел (экраны §3.8). Без флага доступа — не скрытый пункт, а заглушка: человек видит,
 * что раздел есть, и может попросить доступ. Анонсы и запись «Буду» — отдельным этапом.
 */
export function OfflinePage() {
  const player = usePlayerMe();
  const hasAccess = player.data?.offline_access ?? false;

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="offline-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/more" className="text-gold text-[13px] font-bold">
          ← Ещё
        </Link>
      </header>
      <h1 className="text-[20px] font-extrabold tracking-tight">Офлайн-игры</h1>
      <div className="border-line bg-surface mt-2 rounded-md border px-3 py-4">
        {hasAccess ? (
          <>
            <p className="text-ink text-[15px] font-bold">Анонсов пока нет</p>
            <p className="text-ink-2 mt-1 text-[13px]">
              Здесь появятся ближайшие игры и запись «Буду». Новую игру пришлём уведомлением.
            </p>
          </>
        ) : (
          <>
            <p className="text-ink text-[15px] font-bold">Раздел по приглашению</p>
            <p className="text-ink-2 mt-1 text-[13px]">
              Живые игры — для своих. Напишите менеджеру, если хотите участвовать.
            </p>
            <Link
              to="/dialogs/new?topic=question&text=Хочу%20в%20офлайн-игры"
              className="bg-gold-grad text-ink-ongold mt-3 flex h-10 items-center justify-center rounded-md text-[14px] font-bold"
            >
              Написать менеджеру
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
