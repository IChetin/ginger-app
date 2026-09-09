export function DesktopOnlyStub({
  title = "Доступно на компьютере",
  description = "Этот раздел админки удобнее открывать на экране от 900px.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="bg-surface-2 text-ink-3 mb-3 flex size-12 items-center justify-center rounded-[14px]">
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      </div>
      <div className="text-base font-extrabold">{title}</div>
      <p className="text-ink-2 mt-1.5 max-w-sm text-[13px]">{description}</p>
    </div>
  );
}
