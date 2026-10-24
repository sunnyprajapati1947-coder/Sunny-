# Men's Salon website

A dependency-free, bilingual (English / Hindi) salon site and installable PWA for the men's salon in Sudama Nagar, Nawada.

**Vercel deployment URL:** [mens-salon-ten.vercel.app](https://mens-salon-ten.vercel.app)

**Public source repository:** [sunnyprajapati1947-coder/Sunny-](https://github.com/sunnyprajapati1947-coder/Sunny-)

> The Vercel team currently protects default `vercel.app` aliases. To make this URL anonymously accessible, the account owner must turn off deployment protection for production or attach a custom domain they own.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` in a browser. The site is static and needs no build step or API keys.

## Included

- Responsive, salon-oriented editorial styling for desktop and mobile
- English / Hindi language toggle, with the selection remembered in the browser
- One-minute style finder that recommends a starting service and preselects it in booking
- On-device “usual service” saving, with one-tap booking and no account
- WhatsApp booking form that sends the service, name, requested date/time, and notes to **+91 96080 87035**
- Share action and downloadable salon contact card (`.vcf`)
- Direct click-to-call, Google Maps directions, service menu, barber profile, and location details
- PWA home-screen shortcuts for booking and services, plus an offline app shell
- Supplied salon and Nitish Jatav photos
- SEO and social-share metadata, local business structured data, reduced-motion support, and keyboard-accessible controls
- A curated set of SVGs from the GitHub project [Lucide](https://github.com/lucide-icons/lucide); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the pinned revision and ISC notice

## Details to confirm before public launch

- **Salon's official name:** currently shown as “Men's Salon” because no separate business name was supplied.
- **Opening days and hours:** not shown as fixed hours; the site asks customers to call/message to confirm today's availability.
- **Prices:** the displayed starting amounts are *indicative local benchmarks*, not confirmed prices for this salon. A Nawada-area listing gives a broad men's haircut estimate from ₹150; see [Shuru's Nawada salon guide](https://shuru.co.in/services/salon-and-personal-care-in-nawada). Please replace the four starting amounts in `index.html` with Nitish's exact rates before publishing.
- **Haircut portfolio and reviews:** no client haircut photos or real reviews were provided. The “style” cards are clearly marked as inspiration, and no fake testimonials or star ratings are shown. Add real work/reviews once available.
- **Address:** currently set to Sudama Nagar, Nawada, Bihar 805110. Confirm the exact map pin / landmark if available.

## App installation and deployment

This is an installable **Progressive Web App (PWA)**, not a Play Store APK. Android browsers can install it from the in-page **Install the salon app** action; on iPhone/iPad, open it in Safari and choose **Share → Add to Home Screen**. The app shell and, after caching, the two salon photos are available offline; booking and sharing still need an internet connection. The Vercel site is uploaded directly from the static files because Vercel's GitHub connection is not enabled.

After the source commit is pushed, prepare the direct Vercel bundle with:

```bash
python3 salon-website/build-vercel-bundle.py
```

This writes a temporary, ignored `.vercel-upload/` directory. It bundles CSS/JavaScript and pins image URLs to the public GitHub commit for the Vercel upload.

## Main files

- `index.html` — site copy, service menu, contact details, booking and style-finder dialogs, structured data
- `styles.css` — visual theme and responsive layout
- `script.js` — language toggle, menu, booking, saved service, sharing/contact-card actions, and PWA install prompt
- `manifest.webmanifest` — PWA name, icons, shortcuts, and launch settings
- `sw.js` — versioned offline app-shell cache
- `build-vercel-bundle.py` — reproducible direct-deployment bundle generator
- `icons/` and `app-icon.svg` — install and home-screen icons
- `assets/` — supplied salon/barber photos and locally bundled Lucide SVG icons
- `THIRD_PARTY_NOTICES.md` — source and license notice for the icon assets
