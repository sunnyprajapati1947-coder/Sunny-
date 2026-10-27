# Bharat Map Quiz 🗺️

An India map quiz you can install like an app. Tap the map, learn the shapes, then prove it in
timed rounds, survival mode and a fresh daily challenge. Everything is in English, works offline,
and stores progress on the device — no accounts, no ads, no tracking.

**Download:** [`download/bharat-map-quiz.html`](download/bharat-map-quiz.html) (one file, double-click
to play) · [`download/bharat-map-quiz.zip`](download/bharat-map-quiz.zip) (installable web app)

---

## Game modes

| Mode | What happens |
| --- | --- |
| **Daily Challenge** | 10 mixed questions, seeded by the date so everyone gets the same set. One attempt per day, with a day streak counter. |
| **Find the state** | A state name is given — tap the right shape on the map. 10 questions. |
| **Identify the shape** | One state is highlighted; pick its name from 4 options. |
| **Capitals** | Matches states with their capitals, in both directions (state → capital and capital → state). |
| **Neighbours** | "Which state shares a border with X?" — built from real border data. |
| **Timed blitz** | 12 questions, 10 seconds each, with a draining timer bar. |
| **Survival** | Endless questions, 3 lives, 12 seconds per question. Score as high as you can. |
| **Speed run** | Every state in the selected region, against the clock. Best time saved. |
| **Weak spots** | Automatically drills the states you keep missing. |

## Everything else

- **Learn map** — tap any state for its capital and a fact, switch map labels between
  **States / Capitals / Off**, pinch-zoom or use the +/− buttons, and search the full list of 36
  states and UTs.
- **Progress that remembers what you know** — per-state mastery (0–100%), streaks, XP, levels with
  titles, best sprint time, daily streak. Mastered states turn green on every map.
- **Achievements** — 18 badges, from "First steps" to "Full map" and "Survivor", unlocked with a toast
  and listed on the Progress tab.
- **Round review** — every result screen lists each question with ✓/✗ plus the correct answer, and a
  share button (Web Share, falling back to clipboard).
- **Optional Hindi names** — the UI stays English; Settings can switch state and capital names to
  हिंदी if you want bilingual practice.
- **Sound + haptics + speech** — short WebAudio tones (mutable), vibration where supported, and a 🔊
  button that reads the question and facts aloud with the device voice.
- **Installable and offline** — manifest + service worker; "Add to Home screen" gives a full-screen
  app that works with no network.
- **Keyboard friendly** — `1`–`4` to answer, `Enter` for next, `Esc` to leave a round.
- **Tiny states handled** — Goa, Delhi, Chandigarh, Puducherry, Lakshadweep, Daman-Diu and the southern
  islands get marker dots with a much larger tap target.

## Run it

```bash
cd map-quiz
python3 -m http.server 8080 --bind 0.0.0.0   # or: npm start
# open http://localhost:8080
```

A static server is required for the full PWA (ES modules + service worker). For the single-file
build you can just open `download/bharat-map-quiz.html` directly.

### Tests

```bash
npm install              # test tooling only (jsdom)
npm run check            # static checks
npm test                 # plays every mode headlessly + verifies the download build
npm run verify           # static + play-through + rebuild downloads + re-check
```

`npm test` boots the real app in jsdom and plays it end to end: learn sheet, label cycling, search,
a full wrong-answer locate round, a correct identify round with auto-advance, capitals, neighbours
(checks that exactly one offered option really borders the target), timed blitz (timer drains),
survival (lives drain, run ends), the daily challenge (mixed types, stored once per day, blocked on a
second attempt), achievements, settings toggles and what ends up in `localStorage`. `tests/bundle.mjs`
then does the same for the single-file download: no imports left, no runtime errors, a round plays.

## Project structure

```
map-quiz/
├─ index.html                # app shell: home / learn / quiz / result / progress + sheets
├─ manifest.webmanifest      # PWA manifest (standalone, portrait)
├─ sw.js                     # offline cache (bump CACHE when shipping)
├─ download/                 # GENERATED: single-file build + installable zip
├─ src/
│  ├─ app.js                 # screens, quiz loop, achievements, settings, share
│  ├─ data.js                # 36 states/UTs: names (en/hi), capitals, facts, regions
│  ├─ geo.js                 # access to generated geometry, neighbour lookups
│  ├─ i18n.js                # English UI copy + sentence builders
│  ├─ quiz.js                # question/round generation, seeded daily, scoring helpers
│  ├─ store.js               # localStorage profile, mastery, levels, daily, achievements
│  ├─ achievements.js        # 18 badge definitions + pure evaluation
│  ├─ map.js                 # SVG renderer, markers, zoom/pan
│  ├─ map-data.js            # GENERATED compact geometry (do not edit)
│  ├─ styles.css             # dark theme, mobile-first layout
│  └─ audio.js               # WebAudio tones + speech synthesis
├─ tools/
│  ├─ build_map.py           # GeoJSON → map-data.js (simplify, project, labels, neighbours)
│  ├─ build_icons.py         # tricolour India silhouette → PNG icons
│  ├─ bundle.py              # download/ single-file build + zip
│  └─ preview_png.py         # raster preview of the map for quick checks
├─ assets/icons/             # 192/512/maskable/favicon PNGs
└─ tests/                    # static checks, jsdom play-through, bundle verification
```

## Map data pipeline

`src/map-data.js` is generated — regenerate instead of editing:

```bash
python3 tools/build_map.py    # needs tools/india_states_raw.geojson
python3 tools/build_icons.py  # needs Pillow
python3 tools/bundle.py       # after any source change, refresh download/
```

- Source: [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES)
  (`INDIA/INDIA_STATES.geojson`), **MIT licensed**, derived from Indian government (Census/LGD)
  boundaries. Shapes are projected to Web Mercator, scaled to a 1000-unit viewBox and simplified
  (Douglas–Peucker, 0.45 px). Dadra & Nagar Haveli and Daman & Diu are drawn as one UT, as they have
  been a single UT since 2020.
- **Label layout** is computed at build time: biggest states claim a spot first, labels may only move
  if they stay inside their own shape and clear of labels already placed. Shapes too small for text get
  marker dots instead. Each shape stores the font size its label was measured at.
- **Neighbours** are derived from the geometry: two states count as neighbours when their outlines come
  within ~15 km, which reproduces the real border graph (checked by hand, e.g. Sikkim → West Bengal,
  Puducherry → Tamil Nadu / Kerala / Andhra Pradesh).

Boundaries are indicative and intended for learning, not for legal or administrative use.

## Publishing to the Play Store

The app is already a complete installable web app, so there are three low-effort routes:

1. **Trusted Web Activity (TWA)** — host the folder over HTTPS (Vercel, Netlify, GitHub Pages) and run
   [`bubblewrap init --manifest https://your-url/manifest.webmanifest`](https://github.com/GoogleChromeLabs/bubblewrap).
2. **Capacitor** — `npm i @capacitor/core @capacitor/cli && npx cap add android`, copy this folder into
   `www/`, then build in Android Studio.
3. **Cordova/WebView wrapper** — older tooling, same idea.

Nothing leaves the device, so the privacy policy can be one line.

## Roadmap

- Spaced-repetition scheduling instead of the current weighted pick
- Rivers and mountain ranges as extra map layers
- Capital-city pin positions for a "find the city" mode
- Optional cloud sync (Supabase) for multi-device progress
