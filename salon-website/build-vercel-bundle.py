#!/usr/bin/env python3
"""Build the compact static payload used for direct Vercel deployment.

The repository's salon photos remain in GitHub and are referenced by commit SHA;
CSS/JS and small SVG controls are bundled into the page, then the HTML is wrapped
in a gzip bootstrap to keep direct Vercel uploads compact. Run after committing
and pushing the source branch.
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parent
REPO_DIR = SITE_DIR.parent
OUTPUT_DIR = REPO_DIR / ".vercel-upload"
REPOSITORY = "sunnyprajapati1947-coder/Sunny-"
BRANCH_PATH = "arena/01e737c4-sunny"


def git_revision() -> str:
    revision = os.environ.get("SALON_ASSET_REV", "").strip()
    if revision:
        return revision
    return subprocess.check_output(
        ["git", "-C", str(REPO_DIR), "rev-parse", "HEAD"], text=True
    ).strip()


def ensure_committed_asset(revision: str, relative_path: str) -> None:
    result = subprocess.run(
        ["git", "-C", str(REPO_DIR), "cat-file", "-e", f"{revision}:{relative_path}"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode:
        raise SystemExit(
            f"{relative_path} is not present in commit {revision}. Commit and push the site first."
        )


def base64_gzip(path: Path) -> str:
    return base64.b64encode(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0)).decode("ascii")


def make_loader(revision: str) -> str:
    asset_base = f"https://raw.githubusercontent.com/{REPOSITORY}/{revision}/salon-website"
    packed = {
        "styles": base64_gzip(SITE_DIR / "styles.css"),
        "script": base64_gzip(SITE_DIR / "script.js"),
    }
    packed_json = json.dumps(packed, separators=(",", ":"))
    fallback_base = json.dumps(asset_base)
    return f"""\n<script id="salon-asset-loader">
