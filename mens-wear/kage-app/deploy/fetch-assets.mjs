/* Vercel build step for nawada-menswear-shop.

   Site layout
     /                  the shop (shopping homepage, the thing people came for)
     /shop/             a redirect to / so every old shared link still lands right
     /experience/kage/  the Kage landing page, untouched, as its own experience
     /admin/            the owner panel: live orders, sign-in only

   The deployment payload is text-only, so this step materialises the binaries:
   it pulls the Kage bundle, the authored Kage document with its assets, and the
   shop entry, then hash-checks the files that must stay identical. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const KAGE = "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@kage-v3/mens-wear/kage-app/dist/";
const SHOP = "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@app-v17/mens-wear/";

const KAGE_TEXT = [
  ["assets/index-CD3ZoDni.js", null],
  ["assets/index-BneqYYAL.css", null],
  ["landing-pages/secret-pathways-assets/three.min.js", null],
  ["landing-pages/secret-pathways-assets/fonts.css", "985f85a904a4096f92c06552b06f42a45973ac004af4780d68f18af65ddcc1b0"],
  ["landing-pages/kage.html", "c8e06b90397ac246baf0ab6f32f5f6b570acc6fe03c7009f711b579fb72d9f49"],
];

const KAGE_ASSETS = [
  "landing-pages/secret-pathways-assets/generated/kage-approach.webp",
  "landing-pages/secret-pathways-assets/generated/kage-lantern-court.webp",
  "landing-pages/secret-pathways-assets/generated/kage-moonwater.webp",
  "landing-pages/secret-pathways-assets/generated/kage-sanmon-preview.webp",
  "landing-pages/secret-pathways-assets/foreground/png/basalt-stones.webp",
  "landing-pages/secret-pathways-assets/foreground/png/garden-bush.webp",
  "landing-pages/secret-pathways-assets/foreground/png/hill.webp",
  "landing-pages/secret-pathways-assets/foreground/png/maple-leaves.webp",
  "landing-pages/secret-pathways-assets/foreground/png/pine-tree.webp",
  "landing-pages/secret-pathways-assets/foreground/png/sakura-branch.webp",
  "landing-pages/secret-pathways-assets/foreground/png/shrine-ruins.webp",
  "landing-pages/secret-pathways-assets/foreground/png/stone-lantern.webp",
  "landing-pages/secret-pathways-assets/foreground/png/tall-grass.webp",
  "landing-pages/secret-pathways-assets/foreground/png/temple-wall.webp",
];

/* the shop shell becomes the site root; CSS/JS/images load from the CDN tag */
const SHOP_FILES = [
  ["index.html", "live/vercel-entry.html"],
  ["admin/index.html", "kage-app/deploy/admin.html"],
];

/* the Kage shell: mounts the bundle above and gets out of the way */
const KAGE_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#080808" />
    <title>Kage — Where stillness reveals the unseen</title>
    <meta name="description" content="Kage — a ThreeUI landing page rendered from the @designcodeio/threeui KageLandingPage component." />
    <script type="module" src="/assets/index-CD3ZoDni.js"></script>
    <link rel="stylesheet" href="/assets/index-BneqYYAL.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/* Kage's own button points at /shop/, and that URL has been shared before, so
   keep it alive as a redirect rather than a second copy of the store. */
const SHOP_REDIRECT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Men's Wear — Nawada</title>
<link rel="canonical" href="/">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=/">
</head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p>The shop now opens at the front of the site. <a href="/">Continue to Men's Wear</a>.</p>
</body>
</html>
`;

async function grab(url, target) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${target}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
  return body;
}

async function put(text, target) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

let count = 0;
for (const [path, expected] of KAGE_TEXT) {
  const body = await grab(KAGE + path, path);
  if (expected) {
    const hash = createHash("sha256").update(body).digest("hex");
    if (hash !== expected) throw new Error(`${path}: hash ${hash} != ${expected}`);
  }
  count += 1;
}
for (const path of KAGE_ASSETS) {
  await grab(KAGE + path, path);
  count += 1;
}
for (const [target, path] of SHOP_FILES) {
  const body = await grab(SHOP + path, target);
  if (body.length < 900) throw new Error(`${target}: suspiciously small (${body.length} B)`);
  count += 1;
}
await put(SHOP_REDIRECT, "shop/index.html");
count += 1;
await put(KAGE_SHELL, "experience/kage/index.html");
count += 1;

console.log(`build: materialised ${count} files (kage.html + fonts.css hash-verified)`);
