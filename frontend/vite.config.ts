/// <reference types="vitest/config" />
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vite";

/** Viewport must follow charset and precede injected scripts — some mobile browsers ignore it otherwise. */
function viewportFirstPlugin(): Plugin {
  const viewport =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
  const themeColor = '<meta name="theme-color" content="#0B0A09">';
  // Sync fix before Vite module scripts: set viewport + widen layout when mobile/desktop-mode mismatch.
  const viewportFixScript = [
    "<script>",
    "(function(){",
    "var d=document,m=d.querySelector('meta[name=viewport]');",
    "if(!m){m=d.createElement('meta');m.name='viewport';d.head.appendChild(m);}",
    "m.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');",
    "var mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);",
    "var coarse=window.matchMedia('(pointer: coarse)').matches;",
    "var cw=d.documentElement.clientWidth;",
    "var sw=Math.min(window.screen.width,window.screen.height);",
    "var vv=(window.visualViewport&&window.visualViewport.width)||cw;",
    "var broken=(mobile&&coarse&&cw>=600)||(sw>0&&sw<=520&&cw>sw+80)||(mobile&&vv>0&&cw>vv+80);",
    "if(broken){",
    "d.documentElement.classList.add('day2-layout-wide');",
    "m.setAttribute('content','width='+Math.round(vv||sw||360)+', initial-scale=1, viewport-fit=cover');",
    "}",
    "})();",
    "</script>",
  ].join("");

  return {
    name: "day2-viewport-first",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const charsetMatch = html.match(/<meta\s+charset="[^"]+"\s*\/?>/i);
        const charset = charsetMatch?.[0] ?? '<meta charset="UTF-8" />';
        const withoutCharset = html.replace(/<meta\s+charset="[^"]+"\s*\/?>\s*/i, "");
        const withoutViewport = withoutCharset.replace(/<meta\s+name="viewport"[^>]*>\s*/gi, "");
        const withoutThemeColor = withoutViewport.replace(
          /<meta\s+name="theme-color"[^>]*>\s*/gi,
          "",
        );
        const withoutFixScript = withoutThemeColor.replace(
          /<script>\s*\(function\(\)\{var d=document,m=d\.querySelector\('meta\[name=viewport\]'\)[\s\S]*?<\/script>\s*/i,
          "",
        );
        return withoutFixScript.replace(
          /<head>/i,
          `<head>\n    ${charset}\n    ${viewport}\n    ${themeColor}\n    ${viewportFixScript}`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [
    viewportFirstPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      // Шрифты свои (public/fonts) — кладём в офлайн-кэш вместе с кодом, иначе без сети
      // установленное приложение откатится на системный шрифт.
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,woff2}"],
      },
      manifest: {
        name: "Ginger",
        short_name: "Ginger",
        description: "Фишки, турниры и связь с клубом Ginger",
        lang: "ru",
        start_url: "/",
        display: "standalone",
        background_color: "#0B0A09",
        theme_color: "#0B0A09",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["lisa52.com", "localhost", "frontend"],
    watch: {
      usePolling: true,
    },
    // When accessed via Caddy on :80/:443, HMR websocket must use the edge port.
    hmr: {
      clientPort: 443,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    // "frontend" — hostname внутри docker-сети (Caddy → frontend:5173).
    allowedHosts: ["lisa52.com", "localhost", "frontend"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
