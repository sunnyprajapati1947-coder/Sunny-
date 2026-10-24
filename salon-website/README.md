# Men's Salon website & Android app

A polished, bilingual (English / Hindi) salon website, installable PWA, and Android app for Nitish Jatav's men's salon in Sudama Nagar, Nawada, Bihar.

**Contact / WhatsApp:** +91 90313 68918

**Barber:** Nitish Jatav · age 24 · 6 years' experience

**Address:** Sudama Nagar, Nawada, Bihar 805110

**Vercel project URL:** [mens-salon-ten.vercel.app](https://mens-salon-ten.vercel.app)

**Public source repository:** [sunnyprajapati1947-coder/Sunny-](https://github.com/sunnyprajapati1947-coder/Sunny-)

> The Vercel team currently protects its default `vercel.app` aliases. The account owner must disable production deployment protection or attach a custom domain they own before anonymous visitors can use the live site.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` in a browser. The site is static and needs no build step or API keys.

## Services and prices

The menu uses only the two requested prices:

| Service | Price |
| --- | ---: |
| Signature haircut | ₹50 |
| Beard shape-up | ₹50 |
| Fade & finish | ₹100 |
| Haircut + beard | ₹100 |

The user supplied the two allowed price points but not a service-by-service rate card, so this is the considered mapping currently used across the menu, booking form, and help panel.

## Included

- Responsive, premium editorial styling for desktop and mobile, with no horizontal page overflow
- English / Hindi language toggle, with the selection remembered in the browser
- The supplied real shopfront photo featured in the hero and gallery; salon-interior and Nitish Jatav photos remain available in the studio/gallery sections
- One-minute style finder that recommends a starting service and preselects it in booking
- On-device “usual service” saving, with one-tap booking and no account
- WhatsApp booking form that sends the selected service, name, requested date/time, and notes to **+91 90313 68918**
- Barber profile with six years of experience and the supplied photo
- The new shears-and-star crest across the website, PWA icons, Android launcher, and splash screens
- Fixed edge Install action, bilingual Help & Support, FAQs, and launchers for ChatGPT, Gemini, and Claude
- A salon-safe AI grooming prompt with the updated experience, service prices, and contact context; no API key is embedded or sent by the site
- Share action, downloadable salon contact card (`.vcf`), direct click-to-call, Google Maps search, service menu, and visit details
- PWA home-screen shortcuts and an offline app shell that precaches the shopfront, studio, barber, and local interface icons
- SEO/social metadata, local business structured data, reduced-motion support, and keyboard-accessible controls
- A curated set of SVGs from [Lucide](https://github.com/lucide-icons/lucide); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the pinned revision and ISC notice

## Details still to confirm

- **Official salon name:** currently shown as “Men's Salon” because no separate business name was supplied.
- **Opening days and hours:** not shown as fixed hours; customers are asked to call/message to confirm today's availability.
- **Exact map pin / landmark:** the address is Sudama Nagar, Nawada, Bihar 805110; a more precise landmark was not verified.
- **Client portfolio and reviews:** no client haircut photos or verified reviews were supplied. The style cards are marked as inspiration, and the page does not show fabricated testimonials or star ratings.

## App installation and deployment

The site is an installable **Progressive Web App (PWA)**. Android browsers can install it from the in-page **Install** action; on iPhone/iPad, open it in Safari and choose **Share → Add to Home Screen**. Its app shell and all three salon/barber photos are available offline after caching. Booking and sharing need an internet connection. The Vercel bundle is prepared directly from static files because Vercel's GitHub connection is not enabled; the project remains access-protected until its owner changes the deployment protection settings.

### Android APK

- **[Download the Android app](https://github.com/sunnyprajapati1947-coder/Sunny-/releases/latest/download/Mens-Salon-Nawada-v1.0.2.apk)** from the public GitHub release.
- Release version: **1.0.2** (version code 3), package `com.menssalon.nawada`.
- The APK bundles the bilingual site and salon photos locally, so browsing does not rely on the Vercel website being public. WhatsApp booking and sharing need internet access.
- Install on Android 7.0 or newer: download the APK, open it from Downloads, allow your browser or file manager to install unknown apps if Android asks, then tap **Install**. This is a debug-signed sideload APK for direct installation/testing, not a Play Store release; installing a later release may require uninstalling an older differently signed build.
- Each push to `main` or an `arena/**` branch runs **Build Men's Salon Android APK** in GitHub Actions. It bundles the site, builds and verifies the APK, and publishes the APK plus SHA-256 checksum as a workflow artifact. Successful builds from this app branch or `main` also publish the public `v1.0.2` GitHub release linked above.

To build locally (Node.js 22, Java 21, Android SDK 36):

```bash
cd salon-website/android-app
npm ci
npm run android:debug
```

The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.

After the source commit is pushed, prepare the direct Vercel bundle with:

```bash
python3 salon-website/build-vercel-bundle.py
```

This writes a temporary, ignored `.vercel-upload/` directory. It bundles CSS/JavaScript and pins the salon images to the public GitHub commit for the Vercel upload. The bundle must be uploaded separately; generating it does not deploy it.

## Main files

- `index.html` — site copy, service menu, contact details, booking and style-finder dialogs, structured data
- `styles.css` — visual theme and responsive layout
- `script.js` — language toggle, booking, saved service, support/AI, sharing/contact-card actions, and PWA install prompt
- `manifest.webmanifest` — PWA name, metadata, icons, shortcuts, and launch settings
- `sw.js` — versioned offline app-shell cache, including the supplied shopfront photo
- `build-vercel-bundle.py` — reproducible direct-deployment bundle generator
- `icons/` and `app-icon.svg` — install and home-screen icons
- `assets/` — shopfront, studio and barber photos, branding, and locally bundled Lucide SVG icons
- `THIRD_PARTY_NOTICES.md` — source and license notice for icon assets
- `android-app/` — Capacitor Android project, native launcher/splash branding, local web-asset packaging, and native share/contact bridge
- `.github/workflows/android-apk.yml` — automated Android SDK build, APK verification, and downloadable workflow artifact
