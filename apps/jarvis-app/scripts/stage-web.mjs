#!/usr/bin/env node
/* Copy the offline web app into www/ for Capacitor. No bundler, no network. */
import { cp, mkdir, rm, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const src = resolve(appRoot, "..", "jarvis-pocket");
const out = join(appRoot, "www");
const ITEMS = ["index.html", "assets", "icons", "data", "vendor", "manifest.webmanifest", "sw.js"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const item of ITEMS) {
  await cp(join(src, item), join(out, item), { recursive: true });
}

// The APK ships its own shell; a service worker there only risks stale JS.
await rm(join(out, "sw.js"), { force: true });
const html = await readFile(join(out, "index.html"), "utf8");
if (!html.includes("assets/js/native.js")) {
  throw new Error("index.html is missing the native bridge script");
}
const patched = html.replace(/\s*<link rel="manifest"[^>]*>/, "");
await writeFile(join(out, "index.html"), patched);

console.log(`staged ${((await dirBytes(out)) / 1024 / 1024).toFixed(1)} MB into ${out}`);

async function dirBytes(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  let sum = 0;
  for (const entry of await readdir(path)) sum += await dirBytes(join(path, entry));
  return sum;
}
