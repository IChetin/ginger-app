/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTCAPTCHA_CLIENT_KEY?: string;
  readonly VITE_TELEGRAM_SUPPORT_URL?: string;
  /** Номер сборки фронта от deploy.sh — для флага минимальной версии. */
  readonly VITE_APP_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
