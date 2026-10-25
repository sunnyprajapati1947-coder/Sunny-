# FF MAX UNIVERSE

Free Fire Max ka **unofficial fan hub** — maps, meta agents, weapon classes, esports path, loadout builder aur ek redeem-code *format* checker.

> **Unofficial.** Not affiliated with, endorsed by or sponsored by Garena. All artwork is original AI-generated illustration; no game assets, logos or screenshots are used. No APK hosting, no account login, no diamond selling.

## Run

```bash
# any machine with python3
cd freefiremax
python3 -m http.server 8080 --bind 0.0.0.0
# → http://localhost:8080
```

**On Android / Termux:** one command, LAN support ke saath —

```bash
bash termux/serve.sh
```

Poora guide: [`../termux/README.md`](../termux/README.md)

## Pages

| Page | Kya hai |
| --- | --- |
| `index.html` | Home — hero, quick links, latest news, modes, esports/download CTA |
| `game.html` | Game — modes, maps, agents (filter/search), weapon classes, loadout drawer |
| `news.html` | News — 6 briefings with category filters |
| `esports.html` | Esports — path, calendar, sample standings, prize split |
| `download.html` | Download — official store links, indicative specs, install steps |
| `support.html` | Support — 8-question FAQ, scam red flags, safety checklist |
| `redeem.html` | Redeem — offline format checker + safe redeem steps |
| `events.html` | Events — 3 live countdowns (rolling), monthly calendar, rewards |
| `news-season.html` · `news-agent.html` · `news-esports.html` | Full article pages with reading-progress bar and related links |
| `404.html` | Not-found page |

Ranks section (RP bands + climb tips) lives on `game.html#ranks`.

## Files

| File | Kaam |
| --- | --- |
| `styles.css` | Dark cinematic theme + portal chrome (nav, ticker, news, FAQ, footer), responsive |
| `app.js` | Data-driven render (maps/agents/weapons/calendar), loadout pins, code checker, news filters, nav/ticker |
| `assets/hero.jpg` | Bermuda-style island key art |
| `assets/agents.jpg` | Agent comp banner |
| `assets/weapons.jpg` | Arsenal visual |
| `assets/esports.jpg` | Esports arena visual |
| `assets/news-*.jpg` | News thumbnails (season, agent, trophy) |

## Features

- **Maps** — 6 map cards, tap se rotation notes + hot drops expand hote hain
- **Agents** — 18 picks, role filter + search, skill-floor indicator, pin to loadout
- **Weapons** — 6 class tabs with archetype bars (damage / fire rate / range / control / mobility)
- **Esports** — ranked → finals path + indicative season calendar
- **Redeem checker** — sirf **format** validate karta hai (local regex). Kisi server se connect nahi hota, code redeem nahi karta, UID/password kabhi nahi maangta
- **Loadout drawer** — agent/weapon/map pin karo, `localStorage` me save (max 12)
- **Downloads section** — sirf official links (garena site, Play Store, App Store) + scam warnings
- No backend, no analytics, no cookies, no external requests except Google Fonts (fallback-safe)

## Content edit karna

Sab data `app.js` ke top pe hai:

```js
const MAPS = [...];      // map cards
const AGENTS = [...];    // { name, role, skill, diff }
const WEAPONS = [...];   // tabs + bars
const CALENDAR = [...];  // esports timeline
```

- Text/markup: `index.html`
- Colors: `styles.css` → `:root` (`--amber`, `--ember`, `--teal`, `--bg`)
- Naya section add karna ho to `index.html` me `<section class="section" id="x">` + `styles.css` me matching class

## Accessibility & perf

- Skip link, semantic headings, `aria-expanded` / `aria-pressed`, focus-visible rings, Esc-to-close drawer
- `prefers-reduced-motion` respect
- Lazy-loaded images, single CSS/JS file, zero dependencies → ~1.2 MB total (mostly art)

## Legal note

"Free Fire", "Free Fire MAX", "Garena" aur related marks unke respective owners ke trademarks hain. Yeh project informational/fan-use hai. Agar aap ise public deploy karte ho: disclaimer visible rakho, Garena ka logo/name brand ki tarah use mat karo, aur koi "official" claim mat karo.
