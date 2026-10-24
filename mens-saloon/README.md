# Men's Saloon — Premium Website (Sudama Nagar, Nawada)

Luxury one-page website for **Men's Saloon** with the exact **ThreeUI Kage**
interactive experience, owner-confirmed bajar prices (Haircut ₹50 ·
Haircut + Shaving ₹100), shop hours **7:00 AM – 8:30 PM daily** with a live
Open/Closed badge, master-barber profile (Nitish Jatav), and booking that
lands directly on WhatsApp (**+91 90313 68918**).

## 🌐 Live website

**https://menssaloon-nawada.vercel.app** (Vercel, free hosting)

- QR poster for the shop board: [`qr-poster/shop-board-poster.png`](qr-poster/shop-board-poster.png)
  (plain QR: `qr-poster/shop-board-qr.png`, regenerate with `qr-poster/make_poster.py`)
- Google par dukaan dikhane ki guide: [`GOOGLE_BUSINESS_GUIDE.md`](GOOGLE_BUSINESS_GUIDE.md)

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
| Opening hours (7 AM – 8:30 PM) | `BUSINESS.opensAt` / `closesAt` + `hoursLabel` |
| Service prices & durations | `SERVICES` list |
| Combo packs | `COMBOS` list |
| Booking time slots (7 AM – 7:30 PM) | `TIME_SLOTS` |
| Barber name, age, experience | `BARBER` |

Change a number, save, and the price cards, booking form and WhatsApp
messages all update together. No other file needs editing.

**Photos:** `public/images/nitish-jatav.jpg` (barber) and
`public/images/shop-front.jpg` (shop). Replace the files, keep the names.

## How booking works

1. Customer fills name, mobile, service, date and preferred time (7 AM – 8:30 PM).
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

## Deploy / live updates (important)

The site is live on **Vercel** in the project **mens-salon** (team
`sunnyprajapati1947-1926s-projects`), domains:
`menssaloon-nawada.vercel.app` and `mens-salon-ten.vercel.app`.

**Note:** the Vercel account currently shows
*"A Github account is not connected to this Vercel account"* for Git
deployments, so this site was deployed by uploading one small file while the
project's **build command downloads this repo at a pinned commit from GitHub
and builds `mens-saloon/` on Vercel**. To publish new changes:

1. Push the change to GitHub (branch `arena/4330711b-sunny`) and note the new
   commit SHA.
2. In Vercel → mens-salon → Settings, replace the commit SHA inside the
   **Build Command**, then create a new Production deployment from
   `salon-website/DEPLOY.txt` (or ask your agent to do it).

**Permanent fix (recommended, 1 minute):** Vercel Dashboard → profile →
Settings → **Login Connections** → Connect **GitHub**. After that, link the
project to `sunnyprajapati1947-coder/Sunny-` with root directory
`mens-saloon` and every push will deploy automatically.

## Notes for the owner

- Prices are owner-confirmed bajar rates (haircut ₹50, haircut + shaving
  ₹100, facial ₹499 onwards by product). Edit them in `src/config.ts`.
- Hours are owner-confirmed: **opens 7:00 AM, closes 8:30 PM, daily**. The
  site shows a live "Open Now / Closed" badge (Indian time).
- Next growth step: follow `GOOGLE_BUSINESS_GUIDE.md` to appear in
  "salon near me" searches, and stick the QR poster on the shop board.
