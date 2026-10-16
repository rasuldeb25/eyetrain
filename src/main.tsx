import { render } from "preact";
import { App } from "./ui/app";
import "./style.css";

const root = document.getElementById("app");
if (root) render(<App />, root);

// Offline/installable PWA: the service worker is generated at build time (vite.config.ts)
// and only registered for production builds — the dev server has no sw.js.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
