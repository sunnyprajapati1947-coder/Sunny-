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

Live: https://nawada-kage.vercel.app/

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

## Deploy (Vercel project `nawada-kage`)

The site is deployed through the Vercel API, whose payload is text-only, so the
3.4 MB of binaries are not uploaded directly. `deploy/fetch-assets.mjs` runs as the
project's **build command** on Vercel; it pulls the built bundle and the authored
Kage document plus assets from jsDelivr (`Sunny-@kage-v1` tag) into the deployment
and hash-checks `kage.html` and `fonts.css`.

Project settings: install `echo skip-install`, build `node fetch-assets.mjs`,
output directory `.`, root `deploy/`.

### Rebuilding

`npm run build` changes the hashed filenames in `dist/assets/`. After rebuilding:

1. update the two `assets/index-*.{js,css}` names in `deploy/fetch-assets.mjs` and
   `deploy/index.html`,
2. commit `dist/`, then move the `kage-v1` tag to the new commit and push it,
3. redeploy `deploy/` to the `nawada-kage` project.
