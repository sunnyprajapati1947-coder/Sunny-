/* Prepare the Capacitor web directory + config for the Android build.
 * Run from map-quiz/:  node tools/prepare-android.mjs
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function log(message) {
  console.log(`[prepare-android] ${message}`);
}

const singleFile = join(root, "download", "bharat-map-quiz.html");
if (!existsSync(singleFile)) {
  console.error("[prepare-android] download/bharat-map-quiz.html is missing — run: python3 tools/bundle.py");
  process.exit(1);
}

/* 1. web directory: one self-contained html file (no module/CORS issues in a WebView) */
const www = join(root, "www");
rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, "assets"), { recursive: true });
cpSync(singleFile, join(www, "index.html"));
cpSync(join(root, "assets/icons/icon-192.png"), join(www, "assets/icon-192.png"));
cpSync(join(root, "assets/icons/icon-512.png"), join(www, "assets/icon-512.png"));
log("www/ prepared from the single-file build");

/* 2. capacitor config */
const config = {
  appId: "app.bharatmapquiz",
  appName: "Bharat Map Quiz",
  webDir: "www",
  bundledWebRuntime: false,
  android: {
    backgroundColor: "#0b1220",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: { androidScheme: "https" },
};
writeFileSync(join(root, "capacitor.config.json"), `${JSON.stringify(config, null, 2)}\n`);
log("capacitor.config.json written");
