// WorkDesk Service Worker v1.0
// Caches everything for full offline support

const CACHE_NAME = "workdesk-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js",
  "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Playfair+Display:wght@500;600&display=swap",
];

// ── Install: cache all static assets ──────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell");
      // Cache assets individually so one failure doesn't block the rest
      return Promise.allSettled(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("[SW] Failed to cache:", url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app assets, network-first for API calls ─────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to network for Anthropic API (AI features need live internet)
  if (url.hostname === "api.anthropic.com") {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "You are currently offline. AI features require an internet connection. Your tasks and data are safely stored on your device." }],
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // For Google Fonts: network-first, fallback to cache (system font if all fails)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  // For everything else (app shell, CDN scripts): cache-first strategy
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache valid responses for future offline use
        if (response && response.status === 200 && response.type !== "opaque") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
