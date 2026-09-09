/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTCAPTCHA_CLIENT_KEY?: string;
  readonly VITE_TELEGRAM_SUPPORT_URL?: string;
  readonly VITE_HAND_INPUT_MODES?: string;
  readonly VITE_EQUITY_VS_RANDOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
