import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAPTCHA_SCRIPT_SRC = "https://smartcaptcha.yandexcloud.net/captcha.js";
const MOCK_CAPTCHA_TOKEN = "ok";

type SmartCaptchaRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
};

declare global {
  interface Window {
    smartCaptcha?: {
      render: (containerId: string, options: SmartCaptchaRenderOptions) => string;
      reset: (widgetId: string) => void;
    };
  }
}

let captchaScriptPromise: Promise<void> | null = null;

function loadSmartCaptchaScript(): Promise<void> {
  if (window.smartCaptcha) {
    return Promise.resolve();
  }
  if (captchaScriptPromise) {
    return captchaScriptPromise;
  }

  captchaScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CAPTCHA_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("SmartCaptcha script failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = CAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SmartCaptcha script failed"));
    document.head.appendChild(script);
  });

  return captchaScriptPromise;
}

type SmartCaptchaProps = {
  onToken: (token: string) => void;
  onError?: () => void;
};

export function SmartCaptcha({ onToken, onError }: SmartCaptchaProps) {
  const clientKey = import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY?.trim() ?? "";
  const containerId = useId().replace(/:/g, "");
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const [mockToken, setMockToken] = useState(MOCK_CAPTCHA_TOKEN);
  const [scriptError, setScriptError] = useState<string | null>(null);

  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!clientKey) {
      return;
    }

    let cancelled = false;

    void loadSmartCaptchaScript()
      .then(() => {
        if (cancelled || !window.smartCaptcha) {
          return;
        }
        widgetIdRef.current = window.smartCaptcha.render(containerId, {
          sitekey: clientKey,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onErrorRef.current?.(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setScriptError("Не удалось загрузить капчу");
          onErrorRef.current?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, containerId]);

  if (!clientKey) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-slate-700 p-3">
        <Label htmlFor="mock-captcha">Dev: токен капчи</Label>
        <Input
          id="mock-captcha"
          value={mockToken}
          onChange={(event) => {
            const value = event.target.value;
            setMockToken(value);
            if (value.trim()) {
              onToken(value.trim());
            }
          }}
        />
        <p className="text-xs text-slate-400">
          Без ключа SmartCaptcha используется mock-токен «ok».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div id={containerId} />
      {scriptError ? <p className="text-sm text-rose-300">{scriptError}</p> : null}
    </div>
  );
}

export { MOCK_CAPTCHA_TOKEN };
