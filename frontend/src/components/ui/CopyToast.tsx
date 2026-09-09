export function CopyToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      data-testid="copy-toast"
      className="border-line-gold bg-surface text-gold pointer-events-none fixed bottom-[max(6rem,calc(env(safe-area-inset-bottom,0px)+5rem))] left-1/2 z-40 -translate-x-1/2 rounded-md border px-3 py-2 text-[13px] font-bold shadow-lg"
    >
      {message}
    </div>
  );
}
