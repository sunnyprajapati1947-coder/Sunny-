# Publishing FFMAX Universe

The site is a static bundle in `freefiremax/` — 12 HTML pages, one CSS, one JS, `robots.txt`, `sitemap.xml`, and 6 images.

## Option A — GitHub Pages (free, permanent, Google-indexable)

The workflow `.github/workflows/publish-ffmax.yml` is already committed on
`arena/1a5d39e0-sunny`. It only needs Pages switched on once:

1. Open: https://github.com/sunnyprajapati1947-coder/Sunny-/settings/pages
2. **Build and deployment → Source** = **GitHub Actions**
3. Open: https://github.com/sunnyprajapati1947-coder/Sunny-/actions/workflows/publish-ffmax.yml
4. **Run workflow** → branch `arena/1a5d39e0-sunny` → Run

Live URL: `https://sunnyprajapati1947-coder.github.io/Sunny-/` (usually ready in ~1 minute)

After that, any push that touches `freefiremax/**` re-publishes automatically.

## Option B — Vercel (project already created)

Project `ffmax-universe` exists in the Vercel dashboard with build settings
(`build command` copies `freefiremax/` → `public/`, output dir `public`), but
Vercel's GitHub connection is not linked to the account yet, so automated
deployments fail with `git_info_fail`.

1. Vercel → **Account Settings → Login Connections → Connect GitHub**
2. Give the Vercel GitHub App access to the `Sunny-` repository
3. Then a push to `arena/1a5d39e0-sunny` (or "Redeploy" in the Vercel dashboard) publishes it

## Why not "termux"

Nothing here needs Termux — the bundle is static. Termux scripts stay in
`termux/` for phone/LAN preview only.

## Naming / legal

Do **not** publish this under a Garena-owned or "official"-looking domain
(e.g. `freefiremaxofficial.com`) or with Garena's logo. "Free Fire", "Free Fire MAX"
and "Garena" are their trademarks; a fan site must stay clearly labelled
unofficial (the site already carries that disclaimer in the header, footer and
news/FAQ pages).
