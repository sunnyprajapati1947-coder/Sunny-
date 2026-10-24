# Men's Salon website

A dependency-free, bilingual (English / Hindi) landing page for the men's salon in Sudama Nagar, Nawada.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` in a browser. The site is static and needs no build step or API keys.

## Included

- Responsive luxury/editorial styling for desktop and mobile
- English / Hindi language toggle, with the selection remembered in the browser
- WhatsApp booking form that sends the service, name, requested date/time, and notes to **+91 96080 87035**
- Direct click-to-call, Google Maps directions, service menu, barber profile, and location details
- Salon interior and Nitish Jatav photos supplied for this site
- SEO metadata and local business structured data
- Reduced-motion and keyboard-accessibility support

## Details to confirm before publishing

- **Salon's official name:** currently shown as “Men's Salon” because no separate business name was supplied.
- **Opening days and hours:** not shown as fixed hours; the site asks customers to call/message to confirm today's availability.
- **Prices:** the displayed starting amounts are *indicative local benchmarks*, not confirmed prices for this salon. A Nawada-area listing gives a broad men's haircut estimate from ₹150; see [Shuru's Nawada salon guide](https://shuru.co.in/services/salon-and-personal-care-in-nawada). Please replace the four starting amounts in `index.html` with Nitish's exact rates before publishing.
- **Haircut portfolio and reviews:** no client haircut photos or real reviews were provided. The “style” cards are clearly marked as inspiration, and no fake testimonials or star ratings are shown. Add real work/reviews once available.
- **Address:** currently set to Sudama Nagar, Nawada, Bihar 805110. Confirm the exact map pin / landmark if available.

## App installation

This is an installable **Progressive Web App (PWA)**, not a Play Store APK. Deploy it over HTTPS (Vercel provides HTTPS), then use the in-page **Install the salon app** action. Android browsers can install it directly; on iPhone/iPad, open the site in Safari and choose **Share → Add to Home Screen**. The cached app shell keeps the salon pages available offline; booking still needs an internet connection to open WhatsApp.

## Main files

- `index.html` — site copy, services, contact details, structured data, and install help
- `styles.css` — visual theme and responsive layout
- `script.js` — language toggle, responsive menu, WhatsApp booking, PWA install prompt, and service-worker registration
- `manifest.webmanifest` — PWA name and launch settings
- `sw.js` — offline app-shell cache
- `icons/` — install and home-screen icons
- `assets/` — supplied salon and barber photographs
