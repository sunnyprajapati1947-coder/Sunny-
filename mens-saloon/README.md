# Men's Saloon — Premium Website (Sudama Nagar, Nawada)

Luxury one-page website for **Men's Saloon** with the exact **ThreeUI Kage**
interactive experience, services & researched prices, master-barber profile
(Nitish Jatav), and 1-hour chair booking that lands directly on WhatsApp
(**+91 90313 68918**). Built for customers first: prices, location, call and
WhatsApp are always one tap away.

## Run it

```bash
cd mens-saloon
npm install
npm run dev      # http://localhost:5173
npm run build    # production files in dist/
npm run preview  # preview the production build
```

## Edit prices / phone / hours (owner guide)

Everything lives in **one file**: `src/config.ts`

| What | Where in `src/config.ts` |
| --- | --- |
| Phone & WhatsApp number | `BUSINESS.phoneDisplay` / `whatsappNumber` |
| Address & Google Maps link | `BUSINESS.addressLine` / `mapsUrl` |
| Opening hours text | `BUSINESS.hoursLabel` (currently "Open Daily · Day Hours" — replace with exact timings, e.g. `9 AM – 9 PM`) |
| Service prices & durations | `SERVICES` list |
| Combo packs | `COMBOS` list |
| Booking time slots (1-hour) | `TIME_SLOTS` |
| Barber name, age, experience | `BARBER` |

Change a number, save, and the price cards, booking form and WhatsApp
messages all update together. No other file needs editing.

**Photos:** `public/images/nitish-jatav.jpg` (barber) and
`public/images/shop-front.jpg` (shop). Replace the files, keep the names.

## How booking works

1. Customer fills name, mobile, service, date and preferred 1-hour slot.
2. The site opens WhatsApp to +91 90313 68918 with the booking pre-written —
   the customer just presses **Send**.
3. The saloon replies on WhatsApp to confirm the exact time.
   No server, no advance payment, no app install for the customer.

## The Kage experience (exact ThreeUI source)

The immersive frame is the **real** `<KageLandingPage />` from
`@designcodeio/threeui` (npm / github.com/MengTo/threeui), used with the
exact configured props in `src/Scene.tsx`. Its canonical document and all
14 binary assets are served byte-for-byte from `public/landing-pages/` —
every SHA-256 matches the registered ThreeUI source bundle. Full proof:
[KAGE_SOURCE.md](KAGE_SOURCE.md).

## Structure

```
mens-saloon/
  index.html                 SEO title, meta, BarberShop schema (JSON-LD)
  src/
    config.ts                ← edit all business details here
    Scene.tsx                exact <KageLandingPage /> configured usage
    App.tsx                  salon website (hero, services, booking…)
    App.css                  luxury maroon + gold theme (Kage language)
  public/
    images/                  saloon photos
    landing-pages/           canonical kage.html + assets (do not edit)
```

## Deploy (free options)

- **Vercel / Netlify:** import this folder, build command `npm run build`,
  output `dist`.
- **GitHub Pages:** run `npm run build` and publish `dist/` (note: the Kage
  frame loads from `/landing-pages/kage.html`, so deploy at a domain root,
  or adjust `base` in `vite.config.ts` for a sub-path).

## Notes for the owner

- Prices are researched Indian starting prices adjusted for Nawada
  (haircut ₹249, beard ₹199, combo ₹399…). Edit them in `src/config.ts`.
- Exact opening/closing **clock timings** were not provided ("Day"), so the
  site says *Open Daily · Day Hours* and asks customers to confirm on
  WhatsApp. Update `hoursLabel` when timings are final.
- Next growth steps: claim the free Google Business Profile for "Men's
  Saloon Sudama Nagar Nawada", add this website link there, and put a QR
  code of the site on the shop board for instant bookings.
