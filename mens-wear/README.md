# Men's Wear — Premium Website

> ### 🔗 Live website
> **https://nawada-menswear-shop.vercel.app/**
>
> Yeh link kisi bhi phone/laptop par khulta hai — WhatsApp par bhejne ke liye ready.
> Har product ka button aur phone number seedha aapke WhatsApp (`96080 87035`) par le jaata hai.

Premium, 3D-enhanced single-page website for **Men's Wear**, Sudama Nagar, Nawada (Bihar 805110).

- **Shop:** Men's Wear
- **Address:** Sudama Nagar, Nawada, Bihar — 805110
- **Mobile / WhatsApp:** +91 96080 87035
- **Type:** Static site — no build step, no server, no paid services needed.

## Naya kya hai (v2)
- **8 products**, real studio photos (sherwani, 3-piece suit, bandhgala, kurta, linen shirt, denim jacket, overcoat, chinos).
- **Tap any garment -> full product page**: big gallery, MRP + discount %, size picker + size chart, colour swatches, offers, delivery/pickup, specs, wash care, rating breakdown, verified review.
- **Search + sort + category filters** (Popular / Price / Top rated) — shopping-app jaisa.
- **Wishlist** (phone mein save rehta hai) aur **WhatsApp button jo size + colour ke saath message bhejta hai**.
- Product detail sheet mobile par full-screen, desktop par split view — dono jagah premium dark + holographic look.

---

## 1. Kaise chalayein (local)

Folder ke andar simple static server chalayein:

```bash
cd mens-wear
python3 -m http.server 8080
```

Phir browser mein `http://localhost:8080` kholein.

> `index.html` ko direct double-click karke bhi khol sakte hain, lekin 3D hero (ES module) tab
> browser security ki wajah se load nahi hoga — isliye server use karna best hai.

---

## 2. Website mein kya hai

| Section | Kya karta hai |
|---|---|
| **Hero** | 3D gold silk, ghoomte halo rings aur gold dust — sab ek custom WebGL shader se (koi library nahi, sirf ~9 KB). Photo par tilt bhi. |
| **Trust strip** | Original fabric, free fitting, styling advice, payment options — customer ka trust turant banata hai. |
| **Collection** | 6 product cards + filters (Wedding / Formal / Casual / Ethnic). Har card ka button WhatsApp par **product ka naam likh kar** bhejta hai. |
| **Craft** | Store interior photo + 3-point quality explanation. |
| **Stats** | Animated counters (customers, wedding looks, rating, alteration time). |
| **Reviews** | 3 customer testimonials (sample — apne asli reviews se replace karein). |
| **Visit Store** | Address, timing, phone, payment modes + Google Map embed. |
| **CTA band** | Aakhri push: WhatsApp par order. |
| **Footer** | Address, timing, phone, quick links. |
| **Floating WhatsApp** | Desktop par niche-right pulse button; mobile par **Call + WhatsApp** sticky bar. |

Har "Order" / "Enquire" button `https://wa.me/919608087035?text=...` par jaata hai — matlab
customer ka WhatsApp khulta hai aur message pehle se likha hota hai (jaise
_"Namaste Men's Wear! Mujhe Black Zardozi Sherwani ke baare mein jaankari chahiye…"_).
Isse customer ko type karne ki zaroorat nahi — order karne ka chance badhta hai.

---

## 3. Phone / WhatsApp number badalna

Number do jagah hai:

1. **`assets/js/main.js`** — sabse upar:
   ```js
   var WHATSAPP_NUMBER = "919608087035";   // 91 + 10 digit number, no + and no spaces
   ```
   Ye saare product buttons ke prefilled messages ke liye use hota hai.

2. **`index.html`** — `tel:+919608087035` aur `https://wa.me/919608087035` ko naye number se
   replace karein (Find & Replace kaafi hai).

Visible text `96080&nbsp;87035` bhi update karna na bhoolein.

---

## 4. Products, prices aur photos badalna

- **Products / price** → `index.html` mein `<!-- 1 -->`, `<!-- 2 -->` waale `<article class="card">`
  blocks. Har card mein: category (`data-cat`), tag, photo, title, description, price, aur
  `data-wa="..."` (WhatsApp message).
- **Photo** → `assets/img/` mein file rakhein aur `src` update karein. Product photos square
  (1:1) best rehti hain.
- **Filters** → `data-cat` ki value `wedding`, `formal`, `casual`, ya `ethnic` rakhein.

> **Important:** Is website ki photos AI se banayi gayi hain (placeholder). Sabse zyada trust
> tab badhta hai jab aap **apne shop ki asli photos** lagayein — apni sherwani, apna store
> interior, apne customers ke saath. Bas same file name se replace kar dein:
> `assets/img/product-sherwani.jpg`, `assets/img/store-interior.jpg`, etc.
> Photos 1024×1024 (products) aur ~1400px wide (store) rakhein taaki site fast rahe.

---

