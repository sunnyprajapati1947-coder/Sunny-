/* Post-process the generated Capacitor Android project: launcher icons, app name,
 * version, and a dark window background so there is no white flash at launch.
 * Run after `npx cap add android && npx cap sync android`.
 */

import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const android = join(root, "android");
const res = join(android, "app/src/main/res");
const log = (message) => console.log(`[patch-android] ${message}`);

if (!existsSync(android)) {
  console.error("[patch-android] android/ not found — run: npx cap add android");
  process.exit(1);
}

/* 1. launcher icons — our tricolour India silhouette in every density */
const icon = join(root, "assets/icons/icon-512.png");
let iconCount = 0;
for (const density of readdirSync(res)) {
  const dir = join(res, density);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    if (/^ic_launcher.*\.png$/.test(file)) {
      copyFileSync(icon, join(dir, file));
      iconCount += 1;
    }
  }
}
// adaptive icon foreground: keep the India silhouette centred in the safe zone
const foregrounds = [
  join(res, "drawable/ic_launcher_foreground.png"),
  join(res, "drawable-v24/ic_launcher_foreground.png"),
  join(res, "mipmap-xxxhdpi/ic_launcher_foreground.png"),
];
for (const path of foregrounds) if (existsSync(path)) copyFileSync(icon, path);
log(`replaced ${iconCount} launcher icon files`);

/* 2. app name */
const stringsPath = join(res, "values/strings.xml");
if (existsSync(stringsPath)) {
  let xml = readFileSync(stringsPath, "utf8");
  xml = xml.replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">Bharat Map Quiz</string>');
  xml = xml.replace(
    /<string name="title_activity_main">.*?<\/string>/,
    '<string name="title_activity_main">Bharat Map Quiz</string>'
  );
  writeFileSync(stringsPath, xml);
  log("app name set");
}

/* 3. version + dark background colour resource */
const gradlePath = join(android, "app/build.gradle");
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, "utf8");
  gradle = gradle.replace(/versionCode \d+/, "versionCode 1");
  gradle = gradle.replace(/versionName "[^"]*"/, 'versionName "1.0"');
  writeFileSync(gradlePath, gradle);
  log("version 1.0 (code 1) set");
}

const colorsPath = join(res, "values/colors.xml");
if (existsSync(colorsPath)) {
  let colors = readFileSync(colorsPath, "utf8");
  if (!colors.includes("app_background")) {
    colors = colors.replace(
      "</resources>",
      '    <color name="app_background">#0b1220</color>\n</resources>'
    );
    writeFileSync(colorsPath, colors);
  }
  log("dark background colour added");
}

/* 4. no white flash: window background from our colour */
const stylesPath = join(res, "values/styles.xml");
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, "utf8");
  if (!styles.includes("android:windowBackground")) {
    styles = styles.replace(
      /<style name="AppTheme\.NoActionBar"[^>]*>/,
      (match) => `${match}\n        <item name="android:windowBackground">@color/app_background</item>`
    );
    writeFileSync(stylesPath, styles);
  }
  log("window background styled");
}

log("android project patched");
