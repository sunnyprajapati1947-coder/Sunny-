# ECC Pocket

A phone-first, offline-capable reader for [affaan-m/ECC](https://github.com/affaan-m/ECC) — **every skill, agent, command, rule and guide in the repository, searchable and readable on any phone.**

The ECC repository is a Claude Code / Codex / Kimi plugin and harness library: it ships hundreds of markdown skills, subagent definitions, slash commands and language rules. That is great on a laptop and awkward on a phone. ECC Pocket turns the same content into an installable web app: browse it, search it, save favourites and read it on a train with no signal. Nothing about ECC changes, and nothing is executed by this app.

```
apps/ecc-pocket/
├── index.html               app shell + icon sprite
├── manifest.webmanifest     PWA manifest (installable, shortcuts)
├── sw.js                    offline shell + content-pack cache
├── assets/
│   ├── css/app.css          phone-first design system
│   └── js/
│       ├── core.js          storage, toasts, clipboard, bottom sheet
│       ├── data.js          manifest loader, chunk cache, search
│       ├── markdown.js      marked + DOMPurify, link resolution, TOC
│       ├── app.js           hash router and screens
│       └── vendor/          marked + DOMPurify (MIT / MPL-2.0, unmodified)
├── data/
│   ├── manifest.json        metadata, categories, curated collections
│   └── chunks/*.json        5 MB of markdown, lazy-loaded per item
├── icons/                   app icons + favicon
└── tools/build_data.py      deterministic content-pack builder
```

## Run it

Any static file server works. There is no build step and no backend.

```bash
cd apps/ecc-pocket
python3 -m http.server 8080
# open http://localhost:8080
```

Or with Node:

```bash
npx serve apps/ecc-pocket
```

The app must be served over **HTTP(S)** — opening `index.html` from the filesystem blocks `fetch()` and the service worker. For phone testing on the same Wi-Fi, bind to all interfaces:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# then open http://<your-computer-ip>:8080 on the phone
```

## Install it on a phone

1. Open the deployed URL in Safari (iOS) or Chrome (Android).
2. **iOS:** Share → *Add to Home Screen*. **Android:** ⋮ → *Install app*.
3. Launch it from the home screen — full screen, no browser chrome, works offline.

To make the whole pack available offline, open **Settings → Offline → Save all**. Otherwise the app still caches the shell and every chapter you open.

Deploying? GitHub Pages, Vercel, Netlify, Cloudflare Pages or any static host will do; point the host at `apps/ecc-pocket` and keep the directory structure intact.

- **Vercel:** import the repository, set *Root Directory* to `apps/ecc-pocket`, framework preset *Other*, no build command.
- **Netlify / Cloudflare Pages:** publish directory `apps/ecc-pocket`, no build command.
- **GitHub Pages:** enable *Settings → Pages → Source: GitHub Actions* and add a static deploy workflow, or publish the folder to a `gh-pages` branch.

## What is inside

| Screen | What it does |
| --- | --- |
| Home | Search entry, library stats, continue-reading shelf, skill of the day, 8 curated paths |
| Skills / Agents / Commands / Rules / Guides | Filter chips per category, live text filter, four sort orders, deep links with `?c=` and `?q=` |
| Reader | Rendered markdown, table of contents sheet, reading progress, code copy buttons, reference-file tabs, prev/next, save and share |
| Search | Ranked across all 646 items with type filters and recent searches |
| Bookmarks | Saved locally on the device, no account |
| Install ECC | Exact upstream setup commands (pinned to the release version), harness matrix, Android/Termux notes, safety guidance |
| Settings | System/dark/light theme, four reader text sizes, offline download, cache refresh, data reset |
| About | Data provenance: upstream commit, version, licenses, privacy |

Technical notes:

- **No framework, no webfonts, no tracking.** ~100 KB of JS/CSS before gzip; the 272 KB metadata manifest is the only sizeable first load and it gzips to roughly 70 KB.
- **Markdown is sanitized** with DOMPurify before rendering. Files inside the pack that link to each other become in-app routes; external links open in a new tab.
- **Hash routing** means deep links look like `#/item/skill/accessibility` and survive static hosting.
- **Offline:** the service worker pre-caches the app shell and serves content chunks stale-while-revalidate; the manifest is network-first so updates appear on the next visit.
- **Accessibility:** skip link, focus-visible styles, 44 px-ish touch targets, labelled controls, sheet focus trap, `prefers-reduced-motion` support, AA contrast for body and metadata text.

## Rebuilding the content pack

The data is generated from a checkout of the upstream repository, not hand-written.

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ECC
python3 tools/build_data.py --source /tmp/ECC
```

The script reads `VERSION`, the git commit, all `SKILL.md` files (plus their reference markdown), `agents/`, `commands/`, `rules/`, `docs/` and the root guides. It writes `data/manifest.json`, lazy-load chunks of about 220 KB each, category counts, curated collections and a path → item map used to rewrite internal links. `--stamp` pins the generated timestamp; otherwise it uses the current UTC time.

After rebuilding, bump `VERSION` in `sw.js` so installed clients pick up the new shell and cache namespace.

## Credits and licenses

- **ECC** — skills, agents, commands, rules and guides by Affaan Mustafa and contributors, [MIT licensed](https://github.com/affaan-m/ECC/blob/main/LICENSE). This reader is an unofficial companion and is not affiliated with or endorsed by the ECC project.
- **marked** — MIT. Vendored unmodified at `assets/js/vendor/marked.js`; license at `assets/js/vendor/LICENSE-marked.md`.
- **DOMPurify** — MPL-2.0 OR Apache-2.0. Vendored unmodified at `assets/js/vendor/purify.min.js`; license at `assets/js/vendor/LICENSE-dompurify.txt`.
- Icons and the app mark are drawn for this app as inline SVG. System fonts only.

ECC commands and skills run on your machine inside Claude Code, Codex, Kimi or another harness. This app only helps you read them.