## 5. Google Map / location

`index.html` mein ye do jagah update karein:

```html
<iframe src="https://www.google.com/maps?q=Sudama%20Nagar%2C%20Nawada%2C%20Bihar%20805110&output=embed" ...>
<a href="https://www.google.com/maps/search/?api=1&query=Sudama+Nagar%2C+Nawada%2C+Bihar+805110" ...>
```

Agar Google Business Profile par shop ka exact pin hai, to us pin ka link yahan paste karein —
customer seedha aapki dukaan tak pahunch jayega.

---

## 6. Live site

Abhi ye site live hai:

**https://menswear-nawada.vercel.app**

Har update ke baad naya deploy chahiye. Hosting options:

## 6b. Free hosting (apne account par)

1. **GitHub Pages** — repo ke Settings → Pages → branch `main`, folder `/` (ya `mens-wear`
   ko alag repo banayein). Site live ho jayegi.
2. **Netlify / Vercel** — `mens-wear` folder drag-and-drop karein. Custom domain bhi lag sakta hai.
3. **Apna domain** (jaise `menswearnawada.in`) — kisi bhi host par point kar dein. Website
   fully static hai, isliye hosting almost free/pennies mein padti hai.

Live jaane se pehle `index.html` ke `<link rel="canonical">` mein apna asli domain daal dein.

---

## 7. SEO + trust ke liye pehle se ready

- Local business structured data (`ClothingStore` schema) — naam, address, phone, timing,
  payment modes. Google par "mens wear nawada" search mein madad karta hai.
- Open Graph tags — WhatsApp par link bhejne par premium preview card dikhta hai.
- Mobile-first responsive, accessibility (keyboard, screen reader labels, `prefers-reduced-motion`).
- Lightweight: 3D khud ka WebGL shader (koi 700 KB library nahi), fonts Google Fonts se, koi tracker nahi.

**Ek zaroori kaam:** Google Business Profile par shop list karein (naam, address, phone,
timing, photos). Website + GBP dono milke local customers laate hain.

---

## 8. Sample data jise aapko confirm karna hai

Ye cheezein premium dikhane ke liye sample rakhi gayi hain — apne asli data se replace karein:

- Product prices ("₹5,999 onwards") — apne actual rate daalein.
- Reviews (Rahul, Amit, Sana) — apne asli customer reviews.
- Stats: 5,000+ customers, 1,200+ wedding looks, 4.9★ rating, 24hr alteration.
- Opening hours: 10:00 AM – 9:00 PM (daily).

Footer mein already likha hai: _"Prices indicative hain — final price store ya WhatsApp par
confirm karein."_ — ye trust ke liye accha hai aur galat price ka risk kam karta hai.

---

## 9. Files

```
mens-wear/
├── index.html              # poora page + SEO data
├── README.md
└── assets/
    ├── css/style.css       # design system (colors, type, layout, animations)
    ├── js/main.js          # filters, WhatsApp links, drawer, counters, tilt, reveals
    ├── js/hero3d.js        # 3D hero — custom WebGL shader (no library)
    └── img/                # hero, products, store photos
```

Design tokens (colors/fonts) `assets/css/style.css` ke top par `:root` mein hain — ek jagah
badalne se poori site ka look badal jaata hai.

---

## 3. Dukaan malik ke liye — kya-kya khud badal sakte hain

Sab settings ek hi jagah hain: **`assets/js/shop.js`** ke sabse upar `CONFIG` block.

| Setting | Kya karti hai |
|---|---|
| `whatsapp` | Order kis number par jayega |
| `showMrp` | `false` karne par MRP / discount line poori tarah hide ho jaati hai |
| `priceNote` | Price ke neeche chhoti line (default: "Final price aur offer WhatsApp par confirm hote hain") |
| `delivery` | Delivery / pickup ka text |
| `exchange` | Exchange ka text |
| `alteration` | Alteration ka text |

Product ka price, MRP, size, colour, photo — sab `PRODUCTS` block mein hai, uske neeche.
Ek product aisa dikhta hai:

```
"sherwani": {
  "price": 5999, "mrp": 9999,        // apne asli daam daaliye
  "imgs": ["assets/img/v2/sherwani.jpg", "assets/img/product-sherwani.jpg"],
  "cols": [{ "name": "Jet Black", "hex": "#111114" }],
  "sizes": ["S", "M", "L", "XL", "XXL"], "sold": "XXL"
}
```

### Apne kapdon ki photo lagana
1. Photo phone se kheenchein — **safed/plain deewar**, din ki roshni, poora kapda frame mein, seedha khada ho kar.
2. Photo ka naam wahi rakhein jo `imgs` mein hai (jaise `sherwani.jpg`) aur file `assets/img/v2/` mein daal dein.
3. Sirf file badalne se site par photo badal jayegi.

