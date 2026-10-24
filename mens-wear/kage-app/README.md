# Kage landing page (ThreeUI)

`<KageLandingPage />` from `@designcodeio/threeui@1.2.0`, mounted unmodified with the
configured usage:

```tsx
<div className="shader-frame w-full h-full">
  <KageLandingPage
    headingFont="onest"
    bodyFont="onest"
    headingWeight="400"
    bodyWeight="300"
    primaryColor="#e0231c"
    headingSize={46}
    bodySize={17}
    headingLetterSpacing={-0.012}
  />
</div>
```

Live: https://nawada-menswear-shop.vercel.app/ (homepage)
Shop: https://nawada-menswear-shop.vercel.app/shop/

## Source fidelity

`src/shaders/` holds the upstream sources copied verbatim (`LandingPages.tsx`,
`LandingPageFrame.tsx`, `pageTypography.ts`, `pageRecipes.ts`, `threeui.css`).
`public/landing-pages/` holds `kage.html` and `secret-pathways-assets/` (14 `.webp`,
`fonts.css`, `three.min.js`) unchanged. Every file was SHA-256 verified against the
published manifest before being committed; the component itself is imported from the
npm package (`@designcodeio/threeui`) exactly as the upstream app does.

The frame is an iframe pointing at `/landing-pages/kage.html`, so that document has to
be served from the same origin — that is the only reason for the deployment shim below.

## Build

```bash
npm install
npm run build        # -> dist/ (index.html, assets/, landing-pages/)
npm run dev          # http://localhost:3000
```

## Deploy (Vercel project `nawada-menswear-shop`)

The site is deployed through the Vercel API, whose payload is text-only, so the
3.4 MB of binaries are not uploaded directly. `deploy/fetch-assets.mjs` runs as the
project's **build command** on Vercel; it pulls the built bundle and the authored
Kage document plus assets from jsDelivr (`Sunny-@kage-v3` tag) into the deployment,
pulls the existing shop entry from `Sunny-@app-v9` and places it at `/shop/`, and
hash-checks `kage.html` and `fonts.css`.

Deployment payload is therefore only `deploy/index.html` (the shell) and
`deploy/fetch-assets.mjs`. The "Enter the shop" pill lives in that React shell, not
in `kage.html`, so the authored document stays byte-identical.

Known gap: the shop shell registers `/sw.js`, which no longer resolves now that the
shop lives at `/shop/` — the shop works online, but its service worker is off.

Project settings: install `echo skip-install`, build `node fetch-assets.mjs`,
output directory `.`, root `deploy/`.

### Rebuilding

`npm run build` changes the hashed filenames in `dist/assets/`. After rebuilding:

1. update the two `assets/index-*.{js,css}` names in `deploy/fetch-assets.mjs` and
   `deploy/index.html`,
2. commit `dist/`, push a **new** tag (`kage-v4`, … — jsDelivr caches tags, so never
   reuse one) and point the `KAGE` constant at it,
3. redeploy `deploy/` to the `nawada-menswear-shop` project.
