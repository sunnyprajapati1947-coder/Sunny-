# Spdyi Pro — Sensitivity & Device Lab

Mobile-first Free Fire MAX companion with a PWA and a packaged Capacitor Android project. The original Python project at the repository root is unchanged.

## Run

```sh
cd spdyi
npm ci
npm run dev
```

## Verify and publish

```sh
npm test
npm run build
npm run preview
```

Deploy `spdyi/dist` to a static HTTPS host, with `spdyi` as the project root, `npm run build` as the build command and `dist` as the output. No backend, credentials or database is required. The domain `spdyi.com` is only a requested name: it has not been registered or configured by this project. Configure it with your hosting provider only if you own it.

## Install as an app

The manifest, PNG icons and production-only service worker support home-screen installation and offline revisits after the first full load. Use Chrome's Install app menu on Android or Safari's Share → Add to Home Screen on iOS. HTTPS and a supported browser are required. PWA installation is separate from the native Android project. See [PRO.md](PRO.md) for the APK build, read-only Android diagnostics, platform limitations and the distinction between testing builds and production releases.

## Pro modules

Read-only device scanner, cancellable app frame-pacing trial, multitouch/9-zone canvas, swipe consistency report, gameplay feedback, optional current settings, evidence labels, old/new charts, JSON export and a local ten-profile vault. Unknown hardware information is visibly unavailable, never replaced by a fake scan. All sensitivity values stay within 0–200.

```sh
npm run android:build  # needs JDK 21 / Android SDK 35 + signing env (SIGNING.md)
```

The Android workflow publishes a **signed, non-debuggable release APK** on GitHub Releases. Google Play publication is separate. See [SIGNING.md](SIGNING.md) for protecting the signing identity and updating the app. Full native metrics require the Android build; the browser preview deliberately exposes less. Read the architecture, references, privacy and calibration rules in [PRO.md](PRO.md).

## Catalog and research

- **11,662 device names across 56 brands**, searchable by name/model code, plus manual brand/model entry for any missing phone. No claim of exhaustive coverage or game compatibility.
- Names/codes are bundled offline, sourced from a pinned Apache-2.0 community mapping and Apple's model-name reference. See [CATALOG.md](CATALOG.md) for attribution, normalization and reproducible import.
- Without user settings/feedback, both profiles use cited community 0–200 touch ranges and midpoint starting values. Feedback trials can move outside those starting ranges but remain within 0–200. These are not official presets or measured per-phone benchmarks. See [RESEARCH.md](RESEARCH.md) for the source review, limitations, conflicting HUD advice and exact methodology.
- Fire-button size, grip-specific range, placement sketch, ±2 size trials, and per-slider ±5 training adjustments. Copy/save includes final size and values. Adjustments never control the game.
- No RAM/Hz-to-perfect-sensitivity formula. Optional specs are user-entered reference information, not invented device specifications. No universal DPI recommendation; default display settings are recommended.
- Result screen and footer link to sources with review date, separating official game information from community suggestions.
- Legacy saved outputs are recalculated with the revised methodology. Current bounded user-tuned values persist locally; no tracking/accounts/backend.

## Tests

`npm test` covers source-range midpoints, fire-button ranges/placements, tuning bounds, invalid inputs, Apple DPI exclusion, large-catalog integrity/search/model-code aliases, storage migration and corrupted saved data. GitHub Actions runs unit tests and production build on web-app changes.

### Browser checks

```sh
# One-time browser setup
npx playwright install chromium
# In one terminal, after npm run build:
npm run preview -- --port 5173
# In a second terminal:
npm run test:browser
npm run test:browser:pro
```

`TEST_BASE_URL` overrides the preview origin, `BROWSER_EXECUTABLE_PATH` uses an existing Chromium binary, and `SCREENSHOT_DIR` optionally writes desktop/mobile screenshots outside source control. The browser checks exercise catalog/model-code search, manual entry, both profiles, fire-size edits, individual sensitivity tuning, clipboard/source links, save/reload, iPhone DPI guard, canceled analysis animations, mobile overflow and offline PWA generation.


## Install the Android release

Download **[Spdyi-Pro-2.0.1.apk](https://github.com/sunnyprajapati1947-coder/Sunny-/releases/download/spdyi-v2.0.1/Spdyi-Pro-2.0.1.apk)** from the signed release. It is a release variant, not a renamed debug build. Its signature is verified and `application-debuggable` is checked before publication. If replacing the old debug app, export profiles before uninstalling it because the certificates differ. All normal Android installation/security checks still apply.
