/* Men's Wear — offline shell.
   The page itself lives on a CDN; this worker keeps the last copy so the app
   opens even on a weak 2G connection or with no data at all. */
var VERSION = "mw-app-v18";
var SHELL = "/";
var CDN_HOSTS = ["cdn.jsdelivr.net", "cdn.statically.io", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.add(new Request(SHELL, { cache: "reload" })).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isCdn(url) {
  return CDN_HOSTS.indexOf(url.hostname) > -1;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // navigation: network first, then whatever we last saved
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(SHELL, copy); });
        return res;
      }).catch(function () {
        return caches.match(SHELL).then(function (hit) {
          return hit || new Response(
            "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>" +
            "<body style='margin:0;background:#f2eee3;color:#16160f;font-family:system-ui;display:grid;place-items:center;height:100vh;text-align:center'>" +
            "<div><p style='letter-spacing:.4em;font-size:.9rem'>MEN'S WEAR</p>" +
            "<p style='color:#6b6b55;font-size:.7rem'>No internet — please try again</p></div></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        });
      })
    );
    return;
  }

  // CDN content (page, css, js, photos, fonts): cache first, refresh behind
  if (isCdn(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var network = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === "opaque")) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || network;
      })
    );
    return;
  }

  // same-origin files: cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
      })
    );
  }
});
