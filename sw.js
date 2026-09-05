const CACHE = "weather-forecast-v25.1";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/weather-insights.js?v=25",
  "./manifest.webmanifest",
  "./icon-192-v3.png",
  "./icon-512-v3.png",
  "./apple-touch-icon-v3.png",
  "./assets/weather-app-icon-v3.png",
  "./assets/weather-cover.jpg",
  "./data/typhoons.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  try {
    const path = new URL(request.url).pathname;
    return path.endsWith("/") || /\/index\.html$/.test(path);
  } catch (_) {
    return false;
  }
}

function sameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const req = event.request;

  if (isHtmlRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => {
              cache.put(req, copy);
              cache.put("./index.html", res.clone());
            });
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  if (!sameOrigin(req)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networked = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
});

