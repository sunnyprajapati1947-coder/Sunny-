# Spdyi — Sensitivity Lab

Standalone mobile-first Free Fire MAX companion PWA. The original Python project at the repository root is unchanged.

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

The manifest, PNG icons and production-only service worker support home-screen installation and offline revisits after the first full load. Use Chrome's Install app menu on Android or Safari's Share → Add to Home Screen on iOS. HTTPS and a supported browser are required. PWA installation is not a native APK; a Play Store package would require a separate signing/packaging process.

## Catalog and research

- **11,662 device names across 56 brands**, searchable by name/model code, plus manual brand/model entry for any missing phone. No claim of exhaustive coverage or game compatibility.
- Names/codes are bundled offline, sourced from a pinned Apache-2.0 community mapping and Apple's model-name reference. See [CATALOG.md](CATALOG.md) for attribution, normalization and reproducible import.
- Both sensitivity profiles use cited community 0–200 touch ranges with visible ranges and midpoint starting values. These are not official presets or measured per-phone benchmarks. See [RESEARCH.md](RESEARCH.md) for the source review, limitations, conflicting HUD advice and exact methodology.
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
```

`TEST_BASE_URL` overrides the preview origin, `BROWSER_EXECUTABLE_PATH` uses an existing Chromium binary, and `SCREENSHOT_DIR` optionally writes desktop/mobile screenshots outside source control. The browser checks exercise catalog/model-code search, manual entry, both profiles, fire-size edits, individual sensitivity tuning, clipboard/source links, save/reload, iPhone DPI guard, canceled analysis animations, mobile overflow and offline PWA generation.
