# Google Business Profile Guide — Men's Saloon (Free)
### "Salon near me" search mein dukaan dikhane ka complete tarika

Jab koi Nawada mein Google/Maps par **"salon near me"**, **"haircut near me"** ya
**"Men's Saloon Nawada"** search karega, to aapki dukaan photo, phone number aur
**"Call / Directions / Website"** button ke saath dikhegi. Ye bilkul **FREE** hai —
agar koi banda iske liye paise maange to samajh jana fraud hai.

**Live website (profile mein yahi link daalna hai):**
https://menssaloon-nawada.vercel.app

---

## Step 1 — Profile banao (10 minute, mobile se)

1. Apne Android phone mein **Google Maps** app kholo (ya browser mein jao:
   **google.com/business**).
2. Upar apni photo/profile wale gole par tap karo → **"Add your business"**
   (Apna business jodein).
3. Business ka naam likho: **Men's Saloon**
4. Category mein likho: **Barber shop** (hindi mein "Nai ki dukaan" bhi select
   kar sakte ho; dusri category mein **Hair salon** add kar do).
5. "Kya aap location add karna chahte hain jahan customer aa sakte hain?" →
   **Yes** → address bharo:
   - **Sudama Nagar, Nawada, Bihar** (apna sahi PIN code check kar lena,
     Nawada ka aam PIN **805110** hai)
   - Uske baad map par **laal pin ko apni dukaan ki exact jagah** par set karo —
     yahi sabse important hai, kyunki customer "Directions" dabakar isi pin par aayega.
6. Phone number: **+91 90313 68918** (yahi WhatsApp number bhi hai — bahut achha!)
7. Website: **https://menssaloon-nawada.vercel.app**
8. Opening hours (somvar se ravivar, saato din):
   **7:00 AM – 8:30 PM** (Subah 7 se raat 8:30)
9. "Finish" dabao.

## Step 2 — Verification (Google confirm karega dukaan asli hai)

- Aajkal Google aksar **video verification** maangta hai: ek chhota video banao
  jisme dikhe — (1) dukaan ka board "MEN'S SALOON", (2) andar ki chair/mirror,
  (3) aas-paas ki gali/landmark taaki jagah confirm ho, (4) agar koi dukaan ka
  paper hai to wo bhi.
- Video ek hi take mein banao, beech mein cut mat karo. 1–2 din mein profile
  **live** ho jayegi. Kabhi-kabhi postcard se bhi verify hota hai (5–7 din).

## Step 3 — Profile ko pura bharo (isse ranking badhti hai)

Google Maps app → Profile → **"Your business profile"** → Edit:

| Cheez | Kya daalna hai |
| --- | --- |
| **Photos (sabse important)** | Board wali photo, andar ki photo (chair + mirror), Nitish ki photo, aur ye QR poster `qr-poster/shop-board-poster.png`. Kam se kam 5–6 achhi roshni wali photo. Har hafte 1 nayi photo daalte raho. |
| **Services + Price** | Haircut ₹50 · Shaving ₹50 · Haircut+Shaving ₹100 · Skin Fade ₹100 · Beard Setting ₹50 · Facial ₹499 se · Hair Colour ₹150 se |
| **Hours** | Saato din 7:00 AM – 8:30 PM |
| **Phone** | +91 90313 68918 |
| **Website** | https://menssaloon-nawada.vercel.app |
| **Description** | "Men's Saloon, Sudama Nagar Nawada — Haircut sirf ₹50, Haircut + Shaving ₹100. Skin fade, beard setting, facial aur grooming bajar rate par. Master barber Nitish Jatav (10 saal ka experience). Roz subah 7 se raat 8:30 khula. WhatsApp par booking karo, bina intzaar chair pakki." |

## Step 4 — Reviews = free mein upar aana ⭐

- Jo dukaan upar dikhti hai, uske reviews zyada hote hain. Har khush customer
  se bas itna bolo: *"Bhaiya, Google par 5 star de dijiyega, bahut madad hogi."*
- Profile live hone ke baad Google ek **review link** dega — uska bhi QR bana
  kar dukaan mein laga sakte ho (bolo to main bana dunga).
- Har review ka **jawab** do (dhanyavaad bolna hi kaafi hai) — Google isko
  pasand karta hai aur dukaan aur upar jati hai.
- ❌ Fake review kharidna mat — Google pakad leta hai aur profile band ho jati hai.

## Step 5 — Roz ke chhote kaam (hafta mein 10 min)

1. Koi achha haircut ho to customer ki ijazat se photo Google par "Add photo"
   kar do.
2. Tyohar/offer ho to profile mein **"Add update"** post daal do
   (jaise "Diwali offer — Full Grooming ₹199").
3. Timing badle to sabse pehle Google par update karo, phir website par
   mujhe bol do ya `mens-saloon/src/config.ts` mein khud badal lo.

---

### Dhyaan do
- **Google Business bilkul free hai.** Koi call karke "profile verify karne ke
  ₹499" maange — turant kaat dena, fraud hai.
