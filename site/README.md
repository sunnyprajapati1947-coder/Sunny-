# NOVA SYNDICATE — FF Max Officer Console

Free Fire Max guild officer profile + squad management dashboard. Static site, no build step, no backend.

## Run locally

```bash
cd site
python3 -m http.server 8000 --bind 0.0.0.0
# open http://localhost:8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Officer hero + ID card, duties, roster, scrim schedule, tryouts |
| `styles.css` | Dark esports theme, responsive layout, ember/scroll FX |
| `app.js` | Roster CRUD, role cycling, attendance marking, scrim table, UI effects |
| `assets/hero-bg.jpg` | Hero background key art |

## Roster features

- **Add member** — IGN, role, K/D, matches, level (validated, duplicate IGN blocked)
- **Role cycle** — click the role badge on a card: Leader → Officer → Member → Recruit
- **Attendance** — `✓ Present` / `✕ Missed` updates the per-member attendance bar
- **Remove / Reset** — with confirm dialogs
- **Filter + search** — role pills and IGN search
- Persists to `localStorage` (`nova.roster.v1`); "Reset to defaults" restores the seeded 12-member roster

## Customise

- Roster seed + scrims: `DEFAULT_ROSTER` / `SCRIMS` at the top of `app.js`
- Officer name, guild, stats: hero and ID card markup in `index.html`
- Colors: `:root` variables in `styles.css` (`--accent`, `--bg`, …)

Unofficial fan project — not affiliated with Garena.
