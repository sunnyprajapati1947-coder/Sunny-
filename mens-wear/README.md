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
