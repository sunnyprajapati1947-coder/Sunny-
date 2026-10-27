/* Offline-first service worker. Bump CACHE when shipping new assets. */

const CACHE = "bharat-map-quiz-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/app.js",
  "./src/data.js",
  "./src/geo.js",
  "./src/achievements.js",
  "./src/i18n.js",
  "./src/map.js",
  "./src/map-data.js",
  "./src/quiz.js",
  "./src/store.js",
  "./src/audio.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/favicon-64.png",
  "./assets/icons/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // refresh in the background, serve instantly
        fetch(request)
          .then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
