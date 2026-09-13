/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTCAPTCHA_CLIENT_KEY?: string;
  readonly VITE_TELEGRAM_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
