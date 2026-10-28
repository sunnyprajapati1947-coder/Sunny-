#!/usr/bin/env python3
"""Build the downloadable artifacts in download/.

1. bharat-map-quiz.html — one self-contained file (CSS, JS and map data inlined).
   Double-click it and the whole quiz runs offline, no server needed.
2. bharat-map-quiz.zip — the installable PWA folder, ready to upload to any static host.

    python3 tools/bundle.py
"""

from __future__ import annotations

import base64
import os
import re
import zipfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "download")

MODULE_ORDER = [
    "src/data.js",
    "src/geo.js",
    "src/store.js",
    "src/quiz.js",
    "src/i18n.js",
    "src/audio.js",
    "src/achievements.js",
    "src/map.js",
    "src/app.js",
]

# files copied into the zip next to the single-file index.html
BUNDLE_FILES = [
    "manifest.webmanifest",
    "assets/icons/icon-192.png",
    "assets/icons/icon-512.png",
    "assets/icons/icon-180.png",
    "assets/icons/favicon-64.png",
    "assets/icons/maskable-512.png",
]

README = """Bharat Map Quiz — the whole game in one file
============================================

HOW TO PLAY ON A LAPTOP / PC
  1. Unzip this folder.
  2. Double-click  index.html  (Windows, macOS, Linux — any browser).
     That is it: the complete quiz lives inside that one file. No server,
     no installation, no internet needed.
  3. If the browser asks what to do with the file, right-click index.html and
     choose "Open with" -> Chrome / Edge / Firefox.

ON AN ANDROID PHONE
  Use the APK instead (Bharat-Map-Quiz.apk from the same download page).
  An APK is an Android app — it cannot run on a laptop or PC.
  On an iPhone, open this index.html in Safari and use Share -> Add to Home Screen.

PLAYING OFFLINE
  index.html needs no network at all. Progress is saved in the browser storage
  of whichever device you play on.

HOSTING (optional)
  Upload this folder to any static host (GitHub Pages, Netlify, Vercel) and the
  page also installs as an app via "Add to Home screen" — manifest.webmanifest
  and sw.js are included for that.

Map data: datta07/INDIAN-SHAPEFILES (MIT licence), derived from Census/LGD boundaries.
"""

# service worker for the zip: only the single-file page and the icons exist there
ZIP_SW = """/* Offline-first service worker for the standalone web build. */

const CACHE = "bharat-map-quiz-standalone-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/favicon-64.png",
  "./assets/icons/maskable-512.png",
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
      if (cached) return cached;
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
"""


def read(rel: str) -> str:
    with open(os.path.join(ROOT, rel), encoding="utf-8") as handle:
        return handle.read()


def strip_module_syntax(code: str) -> str:
    code = re.sub(r"import\s*\{[^}]*\}\s*from\s*[\"'][^\"']+[\"'];?", "", code, flags=re.S)
    code = re.sub(r"import\s+[\w*\s,]+\s+from\s*[\"'][^\"']+[\"'];?", "", code)
    code = re.sub(r"^export\s+\{[^}]*\};?", "", code, flags=re.M)
    code = re.sub(r"^export\s+", "", code, flags=re.M)
    return code.strip()


def data_uri(path: str, mime: str) -> str:
    with open(path, "rb") as handle:
        return f"data:{mime};base64," + base64.b64encode(handle.read()).decode("ascii")


def build_html() -> str:
    html = read("index.html")

    html = re.sub(
        r'\s*<link rel="manifest" href="manifest.webmanifest" />', "", html)
    html = re.sub(
        r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(
        r'\s*<link rel="apple-touch-icon"[^>]*>', "", html)

    favicon = data_uri(os.path.join(ROOT, "assets/icons/favicon-64.png"), "image/png")
    apple = data_uri(os.path.join(ROOT, "assets/icons/icon-180.png"), "image/png")
    html = html.replace(
        "</title>",
        "</title>\n    <link rel=\"icon\" href=\"%s\" />\n    <link rel=\"apple-touch-icon\" href=\"%s\" />"
        % (favicon, apple),
    )

    css = read("src/styles.css")
    html = html.replace(
        '<link rel="stylesheet" href="src/styles.css" />',
        "<style>\n" + css + "\n</style>",
    )

    map_js = read("src/map-data.js")
    html = html.replace(
        '<script src="src/map-data.js"></script>',
        "<script>\n" + map_js + "\n</script>",
    )

    parts = ["/* Bharat Map Quiz — single-file build (generated by tools/bundle.py) */"]
    for rel in MODULE_ORDER:
        parts.append(f"\n/* ---- {rel} ---- */\n" + strip_module_syntax(read(rel)))
    bundle = "\n".join(parts)

    html = html.replace(
        '<script type="module" src="src/app.js"></script>',
        "<script>window.__SINGLE_FILE__ = true;</script>\n<script>\n" + bundle + "\n</script>",
    )
    return html


def build_zip(path: str, html: str) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        # the single-file build becomes index.html so that double-clicking works
        # on a laptop — ES modules are blocked over file:// URLs
        archive.writestr("bharat-map-quiz/index.html", html)
        archive.writestr("bharat-map-quiz/sw.js", ZIP_SW)
        for rel in BUNDLE_FILES:
            archive.write(os.path.join(ROOT, rel), f"bharat-map-quiz/{rel}")
        archive.writestr("bharat-map-quiz/README.txt", README)


def check_zip(path: str, html: str) -> None:
    """The zip must work when a laptop user simply double-clicks index.html."""
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        for required in ("bharat-map-quiz/index.html", "bharat-map-quiz/README.txt", "bharat-map-quiz/sw.js"):
            if required not in names:
                raise SystemExit(f"zip is missing {required}")
        packed = archive.read("bharat-map-quiz/index.html").decode("utf-8")
        if packed != html:
            raise SystemExit("zip index.html does not match the single-file build")
        if 'type="module"' in packed:
            raise SystemExit("zip index.html still needs a server (ES modules over file://)")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    html_path = os.path.join(OUT_DIR, "bharat-map-quiz.html")
    zip_path = os.path.join(OUT_DIR, "bharat-map-quiz.zip")

    html = build_html()
    with open(html_path, "w", encoding="utf-8") as handle:
        handle.write(html)
    build_zip(zip_path, html)
    check_zip(zip_path, html)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(os.path.join(OUT_DIR, "VERSION.txt"), "w", encoding="utf-8") as handle:
        handle.write(f"Bharat Map Quiz build — {stamp}\n")

    for path in (html_path, zip_path):
        print(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
