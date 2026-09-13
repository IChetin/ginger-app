const KEY = "ginger.invite";

/** Приглашение живёт до конца регистрации: переживает перезагрузку страницы шага кода. */
export function rememberInvite(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // приватный режим — токен останется в адресной строке
  }
}

export function readInvite(fromUrl: string | null): string | null {
  if (fromUrl) {
    rememberInvite(fromUrl);
    return fromUrl;
  }
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetInvite(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // нечего чистить
  }
}
