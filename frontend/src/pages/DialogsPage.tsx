/** Диалоги с менеджером (этап 6) — экран на месте, внутри честное «скоро». */
export function DialogsPage() {
  return (
    <div className="bg-bg min-h-full px-3 pt-3 pb-4" data-testid="dialogs-page">
      <h1 className="text-[20px] font-extrabold tracking-tight">Диалоги</h1>
      <div className="border-line bg-surface mt-2 rounded-md border px-3 py-4">
        <p className="text-ink text-[15px] font-bold">Скоро</p>
        <p className="text-ink-2 mt-1 text-[13px]">
          Здесь будут вопросы менеджеру, разборы раздач и переписка по заявкам.
        </p>
      </div>
    </div>
  );
}
