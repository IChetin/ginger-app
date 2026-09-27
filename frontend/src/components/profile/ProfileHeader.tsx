import type { UserMe } from "@/api/types/auth";
import { nicknameInitials } from "@/lib/profile";

export function ProfileHeader({ user, onEdit }: { user: UserMe; onEdit: () => void }) {
  return (
    <header className="flex items-center gap-3.5 px-4 pt-6 pb-5">
      <div className="deco-frame-hi text-gold font-display flex h-16 w-16 shrink-0 items-center justify-center text-[24px] font-bold tracking-[0.06em]">
        {nicknameInitials(user.nickname)}
      </div>
      <div className="min-w-0">
        <h1 className="text-ink truncate text-[19px] font-bold tracking-[0.08em]">
          {user.nickname}
        </h1>
        <p className="text-ink-2 mt-0.5 text-[13px]">
          Вы вошли как <span className="num text-ink-3">{user.email}</span>
        </p>
        {!user.email_verified ? (
          <p className="text-danger mt-1 text-[12px] font-semibold">Email не подтверждён</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Редактировать профиль"
        className="text-gold ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center"
        onClick={onEdit}
      >
        <svg
          className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="M13 7l4 4" />
        </svg>
      </button>
    </header>
  );
}