- Apna Google account ka password kisi ko mat dena. Profile hamesha apne hi
  Gmail par banao.
- Website live: **https://menssaloon-nawada.vercel.app** — isi ka QR poster
  `qr-poster/shop-board-poster.png` dukaan ke board/sheeshe par laga do.
  Print karne ke liye file studio wale ko WhatsApp kar do, A4 ya bada flex
  size mein chalega.

---

# 🔍 PART 2 — Google Search me website #1 par laana (Search Console)

> Website ke andar poora technical SEO already laga diya gaya hai (title, description, keywords,
> structured data, robots.txt, sitemap.xml, app install). Google apne-aap kuch dino me site
> dhoondh lega — lekin **Search Console me submit karne se ye 10x fast** ho jata hai.
> Sirf 5 minute lagenge, bilkul FREE.

## Steps (phone browser se ho jayega)

1. Browser me kholo → **search.google.com/search-console**
2. Apne **Gmail** se login karo → **"Add property"**
3. Right side wala box **"URL prefix"** chuno, ye paste karo:
   `https://menssaloon-nawada.vercel.app/`
4. **Verification** — "HTML tag" wala method chuno. Ek lambi si line milegi
   (`<meta name="google-site-verification" content=".....">`).
   👉 **Woh line mujhe bhej do** — main website me laga dunga, phir tum Verify daba dena. Bas!
5. Verify hone ke baad left menu → **Sitemaps** → `sitemap.xml` likhkar Submit kar do.
6. Upar search box me website ka URL daalkar **"Request Indexing"** bhi dabaa dena —
   Google 1-7 din me site ko search results me dikhane lagega.

## Sachchi baat: ranking ka asli formula

- Koi bhi pehle din se #1 guarantee **nahi** de sakta — Google ranking 2 chizo par tikti hai:
  **(1) Google Business Profile** (uper wala Part 1 — "saloon near me" / "barber nawada" me yahi
  sabse upar aata hai) aur **(2) asli Google reviews** (zyada reviews = zyada upar).
- Website ka SEO hamne full-tank kar diya hai. Ab jitne customers se review karwaoge,
  utna upar jaoge — `Men's Saloon nawada`, `Sudama Nagar saloon`, `best barber nawada` jaisi
  search me top par aana tab pakka hota hai.
- Shop board par **QR poster** laga do — wahi QR customers ko website + review dono tak le jata hai.

---

# 🏆 PART 3 — "Nawada saloon Sudama Nagar" me FIRST aane ka saccha formula

Website ke andar ki saari setting (SEO, map-data, price-list schema) complete hai.
Ab ranking in 4 cheezon se badhegi — ye sab **tumhare haath** me hai, mere nahi:

## 1) Google Business Profile (sabse bada hathiyar)
Upar Part 1 ke steps follow karke profile banao. Naam hamesha ek jaisa rakho:
**Men's Saloon** · Category: **Barber shop** · Sudama Nagar, Nawada · Number: **+91 90313 68918**
Website wali jagah ye paste karo: `https://menssaloon-nawada.vercel.app`

## 2) Har khush customer se review (yahi asli teer hai) ⭐
Haircut ke baad WhatsApp par ye ready message bhej do (copy-paste):

> Namaste bhai 🙏 Men's Saloon Sudama Nagar se — ummeed hai look pasand aaya hoga!
> Agar khush ho to Google par 2 line ka review de do, hamari chhoti si dukaan ke liye
> ye bahut badi madad hai ⭐ (Google par "Men's Saloon Sudama Nagar" search karke review likh sakte ho)

⚠️ Review ke badle discount/free service mat dena — Google isey mana karta hai.
Sirf pyaar se bolo, khush customer khud de deta hai. 20–30 asli review = ilaake me sabse upar.

## 3) Search Console (Part 2) — verification wali line mujhe bhej do
Wo ek line milte hi main site me laga dunga. Uske baad Google ko official "signal"
mil jayega ki site asli hai — indexing fast ho jayegi.

## 4) Jagah-jagah wahi naam + website (free)
- **JustDial** par free listing (justdial.com → "List your business")
- **Facebook Page + Instagram** bio me website ka link
- Dukaan ke board par **QR poster** (pehle diya hai) — scan = website = booking
Jitni jagah "Men's Saloon, Sudama Nagar" ek jaise naam-number se hoga,
Google utna zyada bharosa karega.

## 5) Roz ka kaam — bina mujhe bole (Shop Panel se)
Website me neeche **Shop Panel** (PIN wala) hai. Wahan se:
- **Daam/service badalna** → save dabate hi website + app dono par turant live
- **Aaj dukaan band** → toggle ON, site par "band" dikhne lagega
- **Upar ki notice line** → jo likhoge wahi site ke sabse upar dikhega
Muze baar-baar bolne ki zaroorat hi nahi padegi. Season ke rang (Diwali/Holi/Shaadi)
to khud-ba-khud badalte rahenge. 🎉