### Order kaise milega
- Customer **Add to bag** → **Order on WhatsApp** dabata hai.
- Aapke WhatsApp par poora order ek message mein aata hai: order ref, har piece ka naam, size, colour, qty, total — aur customer ka naam/address ki jagah.
- Jo customer seedha WhatsApp button dabata hai, usme bhi piece, size aur colour pehle se likha hota hai.

### Product ka apna link
Har piece ka link aisa hota hai — WhatsApp status par bhej sakte hain:
`https://nawada-menswear-shop.vercel.app/#p=sherwani`
(`sherwani`, `suit`, `linen`, `kurta`, `denim`, `overcoat`, `bandhgala`, `chinos`)

---

## 4. v9 — kya badla (aur dukaan malik ko kya karna hai)

**Site se hataya:** preloader, WebGL 3D hero (phone slow karta tha — ab halka CSS glow hai), banaye hue star ratings, "5,000+ customers", sample review quotes, aur fake MRP/discount (MRP ab default `false`).

**Site mein joda:** 18 products (7 wedding), **Groom package** section, **Offers** strip, **7-sawaal FAQ**, honest **Reviews** section (Google + WhatsApp feedback), store mein landmark row, aur map ka zoom theek kiya.

### In 5 lines ko bharna hai (bas itna)

`assets/js/shop.js` ke top par `CONFIG`:

```
instagram:      ""   ->  "https://instagram.com/your_handle"
facebook:       ""   ->  "https://facebook.com/your_page"
googleProfile:  ""   ->  apne Google Business Profile ka link
showMrp:        false->  asli MRP mile to true
```

Aur `CONFIG` ke neeche `PAIRS` mein "complete the look" pairs hain — apne hisaab se badal sakte hain.

### Groom package ka rate
Package ka rate design par depend karta hai, isliye site par rate nahi likha — button WhatsApp par le jaata hai. Agar aap fixed package rate dena chahte hain to `index.html` mein `groom__actions` ke paas ek `<p>` jod dein, ya mujhe bata dein.

### Rent
Rent abhi menu/section mein nahi hai kyunki pata nahi ki aap karte hain ya nahi. Haan bolenge to package jaisa hi ek rent block bana denge (rate + advance ke saath).

### 2 photo baaki
`polo` aur `nehru jacket` ke product abhi nahi hain (image limit). Agli baar add ho jayenge — total 20 ho jayenge.

### Google Business Profile (sabse zaroori, site se bahar)
1. business.google.com → "Add business" → naam **Men's Wear**, category "Men's clothing store".
2. Address: Sudama Nagar, Nawada, Bihar 805110 + exact pin (dukaan par khade ho kar).
3. Phone 9608087035, timing 10 AM – 9 PM, website: `https://nawada-menswear-shop.vercel.app/`
4. 5–10 purane customers se review likhwao — phir site ke Reviews section mein wahi link already lag chuka hai.
5. Dukaan ke andar-bahar ki 5–6 photo daalo.

---

## 5. App (install karein) — v12

Site ab **installable app** hai: customer Chrome mein "Install" dabaye ya iPhone par Safari → Share → **Add to Home Screen**, to home screen par **MW** icon ban jaata hai, app fullscreen khulta hai aur ek baar khulne ke baad **offline** bhi chalta hai. Koi Play Store fee nahi.

**Kaise:** wahi link `https://nawada-menswear-shop.vercel.app/` — bas.

### App ke files

| File | Kaam |
|---|---|
| `live/entry.src.html` | chhota app shell (3.4 KB) — yahi Vercel par `index.html` banta hai |
| `live/vercel-entry.html` | `python3 tools/build-entry.py` se banta hai (deploy payload) |
| `live/app-shell.js` | asli logic — CDN se site laata hai, head/body transplant karta hai, install prompt + offline toast |
| `manifest.json` | app ka naam, icon, fullscreen, 3 shortcuts (Collection / Groom / Bag) |
| `sw.js` | offline service worker (`mw-app-v3`) — last copy cache karta hai |
| `assets/img/app/*.png` | home-screen icons (192, 512, maskable, apple-touch) |

### Update karne ka tarika
1. Site content ho to `assets/js/*`, `index.html`, `assets/css/*` badlein → `tools/build-live.py`.
2. Shell/offline logic ho to `live/app-shell.js` ya `sw.js` badlein (`sw.js` ka `VERSION` bump karein).
3. `python3 tools/build-entry.py` → `node --check live/app-shell.js` → commit.
4. **Naya tag** lagayein (`app-v4`, `app-v5` …) aur `live/app-shell.js` + manifest ke andar `@app-vN` refs bhi badlein — jsDelivr purane tag ko cache karta hai, isliye purana tag reuse na karein.
5. Vercel par `index.html` (= `live/vercel-entry.html`) + `sw.js` deploy karein. Bas.

> Note: `sw.js` sirf same-origin se register hota hai, isliye wo Vercel par hi rehta hai. Manifest CDN se aata hai (absolute `start_url`/`scope` ki wajah se install theek kaam karta hai).