(() => {{
  const packed = {packed_json};
  const sourceBase = {fallback_base};

  function loadSourceFallback() {{
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${{sourceBase}}/styles.css`;
    document.head.appendChild(stylesheet);
    const script = document.createElement("script");
    script.src = `${{sourceBase}}/script.js`;
    document.body.appendChild(script);
  }}

  async function unpack(value) {{
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const compressed = new Blob([bytes]).stream();
    const decompressed = compressed.pipeThrough(new DecompressionStream("gzip"));
    return new Response(decompressed).text();
  }}

  if (!("DecompressionStream" in window)) {{
    loadSourceFallback();
    return;
  }}

  Promise.all([unpack(packed.styles), unpack(packed.script)])
    .then(([styles, scriptText]) => {{
      const style = document.createElement("style");
      style.textContent = styles;
      document.head.appendChild(style);
      const script = document.createElement("script");
      script.textContent = scriptText;
      document.body.appendChild(script);
    }})
    .catch((error) => {{
      console.error("Salon assets could not be unpacked; loading the GitHub fallback.", error);
      loadSourceFallback();
    }});
}})();
</script>
"""


def make_document_shell(document_html: str, revision: str) -> str:
    compressed = gzip.compress(document_html.encode("utf-8"), compresslevel=9, mtime=0)
    payload = json.dumps(base64.b64encode(compressed).decode("ascii"))
    source_base = json.dumps(
        f"https://raw.githubusercontent.com/{REPOSITORY}/{revision}/salon-website"
    )
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#171715">
  <meta name="description" content="A premium men's salon in Sudama Nagar, Nawada. Book a haircut or grooming appointment with Nitish Jatav, a barber with 10 years of experience.">
  <meta property="og:title" content="Men's Salon">
  <meta property="og:description" content="A sharper cut, a calmer hour. Meet Nitish Jatav and book your appointment in Sudama Nagar, Nawada.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://mens-salon-ten.vercel.app/">
  <meta property="og:image" content="https://raw.githubusercontent.com/{REPOSITORY}/{revision}/salon-website/assets/salon-interior.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/app-icon.svg">
  <title>Men's Salon</title>
  <script type="application/ld+json">{{
    "@context": "https://schema.org",
    "@type": "BarberShop",
    "name": "Men's Salon",
    "telephone": "+91-96080-87035",
    "address": {{
      "@type": "PostalAddress",
      "streetAddress": "Sudama Nagar",
      "addressLocality": "Nawada",
      "addressRegion": "Bihar",
      "postalCode": "805110",
      "addressCountry": "IN"
    }},
    "employee": {{ "@type": "Person", "name": "Nitish Jatav", "jobTitle": "Barber" }},
    "availableLanguage": ["English", "Hindi"]
  }}</script>
  <style>
    :root {{ color-scheme: dark; font-family: system-ui, sans-serif; background: #171715; color: #f2eee5; }}
    body {{ min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 2rem; box-sizing: border-box; text-align: center; }}
    #loader {{ max-width: 32rem; color: #c5a36a; }}
    noscript {{ display: block; max-width: 32rem; }}
  </style>
</head>
<body>
  <main id="loader" role="status" aria-live="polite">Loading Men's Salon…</main>
  <noscript><h1>Men's Salon</h1><p>Enable JavaScript to load the bilingual salon website and booking tools.</p></noscript>
  <script>
  (() => {{
    const payload = {payload};
    const sourceBase = {source_base};
    const message = document.getElementById("loader");

    function showError() {{
      if (message) message.textContent = "The salon page could not load. Please check your connection and refresh.";
    }}

    function render(html) {{
      document.open();
      document.write(html);
      document.close();
    }}

    function fixFallbackPaths(html) {{
      return html
        .replace('href="icons/icon-180.png"', 'href="/app-icon.svg"')
        .replace('href="manifest.webmanifest"', 'href="/manifest.webmanifest"')
        .replace('href="styles.css"', `href="${{sourceBase}}/styles.css"`)
        .replace('src="script.js"', `src="${{sourceBase}}/script.js"`)
        .replace(/(src|href)="assets\\/([^"]+)"/g, (_match, attribute, path) => `${{attribute}}="${{sourceBase}}/assets/${{path}}"`);
    }}

    async function loadFallback() {{
      try {{
        const response = await fetch(`${{sourceBase}}/index.html`);
        if (!response.ok) throw new Error(`Source fallback returned ${{response.status}}`);
        render(fixFallbackPaths(await response.text()));
      }} catch (error) {{
        console.error("Could not load the salon page.", error);
        showError();
      }}
    }}

    async function load() {{
      if (!("DecompressionStream" in window)) {{
        await loadFallback();
        return;
      }}
      try {{
        const binary = atob(payload);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        render(await new Response(stream).text());
      }} catch (error) {{
        console.error("Could not unpack the salon page; trying the source fallback.", error);
        await loadFallback();
      }}
    }}

    load();
  }})();
  </script>
</body>
</html>
'''


def make_service_worker(photo_urls: list[str]) -> str:
    urls = json.dumps(photo_urls, separators=(",", ":"))
    return f'''const CACHE_NAME = "mens-salon-shell-v4";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/app-icon.svg"];
const REMOTE_MEDIA = {urls};

self.addEventListener("install", (event) => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.all(REMOTE_MEDIA.map(async (url) => {{
      try {{
        const response = await fetch(url, {{ mode: "cors" }});
        if (response.ok) await cache.put(url, response);
      }} catch (_) {{
        // Keep installation available if GitHub image caching is unavailable.
      }}
    }}));
    await self.skipWaiting();
  }})());
}});

self.addEventListener("activate", (event) => {{
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("mens-salon-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
}});

self.addEventListener("fetch", (event) => {{
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (REMOTE_MEDIA.includes(url.href)) {{
    event.respondWith((async () => {{
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.href);
      if (cached) return cached;
      try {{
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") await cache.put(url.href, response.clone());
        return response;
      }} catch (_) {{
        return Response.error();
      }}
    }})());
    return;
  }}

  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {{
    event.respondWith(fetch(request).then(async (response) => {{
      if (response.ok) {{
        const cache = await caches.open(CACHE_NAME);
        await cache.put("/", response.clone());
      }}
      return response;
    }}).catch(async () => (await caches.match(request)) || caches.match("/")));
    return;
  }}

  event.respondWith(caches.match(request).then((cached) => {{
    if (cached) return cached;
    return fetch(request).then(async (response) => {{
      if (response.ok) {{
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }}
      return response;
    }});
  }}));
}});
'''


def main() -> None:
    revision = git_revision()
    for photo in ("salon-interior.jpg", "nitish-jatav.jpg"):
        ensure_committed_asset(revision, f"salon-website/assets/{photo}")

    asset_base = f"https://raw.githubusercontent.com/{REPOSITORY}/{revision}/salon-website/assets"
    photo_urls = [f"{asset_base}/{name}" for name in ("salon-interior.jpg", "nitish-jatav.jpg")]
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")

    removals = (
        '  <link rel="stylesheet" href="styles.css">\n',
        '  <script defer src="script.js"></script>\n',
        '  <link rel="preload" as="image" href="assets/salon-interior.jpg">\n',
    )
    for markup in removals:
        if html.count(markup) != 1:
            raise SystemExit(f"Expected one source tag to bundle, found {html.count(markup)}: {markup.strip()}")
        html = html.replace(markup, "", 1)

    html = html.replace('href="icons/icon-180.png"', 'href="/app-icon.svg"', 1)
    html = html.replace(
        f"https://raw.githubusercontent.com/{REPOSITORY}/{BRANCH_PATH}/salon-website/assets/salon-interior.jpg",
        f"{asset_base}/salon-interior.jpg",
    )
    for name, url in zip(("salon-interior.jpg", "nitish-jatav.jpg"), photo_urls):
        html = html.replace(f'src="assets/{name}"', f'src="{url}"')

    def inline_icon(match: re.Match[str]) -> str:
        icon_path = SITE_DIR / "assets" / "lucide" / match.group(1)
        data = base64.b64encode(icon_path.read_bytes()).decode("ascii")
        return f'src="data:image/svg+xml;base64,{data}"'

    html, icon_count = re.subn(r'src="assets/lucide/([a-z0-9-]+\.svg)"', inline_icon, html)
    if icon_count < 1:
        raise SystemExit("No Lucide icon references were bundled.")

    if "</body>" not in html:
        raise SystemExit("Could not find </body> in source HTML.")
    html = html.replace("</body>", make_loader(revision) + "</body>", 1)

    manifest = json.loads((SITE_DIR / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest["icons"] = [{
        "src": "/app-icon.svg",
        "sizes": "any",
        "type": "image/svg+xml",
        "purpose": "any",
    }]
    for shortcut in manifest.get("shortcuts", []):
        shortcut["icons"] = [{
            "src": "/app-icon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
        }]

    if OUTPUT_DIR.exists():
        marker = OUTPUT_DIR / ".generated-by-salon-bundler"
        if not marker.is_file():
            raise SystemExit(f"Refusing to replace unmarked directory: {OUTPUT_DIR}")
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)
    (OUTPUT_DIR / ".generated-by-salon-bundler").write_text("generated\n", encoding="utf-8")
    (OUTPUT_DIR / "index.html").write_text(make_document_shell(html, revision), encoding="utf-8")
    (OUTPUT_DIR / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT_DIR / "sw.js").write_text(make_service_worker(photo_urls), encoding="utf-8")
    shutil.copy2(SITE_DIR / "app-icon.svg", OUTPUT_DIR / "app-icon.svg")

    print(f"Prepared {OUTPUT_DIR} for asset commit {revision}.")
    for path in sorted(OUTPUT_DIR.iterdir()):
        if path.is_file() and not path.name.startswith("."):
            print(f"  {path.name}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
