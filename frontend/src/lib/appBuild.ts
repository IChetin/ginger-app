/**
 * Номер сборки фронта («20260915171400»): его ставит deploy.sh, клиент шлёт в X-Client-Build.
 * Локально и в тестах пусто — проверка минимальной версии не участвует.
 */
export const APP_BUILD: string = String(import.meta.env.VITE_APP_BUILD ?? "");
