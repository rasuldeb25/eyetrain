/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vitest/config";
import preact from "@preact/preset-vite";

/**
 * Zero-dependency service worker: at build time, emit `sw.js` that precaches the app
 * shell plus every generated JS/CSS chunk (by their real hashed names), serves same-origin
 * GETs cache-first, and answers navigations with the cached index.html when offline. The
 * cache name embeds the asset hash set, so a new build replaces the old cache cleanly on
 * activate. The WebGL shader source ships inside the JS bundle, so it is precached too.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: "eyetrain-offline-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f));
      const precache = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", ...assets.map((a) => `/${a}`)];
      let hash = 0;
      for (const ch of precache.join("|")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const cacheName = `eyetrain-${hash.toString(16)}`;
      const source = `// Generated at build time — do not edit.
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    })),
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [preact(), offlineServiceWorker()],
  build: {
    target: "es2022",
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
