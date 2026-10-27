# Bharat Map Quiz 🗺️

Ek India map quiz app — Play Store wale "India Map Quiz" jaisa, lekin browser me chalta hai aur
phone ki home screen par app ki tarah install ho jata hai (PWA).

Tap the map, learn the shapes, remember the capitals. Fully offline after the first load, no account,
no ads and no tracking — progress lives in `localStorage` on the device.

---

## Kya kar sakte hain (features)

| Mode | What it does |
| --- | --- |
| **Yaad karo (Learn)** | Full India map with state names. Tap any state → sheet with capital, quick fact, 🔊 "Suno" (speech) and a shortcut to quiz that state. Also a searchable list of all 36 states/UTs. |
| **Rajya dhoondo (Find)** | A state name is given, you tap it on the map. 10 questions per round. |
| **Pehchano (Identify)** | A shape is highlighted on the map; pick its name from 4 options. |
| **Rajdhani (Capitals)** | Pick the correct capital of the highlighted state. |
| **Speed run** | Every state in the selected region, against a clock. Your best time is saved. |
| **Weak-state practice** | The round result screen and the home card push the states you keep missing. |

Other things:

- **3 languages** — Hinglish (default), हिंदी, English. Tap the language chip in the header.
- **Memory model per state** — mastery 0–100%, streaks and XP. Mastered (≥80%) states turn green on every map.
- **Tiny state handling** — Goa, Delhi, Chandigarh, Puducherry, Lakshadweep, Daman-Diu and the Andaman
  islands get marker dots with a 60 px tap target, so they are actually tappable on a phone.
- **Region filter** — All India, North, West, Central, East, North-East, South & Islands.
- **Offline + installable** — service worker caches the whole app; add it to the home screen and it runs
  with no network.
- **Sound + haptics** — short WebAudio tones (mutable) and vibration where supported. Speech uses the
  device's own `speechSynthesis`, so no audio files are shipped.
- **Keyboard support** — `1–4` to pick an option, `Enter` for next (handy on a laptop).

## Chalane ka tarika (run it)

```bash
cd map-quiz
python3 -m http.server 8080 --bind 0.0.0.0   # or: npm start
# open http://localhost:8080
```

A static server is required — opening `index.html` from the file system will not work because the app
uses ES modules and a service worker.

### Tests

```bash
npm install          # only for the test tooling (jsdom)
npm run check        # static checks: element ids, asset paths, module graph, map/data parity
npm test             # boots the real app in jsdom and plays every mode end to end
npm run verify       # both
```

### What the tests actually check

- `npm run check` — every `$("id")` in `app.js` exists in the markup, every asset referenced by
  `index.html`/`sw.js` exists on disk, all module imports resolve, and the 36 map shapes match the
  36 content entries one-to-one (so no state can silently lose its name or fact).
- `npm test` — boots the real app in jsdom and plays it: opens learn, taps Goa, checks the sheet, plays a
  full 10-question locate round with wrong answers, an identify round with correct answers (verifies
  auto-advance), a capitals round, sprint mode (timer, hint, skip), switches all three languages and
  then asserts what landed in `localStorage`.

## Project structure

```
map-quiz/
├─ index.html                # app shell: home / learn / quiz / result screens + sheets
├─ manifest.webmanifest      # PWA manifest (installable, standalone, portrait)
├─ sw.js                     # offline cache (bump CACHE when shipping)
├─ src/
│  ├─ app.js                 # screen router, quiz loop, progress wiring
│  ├─ data.js                # 36 states/UTs: names (en/hi), capitals, facts, regions
│  ├─ i18n.js                # Hinglish / Hindi / English strings + sentence builders
│  ├─ map.js                 # SVG renderer, marker dots, zoom/pan
│  ├─ map-data.js            # GENERATED compact geometry (do not edit)
│  ├─ quiz.js                # question generation + scoring rules (pure functions)
│  ├─ store.js               # localStorage profile, mastery, streaks, weak-state ranking
│  ├─ styles.css             # dark theme, mobile-first layout, map states
│  └─ audio.js               # WebAudio tones + speech synthesis
├─ tools/
│  ├─ build_map.py           # GeoJSON → src/map-data.js (simplify, project, label points)
│  ├─ build_icons.py         # tricolour India silhouette → PNG icons
│  └─ preview_png.py         # quick raster preview of the map without a browser
├─ assets/icons/             # 192/512/maskable/favicon PNGs
└─ tests/                    # static checks + jsdom smoke test
```

## Map data pipeline

`src/map-data.js` is generated — regenerate it instead of editing it:

```bash
python3 tools/build_map.py   # needs tools/india_states_raw.geojson
python3 tools/build_icons.py # needs Pillow
```

- Source: [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES)
  (`INDIA/INDIA_STATES.geojson`), **MIT licensed**, derived from Indian government (Census/LGD) boundaries.
- Shapes are projected to Web Mercator, scaled to a 1000-unit-wide viewBox, simplified with
  Douglas–Peucker (0.45 px tolerance) and merged where needed (Dadra & Nagar Haveli + Daman & Diu are
  drawn as one UT, as they have been a single UT since 2020).
- Label anchors use a "pole of inaccessibility" search, then a collision pass: biggest shapes claim their
  spot first, and a label may only move if it still lands inside its own state and clear of every label
  already placed. Tiny shapes (Delhi, Goa, Chandigarh, Puducherry, Lakshadweep, Daman-Diu, the southern
  islands) get no text at all — they get marker dots and a bigger tap target instead.
- Each shape stores the font size its label was measured at, so the renderer and the layout always agree.
- Result: 36 shapes, ~180 KB, no runtime GeoJSON parser and no network calls.

Boundaries are indicative and intended for learning, not for any legal or administrative use.

## Play Store par kaise le jaayein

Three low-effort routes, because the app is already a normal installable web app:

1. **Trusted Web Activity (TWA)** — host the folder on HTTPS (Vercel/Netlify/GitHub Pages are fine) and run
   [`bubblewrap init --manifest https://your-url/manifest.webmanifest`](https://github.com/GoogleChromeLabs/bubblewrap).
   You get an `.aab` that opens full screen with no browser UI.
2. **Capacitor** — `npm i @capacitor/core @capacitor/cli && npx cap add android`, copy this folder into
   `www/`, then build in Android Studio. Best if you later want native features (push, in-app purchases).
3. **Cordova/WebView wrapper** — same idea, older tooling.

Before publishing: replace `assets/icons/*` if you want custom branding, and keep the privacy policy
simple — this app collects nothing and sends nothing.

## Roadmap (nice next steps)

- Spaced-repetition scheduling (currently a simple weighted pick)
- Neighbour-states mode ("which state touches this one?")
- Rivers, mountain ranges and union-territory capitals as extra layers
- Hindi audio recorded by a human instead of device TTS
- Cloud sync (optional Supabase table) if multi-device progress is wanted
