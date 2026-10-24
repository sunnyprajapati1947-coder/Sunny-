# Men's Salon website & Android app

A polished, bilingual (English / Hindi) salon website, installable PWA, and Android app for Nitish Jatav's men's salon in Sudama Nagar, Nawada, Bihar.

- **Website URL:** [mens-salon-ten.vercel.app](https://mens-salon-ten.vercel.app)
- **Contact / WhatsApp:** +91 90313 68918
- **Barber:** Nitish Jatav · age 24 · 6 years' experience
- **Address:** Sudama Nagar, Nawada, Bihar 805110

**Public source repository:** [sunnyprajapati1947-coder/Sunny-](https://github.com/sunnyprajapati1947-coder/Sunny-/)

> The current Vercel project protects its default aliases. The link above will not be publicly crawlable until the account owner disables production deployment protection or attaches a domain they own. Do not submit a protected URL to Google as if it were public.

## Services and prices

The menu uses only the two requested prices:

| Service | Price |
| --- | ---: |
| Signature haircut | ₹50 |
| Beard shape-up | ₹50 |
| Fade & finish | ₹100 |
| Haircut + beard | ₹100 |

The two allowed price points were provided without a service-by-service rate card, so this is the considered mapping used in the menu, booking choices, help panel, and AI prompt. Change the mapping if Nitish gives a different rate card.

## Included

- Responsive, premium editorial design with no horizontal page overflow and a mobile-friendly, independently scrollable Help & Support dialog
- English / Hindi language toggle, with the selection remembered in the browser
- The supplied real shopfront photo in the hero and gallery; salon-interior and Nitish Jatav photos remain in the studio/gallery sections
- One-minute style finder, on-device “usual service” saving, WhatsApp booking, direct call, Maps search, share, and downloadable contact card
- Bilingual Help & Support, FAQs, and safe handoff links for ChatGPT, Gemini, and Claude
- Privacy policy in English and Hindi, linked from the site and bundled in the Android app
- The supplied salon and barber photos precached for offline PWA use and copied locally into the Android app
- LocalBusiness/BarberShop structured data, canonical/social metadata, `robots.txt`, and `sitemap.xml`
- Shears-and-star branding across the website, PWA icons, Android launcher, and splash screens
- Reduced-motion support, keyboard-accessible controls, and the pinned Lucide icon license notice

## Google Search visibility

Crawler files, canonical metadata, descriptive page titles, salon structured data, and a sitemap are included. They help Google understand the site, but **no one can guarantee a top search position**. The site must first be publicly reachable. The salon owner should then verify the site in Google Search Console, submit `/sitemap.xml`, and claim/verify the Google Business Profile with accurate hours, phone, address, and real photos. Google controls indexing and ranking.

## Google Play publication status

The GitHub APK is a debug-signed sideload/testing build, not a Play Store release. The Play Protect prompt in the supplied screenshot is expected when installing an app Google has not seen through Play; choose **Scan app** and wait for the result rather than bypassing the scan. A Play Store launch needs the salon owner's verified Play Console account, a persistent upload-signing key, a signed Android App Bundle (AAB), and completed store/privacy/data-safety forms. No Play Console integration is available in this workspace, so the listing draft and privacy policy are prepared, but the app has not been submitted to Google Play. See [`android-app/PLAY-STORE-LISTING.md`](android-app/PLAY-STORE-LISTING.md).

## Details still to confirm

- **Official salon name:** currently shown as “Men's Salon” because no separate business name was supplied.
- **Opening days and hours:** not shown as fixed hours; customers are asked to call/message to confirm today's availability.
- **Exact map pin / landmark:** the address is Sudama Nagar, Nawada, Bihar 805110; a more precise landmark was not verified.
- **Client portfolio and reviews:** no client haircut photos or verified reviews were supplied. The style cards are marked as inspiration; the page does not show fabricated testimonials or star ratings.

## Preview and installation

From this folder, run a local preview with:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

The site is an installable **Progressive Web App (PWA)**. Android browsers can use the in-page **Install** action; on iPhone/iPad, open it in Safari and choose **Share → Add to Home Screen**. The app shell, privacy page, and salon photos are available offline after caching. Booking and sharing require internet access.

### Android APK

- **[Download the Android app](https://github.com/sunnyprajapati1947-coder/Sunny-/releases/latest/download/Mens-Salon-Nawada-v1.0.4.apk)** from the public GitHub release.
- Release version: **1.0.4** (version code 5), package `com.menssalon.nawada`.
- The APK bundles the bilingual site, privacy policy, and salon photos locally. WhatsApp booking and sharing need internet access.
- Install on Android 7.0 or newer. The debug-signed APK is for direct installation only, not a Play Store upload; follow Google Play Protect's scan recommendation if shown.
- Each push to `main` or an `arena/**` branch runs **Build Men's Salon Android release** in GitHub Actions. Successful builds from this app branch or `main` publish the APK and SHA-256 checksum as a GitHub release.

### Google Play handoff

A Play Store upload requires a **signed Android App Bundle (AAB)** and an owner-managed Google Play Console account. The workflow builds and attaches a signed AAB only when the repository has the existing upload key configured as these GitHub Actions secrets: `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, and `ANDROID_UPLOAD_KEY_PASSWORD`. Do not commit a keystore or share its passwords in chat. If this package already exists in Play Console, use its existing upload key; do not replace or regenerate it casually. Play Console submission and store declarations remain owner actions; a GitHub release is not a Play Store listing.

To build locally (Node.js 22, Java 21, Android SDK 36):

```bash
cd salon-website/android-app
npm ci
npm run android:debug
```

The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Vercel bundle

After the source commit is pushed, prepare the direct Vercel bundle with:

```bash
python3 salon-website/build-vercel-bundle.py
```

This writes an ignored `.vercel-upload/` directory containing the compressed page, app icon, manifest, service worker, privacy page, crawler files, and brand asset. It pins photo references to the committed GitHub revision. Bundle generation alone does not deploy the site or remove Vercel access protection.

## Main files

- `index.html` — bilingual site, service menu, contact details, booking/support dialogs, structured data
- `styles.css` — visual theme, responsive layout, and dialog scrolling
- `script.js` — language, booking, support/AI, contact/share, and PWA install behavior
- `privacy.html` — English/Hindi privacy notice
- `robots.txt` and `sitemap.xml` — crawler guidance and public URL inventory
- `manifest.webmanifest` and `sw.js` — install metadata and versioned offline shell
- `build-vercel-bundle.py` — reproducible direct-deployment bundle generator
- `assets/`, `icons/`, and `app-icon.svg` — supplied salon photos, branding, and install icons
- `android-app/PLAY-STORE-LISTING.md` — store listing draft and owner prerequisites
- `android-app/` — Capacitor Android project and native share/contact bridge
- `.github/workflows/android-apk.yml` — automated Android SDK build, verification, artifact, and release
