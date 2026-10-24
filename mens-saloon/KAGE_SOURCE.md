# KageLandingPage — Exact Source Verification

**Component:** `<KageLandingPage />` from ThreeUI (`@designcodeio/threeui` v1.2.0,
MIT — https://github.com/MengTo/threeui), installed from the official npm registry.

**Configured usage** (in `src/Scene.tsx`, exactly as specified):

```tsx
import { KageLandingPage } from "@designcodeio/threeui";
import "@designcodeio/threeui/style.css";

export function Scene() {
  return (
    <div className="shader-frame">
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
  );
}
```

## How the component works

`KageLandingPage` renders the authored Kage document in a sandboxed iframe
loaded from `/landing-pages/kage.html`, and injects the typography
customization (Onest, weights, vermilion `#e0231c`, sizes) into the loaded
DOM — the packaged HTML file itself remains byte-exact. The salon website
(App.tsx) is built *around* this preserved experience; the Kage document was
not modified in any way.

## Byte-for-byte assets (SHA-256 verified 2026-10-24)

Copied from `node_modules/@designcodeio/threeui/lib-dist/assets/landing-pages/`
into `public/landing-pages/`. All hashes match the registered ThreeUI source
bundle (`threeui.com/source-code/kage-landing-page.json`, revision
`c8e06b90397a`):

| File | SHA-256 | Status |
| --- | --- | --- |
| `landing-pages/kage.html` | `c8e06b90397ac246baf0ab6f32f5f6b570acc6fe03c7009f711b579fb72d9f49` | ✅ match |
| `secret-pathways-assets/fonts.css` | `985f85a904a4096f92c06552b06f42a45973ac004af4780d68f18af65ddcc1b0` | ✅ match |
| `secret-pathways-assets/three.min.js` | `8a5f7249903b54d30f79f708699d2fed2d6a1d0741a4cd41377d1f01bb5a2271` | ✅ match |
| `generated/kage-sanmon-preview.webp` | `23937f8c8350c55730c3bd17066a250548b2d29aad0e6ffb96218c1354b6db43` | ✅ match |
| `generated/kage-approach.webp` | `39ff338936097e1bde0c4eadcf09805b9890862703186e67314942de7e0bc36c` | ✅ match |
| `generated/kage-lantern-court.webp` | `c0a6ff7da1cd6909d66e2f3f690b0d524a693e01d2222ab846d0074a90f47471` | ✅ match |
| `generated/kage-moonwater.webp` | `b8c8060c51c87a103bae619b3a4cc8b8b80632649d83f1f2c2299051e7f9b400` | ✅ match |
| `foreground/png/temple-wall.webp` | `41c00f017e4ecf2147ee468d74da955bb4e2dad773f75a575022842eaf7609ce` | ✅ match |
| `foreground/png/pine-tree.webp` | `79b233716d067bbc64c1507f79e4a30ba5f445995158c78562cc5b81f607ede7` | ✅ match |
| `foreground/png/tall-grass.webp` | `8db0b5fbd160a7225391a6283a99681e346e205f24191031657285ef85ef12d2` | ✅ match |
| `foreground/png/sakura-branch.webp` | `48564194d40496090dbf3bba2a68785cf91fafb655dc8d43ac16f6678aff196d` | ✅ match |
| `foreground/png/maple-leaves.webp` | `35a90fec62c1a6bbfbbe73cd5d7b1acb889e80546d404182ef9a45fe417b531f` | ✅ match |
| `foreground/png/stone-lantern.webp` | `d5f3c881bc9d92b72eaaff2b709614d66e21a19e14025d2b9b16a15ab52df3bc` | ✅ match |
| `foreground/png/garden-bush.webp` | `707e2516ebc0108041fe0ddc26d8bff0a69dc9700641f837765018b64e9ff15e` | ✅ match |
| `foreground/png/basalt-stones.webp` | `150f1c87e181d651c318168c271bb65c9c8abac6dea6f2421fdd081c5b740471` | ✅ match |
| `foreground/png/hill.webp` | `ffba816244bcba98e4e33c6ee56165edfe4048db4af122ef3f5822180a85edbc` | ✅ match |
| `foreground/png/shrine-ruins.webp` | `77006e58f2066e6fa9bfc504df396db49b1c7977858fa52d34dd2dad5feced77` | ✅ match |

Re-verify any time:

```bash
cd mens-saloon/public
sha256sum landing-pages/kage.html landing-pages/secret-pathways-assets/three.min.js
```

**Do not edit files under `public/landing-pages/`** — editing breaks the
hash-verified exact source. Salon content lives in `src/`.
