import { Link } from "react-router-dom";

type Props = {
  title?: string;
  description?: string;
};

export function BookmarksEmpty({
  title = "Пока нет закладок",
  description = "Добавьте серию или флайт колокольчиком на карточке турнира — и мы напомним о старте.",
}: Props) {
  return (
    <div
      className="border-line bg-surface mx-4 mt-8 rounded-md border px-4 py-8 text-center"
      data-testid="bookmarks-empty"
    >
      <div className="bg-surface-3 text-gold mx-auto flex h-12 w-12 items-center justify-center rounded-[12px]">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 4h12v17l-6-4-6 4z" />
        </svg>
      </div>
      <h2 className="text-ink mt-3 text-[17px] font-extrabold">{title}</h2>
      <p className="text-ink-2 mt-1.5 text-[13px]">{description}</p>
      <Link
        to="/"
        className="border-line-gold bg-gold-soft text-gold mt-4 inline-flex h-10 items-center rounded-full border px-4 text-[13px] font-bold"
      >
        К расписанию
      </Link>
    </div>
  );
}
