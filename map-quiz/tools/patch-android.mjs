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
// the adaptive foreground is cropped hard by the launcher mask, so it uses the
// maskable artwork (more internal padding) instead of the plain icon
const foregroundArt = existsSync(join(root, "assets/icons/maskable-512.png"))
  ? join(root, "assets/icons/maskable-512.png")
  : icon;
const foregrounds = [
  join(res, "drawable/ic_launcher_foreground.png"),
  join(res, "drawable-v24/ic_launcher_foreground.png"),
  join(res, "mipmap-xxxhdpi/ic_launcher_foreground.png"),
];
for (const path of foregrounds) if (existsSync(path)) copyFileSync(foregroundArt, path);
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

/* 3. version + dark background colour resource.
 * package.json is the single source of truth: "1.1.0" becomes versionName 1.1
 * and versionCode 2 (major * 100 + minor * 10 + patch). */
const gradlePath = join(android, "app/build.gradle");
if (existsSync(gradlePath)) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const [major = 1, minor = 0, patch = 0] = String(pkg.version || "1.0.0")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const versionName = `${major}.${minor}`;
  const versionCode = major * 100 + minor * 10 + patch;
  let gradle = readFileSync(gradlePath, "utf8");
  gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${versionName}"`);
  writeFileSync(gradlePath, gradle);
  log(`version ${versionName} (code ${versionCode}) set`);
}

/* 4. release signing — driven by android/keystore.properties (written by CI),
 * so the build never depends on environment variables being present while
 * Gradle configures the project. */
if (existsSync(gradlePath)) {
  const gradleFile = readFileSync(gradlePath, "utf8");
  if (!gradleFile.includes("keystoreProperties")) {
    let gradle = gradleFile;
    gradle = gradle.replace(
      /apply plugin: 'com\.android\.application'/,
      `apply plugin: 'com.android.application'

def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}`
    );
    gradle = gradle.replace(
      /(\n\s*compileSdk [^\n]*\n)/,
      `$1
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`
    );
    gradle = gradle.replace(
      /release \{\n(\s*)minifyEnabled false/,
      "release {\n$1signingConfig signingConfigs.release\n$1minifyEnabled false"
    );
    writeFileSync(gradlePath, gradle);
    log("release signing wired to android/keystore.properties");
  }

  const props = join(android, "keystore.properties");
  if (!existsSync(props) && process.env.BHARAT_STORE_PASSWORD) {
    writeFileSync(
      props,
      [
        "storeFile=release.jks",
        `storePassword=${process.env.BHARAT_STORE_PASSWORD}`,
        "keyAlias=bharat",
        `keyPassword=${process.env.BHARAT_KEY_PASSWORD || process.env.BHARAT_STORE_PASSWORD}`,
        "",
      ].join("\n")
    );
    log("keystore.properties written from the environment");
  }
  log(
    existsSync(props)
      ? `signing ready (keystore present: ${existsSync(join(android, "release.jks"))})`
      : "no keystore.properties — the APK would be unsigned"
  );
}

/* 5. themes: replace the template styles with a dark, reference-free theme.
 * The Capacitor template ships styles.xml entries pointing at @color/colorPrimary
 * etc. with no colors.xml in the app, and adding our own @color reference on top
 * broke the aapt2 link step. A literal, complete styles.xml removes that class of
 * failure entirely. */
const stylesPath = join(res, "values/styles.xml");
const STYLES = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Bharat Map Quiz: dark shell, no action bar, no white flash at launch. -->
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">#0b1220</item>
        <item name="android:statusBarColor">#0b1220</item>
        <item name="android:navigationBarColor">#0b1220</item>
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">#0b1220</item>
        <item name="android:statusBarColor">#0b1220</item>
        <item name="android:navigationBarColor">#0b1220</item>
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;
writeFileSync(stylesPath, STYLES);
log("dark theme written");

// keep splash drawables pointing at something that exists
const splash = ["drawable/splash.png", "drawable/splash.xml", "drawable-port-mdpi/splash.png"];
if (!splash.some((rel) => existsSync(join(res, rel)))) {
  log("warning: no splash drawable in the template — splash background kept as-is");
}

/* 6. static resource validation: fail here with a readable message instead of
 * deep inside gradle. Catches unresolved @color/@drawable/@style references. */
function definedResources() {
  const defined = new Set();
  for (const dir of readdirSync(res)) {
    const dirPath = join(res, dir);
    if (!statSync(dirPath).isDirectory()) continue;
    const type = dir.split("-")[0];
    for (const file of readdirSync(dirPath)) {
      const base = file.replace(/\.(xml|png|webp|jpg|jpeg|9\.png)$/, "");
      if (base !== file) defined.add(`${type}/${base}`);
      if (file.endsWith(".xml")) {
        const xml = readFileSync(join(dirPath, file), "utf8");
        for (const match of xml.matchAll(/<(color|style|string|dimen|integer|bool)\s[^>]*name="([^"]+)"/g)) {
          defined.add(`${match[1]}/${match[2]}`);
        }
        for (const match of xml.matchAll(/<item\s+type="(\w+)"\s+name="([^"]+)"/g)) {
          defined.add(`${match[1]}/${match[2]}`);
        }
      }
    }
  }
  return defined;
}

const defined = definedResources();
const missing = new Set();
function allResXml() {
  const files = [];
  for (const dir of readdirSync(res)) {
    const dirPath = join(res, dir);
    if (!statSync(dirPath).isDirectory()) continue;
    for (const file of readdirSync(dirPath)) {
      if (file.endsWith(".xml")) files.push(join(dirPath, file));
    }
  }
  return files;
}

const scanFiles = [join(android, "app/src/main/AndroidManifest.xml"), ...allResXml()];
for (const file of scanFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/@(color|drawable|style|mipmap|string|dimen)\/([\w.]+)/g)) {
    const key = `${match[1] === "mipmap" ? "mipmap" : match[1]}/${match[2]}`;
    if (!defined.has(key) && !missing.has(key)) missing.add(key);
  }
}
if (missing.size) {
  console.error("[patch-android] unresolved android resources:", [...missing].join(", "));
  process.exit(1);
}
log(`android resources validated (${defined.size} defined, 0 unresolved)`);

log("android project patched");
