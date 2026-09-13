import type { ChipRequestAdmin } from "@/features/admin/chips/api";

/** Что менеджеру делать с заявкой прямо сейчас — видно из очереди, без захода в карточку. */
export function nextActionLabel(request: ChipRequestAdmin): string | null {
  const depositTopup = request.kind === "topup" && request.player.kind === "deposit";
  switch (request.status) {
    case "sent":
      return depositTopup ? "Отправить реквизиты" : "Принять";
    case "accepted":
      if (depositTopup) return "Отправить реквизиты";
      return request.kind === "withdrawal" ? "Отправить вывод" : "Выдать";
    case "awaiting_payment":
      return "Ждём оплату";
    case "paid":
      return "Проверить оплату";
    default:
      return null;
  }
}
