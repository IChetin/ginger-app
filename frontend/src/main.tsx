import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";

import { applyMobileLayoutFix } from "@/lib/mobileLayoutFix";
import { initTheme } from "@/lib/theme";

import "./index.css";

void initTheme();
applyMobileLayoutFix();
window.addEventListener("resize", applyMobileLayoutFix);
window.visualViewport?.addEventListener("resize", applyMobileLayoutFix);

if (import.meta.env.PROD && import.meta.env.MODE !== "test") {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      // Установленное на экран приложение само не перезагружается: без проверки игрок
      // днями видит старую версию. Проверяем раз в 30 минут и при возврате в приложение.
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        const check = () => void registration.update();
        window.setInterval(check, 30 * 60_000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      },
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
