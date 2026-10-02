
const CACHE = "atmos-v4-9-labs";
const ASSETS = ["./","index.html","styles.css","app.js",
  "backend.js",
  "supabase-config.js","RUN-THIS-ONCE-v4.8.sql","manifest.json","favicon.png","favicon.ico","apple-touch-icon.png","apple-touch-icon-precomposed.png","icon-192.png","icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
