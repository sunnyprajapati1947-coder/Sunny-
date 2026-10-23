/* Vercel build step: pull the built bundle, the authored Kage document and its
   assets from the CDN into this deployment, so the page and the iframe it loads
   are served first-party (same origin). Text files are hash-checked. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CDN = "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@kage-v1/mens-wear/kage-app/dist/";

const ASSETS = [
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

const TEXT = [
  ["assets/index-CHYk7ZYP.js", null],
  ["assets/index-CkD_5ZM3.css", null],
  ["landing-pages/secret-pathways-assets/three.min.js", null],
  ["landing-pages/secret-pathways-assets/fonts.css", "985f85a904a4096f92c06552b06f42a45973ac004af4780d68f18af65ddcc1b0"],
  ["landing-pages/kage.html", "c8e06b90397ac246baf0ab6f32f5f6b570acc6fe03c7009f711b579fb72d9f49"],
];

async function grab(path) {
  const res = await fetch(CDN + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return body;
}

let count = 0;
for (const [path, expected] of TEXT) {
  const body = await grab(path);
  if (expected) {
    const hash = createHash("sha256").update(body).digest("hex");
    if (hash !== expected) throw new Error(`${path}: hash ${hash} != ${expected}`);
  }
  count += 1;
}
for (const path of ASSETS) {
  await grab(path);
  count += 1;
}
console.log(`kage: fetched ${count} files, kage.html and fonts.css hash-verified`);
