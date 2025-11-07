const CACHE_NAME = "buildlab-cache-v2";
const MANUAL_CACHE_NAME = "buildlab-manual-cache-v1";

// Core files for minimal offline shell
const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/style.css",
  "./css/fonts.css",
  "./css/theme-light.css",
  "./css/theme-dark.css",
  "./js/main.js",
  "./assets/icon-512.png"
];

// Install core files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
      .catch(err => console.error("SW install failed:", err))
  );
});

// Activate and clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== MANUAL_CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === "error")
          return response;

        const responseClone = response.clone();
        const url = new URL(event.request.url);
        const shouldCache =
          url.origin === location.origin &&
          (url.pathname.endsWith(".css") ||
           url.pathname.endsWith(".js") ||
           url.pathname.endsWith(".woff") ||
           url.pathname.endsWith(".woff2") ||
           url.pathname.endsWith(".png") ||
           url.pathname.endsWith(".jpg") ||
           url.pathname.endsWith(".svg") ||
           url.pathname.endsWith(".glb") ||
           url.pathname.endsWith(".mp4") ||
           url.pathname.endsWith(".pdf"));

        if (shouldCache) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }

        return response;
      }).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("Offline - resource not available", {
          status: 503,
          statusText: "Service Unavailable"
        });
      });
    })
  );
});

// Listen for custom messages from client pages
self.addEventListener("message", event => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case "CACHE_URLS":
      event.waitUntil(
        cacheUrls(event.data.urls).then(result => {
          event.ports[0].postMessage({ success: true, result });
        }).catch(err => {
          event.ports[0].postMessage({ success: false, error: err.message });
        })
      );
      break;

    case "GET_CACHE_SIZE":
      event.waitUntil(
        getCacheSize().then(size => {
          event.ports[0].postMessage({ success: true, size });
        })
      );
      break;
  }
});

// --- Helpers ---
async function cacheUrls(urls) {
  const cache = await caches.open(MANUAL_CACHE_NAME);
  const results = { success: [], failed: [] };

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        await cache.put(url, res);
        results.success.push(url);
      } else {
        results.failed.push({ url, reason: `HTTP ${res.status}` });
      }
    } catch (e) {
      results.failed.push({ url, reason: e.message });
    }
  }
  return results;
}

async function getCacheSize() {
  const cacheNames = await caches.keys();
  let total = 0;
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.clone().blob();
        total += blob.size;
      }
    }
  }
  return total;
}
