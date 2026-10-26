/* Jarvis Pocket — offline app shell + knowledge pack cache. */
'use strict';

const VERSION = 'jarvis-v5';
const SHELL_CACHE = VERSION + '-shell';
const DATA_CACHE = VERSION + '-data';
const IMAGE_CACHE = VERSION + '-img';

const SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/core.js',
  'assets/js/db.js',
  'assets/js/pack.js',
  'assets/js/memory.js',
  'assets/js/kb.js',
  'assets/js/model.js',
  'assets/js/tools.js',
  'assets/js/code.js',
  'assets/js/dash.js',
  'assets/js/llm.js',
  'assets/js/voice.js',
  'assets/js/markdown.js',
  'assets/js/chat.js',
  'assets/js/library.js',
  'assets/js/app.js',
  'assets/js/mem.js',
  'assets/js/local-brain.js',
  'assets/js/brain.js',
  'assets/js/tasks.js',
  'assets/js/connections.js',
  'assets/js/video.js',
  'assets/js/setup.js',
  'assets/js/native.js',
  'assets/js/vendor/marked.js',
  'assets/js/vendor/purify.min.js',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/favicon-48.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(async (asset) => {
      try {
        await cache.add(new Request(asset, { cache: 'reload' }));
      } catch (error) {
        // A single missing asset must not block install.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.indexOf('jarvis-') === 0 && key.indexOf(VERSION) !== 0)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isData(url) {
  return url.pathname.indexOf('/data/') !== -1;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const response = await network;
  if (response) return response;
  throw new Error('offline and not cached');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('index.html') || await cache.match('./');
        if (cached) return cached;
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="background:#07080d;color:#e9edf7;font-family:system-ui;padding:32px">' +
          '<h1>Offline</h1><p>Jarvis Pocket shell could not load. Reconnect once, then it works offline.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
        );
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('data/manifest.json')) {
      event.respondWith(networkFirst(request, DATA_CACHE));
      return;
    }
    if (isData(url)) {
      event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (/raw\.githubusercontent\.com$/.test(url.hostname) || /githubusercontent\.com$/.test(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  }
});
