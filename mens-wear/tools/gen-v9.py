# -*- coding: utf-8 -*-
"""
v9 build: honest shop.
- removes preloader + WebGL hero (fast on cheap phones)
- removes invented ratings / customer counts / sample review quotes
- adds 10 more garments (18 total) with no fake MRP
- adds groom package, offers strip and FAQ sections
- points the map at CONFIG.mapQuery with a landmark line
Run from the mens-wear folder:  python3 tools/gen-v9.py
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA = "https://wa.me/919608087035"

NEW = [
 dict(id="ivory-sherwani", cat="wedding", name="Ivory Groom Sherwani", badge="Groom",
      price=6499, imgs=["assets/img/v2/ivory-sherwani.jpg"],
      cols=[("Ivory","#efe6d5"),("Champagne","#d9c29a")],
      sizes=["S","M","L","XL","XXL"], sold="XXL",
      short="Cream sherwani with fine gold thread work — classic groom pick.",
      fabric="Silk blend · gold thread embroidery", fit="Slim · free alteration",
      occasion="Wedding · Reception", care="Dry clean only",
      box="Sherwani, churidar, dupatta (optional)",
      desc="Cream sherwani har skin tone par lagti hai — isliye Nawada ke groom sabse zyada yahi uthate hain. Zari ka kaam halka hai, isliye poore function mein bhaari nahi lagta. Safa aur mojari ke saath ek complete groom look ban jaata hai."),
 dict(id="indo-western", cat="wedding", name="Black Indo-Western Set", badge="Trending",
      price=5499, imgs=["assets/img/v2/indo-western.jpg"],
      cols=[("Jet Black","#141418"),("Deep Wine","#4a1226")],
      sizes=["S","M","L","XL","XXL"], sold="S",
      short="Asymmetric kurta-jacket with drape sash — cocktail & sangeet ke liye.",
      fabric="Suiting blend · layered drape", fit="Tailored · free alteration",
      occasion="Sangeet · Cocktail · Reception", care="Dry clean only",
      box="Kurta-jacket, sash, trouser",
      desc="Sherwani pehen-pehen ke bore ho gaye? Indo-western ek hi outfit mein modern aur desi dono hai. Drape sash alag se pin hota hai, isliye aap decide kar sakte hain kitna dramatic chahiye."),
 dict(id="jodhpuri", cat="wedding", name="Royal Blue Jodhpuri Suit", badge="Royal",
      price=5999, imgs=["assets/img/v2/jodhpuri.jpg"],
      cols=[("Royal Blue","#1e2f57"),("Bottle Green","#14402f")],
      sizes=["S","M","L","XL","XXL"], sold="XL",
      short="High mandarin collar bandhgala suit with gold buttons.",
      fabric="Wool blend · brass buttons", fit="Structured · free alteration",
      occasion="Wedding · Engagement · Formal dinner", care="Dry clean only",
      box="Jodhpuri jacket, trouser",
      desc="Jodhpuri suit ka collar hi isko royal banata hai. Shaadi mein sherwani se halka lagta hai, isliye garmi mein bhi comfortable. Gold buttons shaam ki roshni mein khul ke dikhte hain."),
 dict(id="safa", cat="wedding", name="Groom Safa + Kalgi", badge="Groom set",
      price=899, imgs=["assets/img/v2/safa.jpg"],
      cols=[("Cream Gold","#e8d6b0"),("Maroon Gold","#6c1a2c")],
      sizes=["Free size"], sold="", 
      short="Pre-tied safa with kalgi pin — 2 minute mein ready.",
      fabric="Crushed silk · zari border", fit="Pre-tied · adjustable",
      occasion="Wedding · Baraat · Photos", care="Dry clean / hand steam",
      box="Safa, kalgi pin, extra pin",
      desc="Safa khud baandhne mein time aur practice lagti hai — yeh pre-tied hai, isliye 2 minute mein pehen ke nikal sakte hain. Kalgi pin alag se aata hai, sherwani ke brooch ki jagah bhi use kar sakte hain."),
 dict(id="mojari", cat="wedding", name="Zari Velvet Mojari", badge="Accessory",
      price=999, imgs=["assets/img/v2/mojari.jpg"],
      cols=[("Black Gold","#15151a"),("Cream Gold","#e3d3ae")],
      sizes=["6","7","8","9","10"], sold="6",
      short="Hand-embroidered velvet mojari with cushioned insole.",
      fabric="Velvet · zari embroidery", fit="True to size · cushioned",
      occasion="Wedding · Festive · Kurta", care="Dry brush only",
      box="1 pair",
      desc="Shaadi mein 6 ghante khade rehna hota hai — isliye insole cushioned hai, plain jutti jaisi sakht nahi. Zari ka kaam haath se kiya gaya hai, isliye har jodi thodi unique lagti hai."),
 dict(id="kurta-pyjama", cat="ethnic", name="Cream Kurta Pyjama Set", badge="Festive",
      price=1899, imgs=["assets/img/v2/kurta-pyjama.jpg"],
      cols=[("Cream","#efe7d8"),("Sage","#b9c4ab")],
      sizes=["S","M","L","XL","XXL"], sold="M",
      short="Self-textured cotton kurta with churidar — all-day comfortable.",
      fabric="Cotton blend · self texture", fit="Straight · free alteration",
      occasion="Puja · Eid · Family function", care="Machine wash cold",
      box="Kurta, churidar",
      desc="Pooja, milan ya ghar ke function — yeh set sab jagah chal jaata hai. Cotton hai isliye pasina soakta hai, aur churidar thoda stretch deta hai taaki baithne mein dikkat na ho."),
 dict(id="blazer", cat="formal", name="Charcoal Wool Blazer", badge="Office",
      price=2999, imgs=["assets/img/v2/blazer.jpg"],
      cols=[("Charcoal","#3a3d42"),("Navy","#1e2b45")],
      sizes=["S","M","L","XL","XXL"], sold="XXL",
      short="Single-breasted blazer that works with jeans and trousers both.",
      fabric="Wool blend · half-canvas front", fit="Slim · free alteration",
      occasion="Office · Interview · Dinner", care="Dry clean recommended",
      box="1 blazer",
      desc="Ek blazer se do look: shirt-trouser ke saath formal, t-shirt-jeans ke saath smart casual. Half-canvas front hai isliye chest par shape aati hai, par price poore suit jaisi nahi."),
 dict(id="white-shirt", cat="formal", name="Classic White Formal Shirt", badge="Essential",
      price=899, imgs=["assets/img/v2/white-shirt.jpg"],
      cols=[("White","#f6f4ef"),("Sky","#cfe0ee")],
      sizes=["S","M","L","XL","XXL"], sold="S",
      short="Crisp cotton poplin, wrinkle-resistant finish.",
      fabric="Cotton poplin · wrinkle resistant", fit="Slim · true to size",
      occasion="Office · Interview · Formal", care="Machine wash",
      box="1 shirt",
      desc="Safed shirt har aadmi ke paas honi chahiye — par achhi wali. Yeh poplin hai, isliye dhone ke baad zyada press nahi karni padti. Collar stiff hai, isliye tie ke saath bhi theek lagti hai."),
 dict(id="checked-shirt", cat="casual", name="Navy Check Casual Shirt", badge="Everyday",
      price=899, imgs=["assets/img/v2/checked-shirt.jpg"],
      cols=[("Navy Check","#2b3a53"),("Green Check","#2f4a37")],
      sizes=["S","M","L","XL","XXL"], sold="XXL",
      short="Soft brushed cotton check — college aur outing ke liye.",
      fabric="Brushed cotton · yarn dyed check", fit="Regular · relaxed",
      occasion="College · Casual · Travel", care="Machine wash cold",
      box="1 shirt",
      desc="Check shirt ka fayda: plain se zyada stylish, par print se zyada safe. Yeh brushed cotton hai isliye garmi mein bhi chipakti nahi. Jeans ho ya chinos, dono ke saath set."),
 dict(id="trousers", cat="formal", name="Black Slim Formal Trouser", badge="Essential",
      price=1199, imgs=["assets/img/v2/trousers.jpg"],
      cols=[("Black","#17171b"),("Navy","#1e2b45"),("Grey","#4a4d52")],
      sizes=["30","32","34","36","38","40"], sold="30",
      short="Poly-wool trouser with a sharp crease that stays.",
      fabric="Poly-wool blend · crease hold", fit="Slim · mid-rise",
      occasion="Office · Wedding · Daily formal", care="Machine wash / dry clean",
      box="1 trouser",
      desc="Formal trouser ki asli test: shaam tak crease rehni chahiye. Yeh poly-wool blend hai isliye crease hold karti hai aur ghisne par bhi chamakti nahi. Length free alter hoti hai."),
]

ALL = json.load(open('/tmp/products.json'))
for p in NEW:
    p = dict(p)
    p.pop('mrp', None)
    ALL[p['id']] = p
# normalise category keys (the first eight carry display labels)
_rev = {"Wedding":"wedding","Formal":"formal","Casual":"casual","Ethnic":"ethnic"}
for p in ALL.values():
    p['cat'] = _rev.get(p['cat'], p['cat'])

# strip invented ratings/reviews from the original eight
for p in ALL.values():
    for k in ('rating', 'ratings', 'review', 'mrp'):
        p.pop(k, None)
for p in ALL.values():
    p['sizes'] = p.get('sizes') or ["S","M","L","XL","XXL"]
    p['sold'] = p.get('sold') or ""

order = ["sherwani","ivory-sherwani","indo-western","jodhpuri","bandhgala","suit","jodhpuri"]
ordered = []
seen = set()
for i in ["sherwani","ivory-sherwani","indo-western","bandhgala","jodhpuri","safa","mojari","kurta-pyjama",
          "suit","blazer","overcoat","white-shirt","trousers",
          "linen","checked-shirt","denim","chinos","polo"]:
    if i in ALL and i not in seen:
        ordered.append(i); seen.add(i)
for k in ALL:
    if k not in seen:
        ordered.append(k); seen.add(k)
GROOM = ["sherwani","ivory-sherwani","indo-western","bandhgala","jodhpuri","safa","mojari","kurta-pyjama"]

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.05-.52-.1-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.34M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26 9.89 9.89 0 0 1 16.88-6.99 9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41Z"/></svg>'
HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/></svg>'

CAT = {"wedding":"Wedding","formal":"Formal","casual":"Casual","ethnic":"Ethnic"}

def inr(n):
    s = str(int(n))
    if len(s) <= 3: return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:]); head = head[:-2]
    if head: parts.insert(0, head)
    return ",".join(parts) + "," + tail


# ---------------------------------------------------------------- 1. loader
html = re.sub(r'<div id="loader" aria-hidden="true">.*?\n</div>\n', '', html, count=1, flags=re.S)

# ---------------------------------------------------------- 2. hero: no webgl
html = html.replace('  <canvas id="hero-canvas" aria-hidden="true"></canvas>\n', '  <div class="hero__aura" aria-hidden="true"></div>\n')
html = html.replace('<script src="assets/js/hero3d.js" defer></script>\n', '')

# --------------------------------------------- 3. hero trust: no fake numbers
old_trust = re.search(r'      <div class="hero__trust" data-reveal style="--d:\.3s">.*?\n      </div>\n', html, re.S)
new_trust = '''      <div class="hero__trust" data-reveal style="--d:.3s">
        <span class="hero__trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/></svg>
          Free fitting &amp; alteration
        </span>
        <span class="hero__trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v10h14V10"/></svg>
          Sudama Nagar · Nawada
        </span>
        <span class="hero__trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Open daily · 10 AM – 9 PM
        </span>
      </div>
'''
html = html[:old_trust.start()] + new_trust + html[old_trust.end():]

# ------------------------------------------------- 4. product grid rebuild
cards = []
for i in ordered:
    p = ALL[i]
    cards.append(f'''      <article class="pcard" data-cat="{p['cat']}" data-id="{p['id']}" data-price="{p['price']}" data-name="{p['name']}">
        <div class="pcard__media">
          <span class="pcard__badge">{p.get('badge') or CAT[p['cat']]}</span>
          <button class="pcard__wish" type="button" data-wish="{p['id']}" aria-label="Save {p['name']} to wishlist" aria-pressed="false">{HEART}</button>
          <img src="{p['imgs'][0]}" alt="{p['name']} — {p['short']}" width="640" height="1147" loading="lazy" decoding="async">
          <span class="pcard__hint">Tap for details</span>
        </div>
        <div class="pcard__body">
          <p class="pcard__brand">Men&#39;s Wear <span>· Nawada</span></p>
          <h3 class="pcard__title">{p['name']}</h3>
          <div class="pcard__price"><span class="price">₹{inr(p['price'])}</span></div>
          <p class="pcard__meta">{CAT[p['cat']]} · Free alteration</p>
          <div class="pcard__cta">
            <button class="btn btn--gold btn--xs" type="button" data-open="{p['id']}">View details</button>
            <a class="pcard__wa" href="{WA}" data-wa="Namaste Men's Wear! Mujhe {p['name']} chahiye — price aur size bata dijiye." target="_blank" rel="noopener" aria-label="Order {p['name']} on WhatsApp">{WA_ICON}</a>
          </div>
        </div>
      </article>''')

grid_start = html.index('<div class="grid-products" id="productGrid" data-shop>') + len('<div class="grid-products" id="productGrid" data-shop>')
grid_end = html.index('<p class="shop__empty"', grid_start)
html = html[:grid_start] + "\n\n" + "\n".join(cards) + "\n\n    " + html[grid_end:]

counts = {c: sum(1 for i in ordered if ALL[i]['cat'] == c) for c in CAT}
html = re.sub(r'<button type="button" class="filter is-active" data-filter="all" role="tab" aria-selected="true">All <span>\d+</span>',
              '<button type="button" class="filter is-active" data-filter="all" role="tab" aria-selected="true">All <span>%d</span>' % len(ordered), html)
for cat, n in counts.items():
    html = re.sub(r'(data-filter="%s" role="tab" aria-selected="false">%s <span>)\d+(</span>)' % (cat, CAT[cat]),
                  lambda m: m.group(1) + str(n) + m.group(2), html)
html = html.replace('<span id="shopCount">8 pieces</span>', '<span id="shopCount">%d pieces</span>' % len(ordered))
html = html.replace('Har piece ka photo, price, fabric, size aur delivery — sab kuch ek tap mein. Pasand aaye to seedha WhatsApp.',
                    'Har piece ka photo, price, fabric, size aur delivery — sab kuch ek tap mein. Groom se casual tak, %d pieces.' % len(ordered))

# ------------------------------------------------------ 5. groom package
CR = ' onclick="return false"'
package = f'''
<!-- ================= GROOM PACKAGE ================= -->
<section class="section groom" id="groom">
  <div class="wrap">
    <div class="groom__grid">
      <div class="groom__copy" data-reveal>
        <p class="eyebrow">Shaadi special</p>
        <h2 class="h2">Groom ka poora look,<br><em>ek package mein.</em></h2>
        <p class="lead">Sherwani, safa, kalgi, mojari aur brooch — sab ek saath trial hota hai, taaki colour aur fitting match karein. Alag-alag dukaan bhaagne ki zaroorat nahi.</p>
        <ul class="groom__list">
          <li><span>01</span><div><b>Sherwani ya Indo-Western</b><small>Aapka choice — dono package mein</small></div></li>
          <li><span>02</span><div><b>Safa + Kalgi</b><small>Pre-tied, 2 minute mein ready</small></div></li>
          <li><span>03</span><div><b>Mojari + Brooch</b><small>Colour-matched, trial ke saath</small></div></li>
          <li><span>04</span><div><b>Free alteration</b><small>Shaadi se pehle fitting lock</small></div></li>
        </ul>
        <div class="groom__actions">
          <a class="btn btn--wa" href="{WA}" data-wa="Namaste Men's Wear! Groom package chahiye (sherwani + safa + kalgi + mojari + brooch). Rate aur trial ka time bata dijiye." target="_blank" rel="noopener">{WA_ICON} Package rate poochhein</a>
          <a class="btn btn--ghost" href="#collection">Pieces alag dekhna hai</a>
        </div>
        <p class="groom__note">Package ka rate aapke sherwani ke design par depend karta hai — WhatsApp par photo bhej dijiye, turant rate bata denge.</p>
      </div>
      <div class="groom__visual" data-reveal="right">
        <div class="groom__stack">
          <img src="assets/img/v2/ivory-sherwani.jpg" alt="Groom sherwani in the Men's Wear groom package" width="640" height="1147" loading="lazy">
          <img src="assets/img/v2/safa.jpg" alt="Groom safa with kalgi" width="640" height="1147" loading="lazy">
          <img src="assets/img/v2/mojari.jpg" alt="Zari velvet mojari" width="640" height="1147" loading="lazy">
        </div>
        <div class="groom__tag">Sherwani · Safa · Kalgi · Mojari · Brooch</div>
      </div>
    </div>
  </div>
</section>
'''

# ------------------------------------------------------------- 6. offers
offers = f'''
<!-- ================= OFFERS / FAQ-ADJACENT ================= -->
<section class="section offers-sec" id="offers">
  <div class="wrap">
    <div class="section-head section-head--center">
      <p class="eyebrow eyebrow--center" data-reveal>Right now</p>
      <h2 class="h2" data-reveal style="--d:.06s">Jo milta hai, <em>sach mein milta hai.</em></h2>
      <p class="lead" data-reveal style="--d:.1s">Koi fake MRP nahi, koi "70% off" ka natak nahi. Jo offer hai, wahi site par likha hai.</p>
    </div>
    <div class="offergrid">
      <article class="offercard" data-reveal>
        <p class="offercard__tag">Shaadi season</p>
        <h3>Groom package</h3>
        <p>Sherwani + safa + kalgi + mojari + brooch ek saath lijiye — package rate alag se tay hota hai, aur alteration free.</p>
        <a class="offercard__link" href="#groom">Package dekhein →</a>
      </article>
      <article class="offercard" data-reveal style="--d:.06s">
        <p class="offercard__tag">Har piece par</p>
        <h3>Free alteration</h3>
        <p>Kapda lene ke baad fitting hamari zimmedari. Shoulder, length, waist — jo chahiye karwa lijiye, extra paisa nahi.</p>
        <a class="offercard__link" href="{WA}" data-wa="Namaste Men's Wear! Alteration ke baare mein jaankari chahiye." target="_blank" rel="noopener">WhatsApp par poochhein →</a>
      </article>
      <article class="offercard" data-reveal style="--d:.12s">
        <p class="offercard__tag">Sasta nahi, sahi</p>
        <h3>2 shirt par bachat</h3>
        <p>Do ya usse zyada shirt ek saath lijiye — bundle rate counter par milta hai. Rate dukaan par confirm karein.</p>
        <a class="offercard__link" href="{WA}" data-wa="Namaste Men's Wear! 2 shirt par kya rate milega? Bata dijiye." target="_blank" rel="noopener">Rate poochhein →</a>
      </article>
    </div>
  </div>
</section>
'''

# ---------------------------------------------------------------- 7. FAQ
faqs = [
 ("Alteration kitne din mein hoti hai?",
  "Normal alteration 2–4 din leti hai. Shaadi ya function ki date paas ho to pehle bata dijiye — hum jaldi karne ki koshish karte hain. Exact time kapde aur kaam dekh kar batate hain."),
 ("Advance kitna dena hota hai?",
  "Order confirm karne ke liye token advance liya jaata hai, baaki payment delivery ya pickup ke time. Amount piece ke hisaab se badalta hai — WhatsApp par exact bata denge."),
 ("Exchange ya return kaise hota hai?",
  "Size issue ho to bill ke saath store par laaiye, hum exchange karne ki koshish karte hain. Kapda use ho chuka hai ya alteration ho chuki hai to exchange nahi hota — isliye trial ke baad hi final karein."),
 ("Kahan tak delivery hoti hai?",
  "Nawada aur aas-paas ke ilaake mein free delivery. Bahar ke liye courier hota hai, uska charge order ke saath batate hain."),
 ("Size ka pata nahi — kaise choose karun?",
  "Product page par size chart hai. Phir bhi doubt ho to WhatsApp par apna chest/waist ya purani shirt ki naap bhej dijiye — hum size bata denge."),
 ("Kiraye par kapde milte hain?",
  "Rent ki availability design aur date par depend karti hai. WhatsApp par date aur design bhejiye, hum batayenge ki rent possible hai ya nahi."),
 ("Dukaan par trial ke liye kab aayein?",
  "Roz 10 AM se 9 PM. Shaadi ke season mein shaam 4–8 bheed rehti hai — aaram se dekhna ho to dopahar 12–3 ka time best hai."),
]
faq_html = "\n".join(
  f'''        <div class="faq__item">
          <button class="faq__q" type="button" aria-expanded="false">
            <span>{q}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <div class="faq__a"><p>{a}</p></div>
        </div>''' for q, a in faqs)

faq = f'''
<!-- ================= FAQ ================= -->
<section class="section faq" id="faq">
  <div class="wrap">
    <div class="faq__grid">
      <div class="faq__intro" data-reveal>
        <p class="eyebrow">Sawaal jawab</p>
        <h2 class="h2">Jo sabse zyada<br><em>poocha jaata hai.</em></h2>
        <p class="lead">Yahan jawab nahi mila? WhatsApp par message kar dijiye — dukaan se seedha jawab aayega.</p>
        <a class="btn btn--ghost" href="{WA}" data-wa="Namaste Men's Wear! Mera ek sawaal hai." target="_blank" rel="noopener">{WA_ICON} Sawaal poochhein</a>
      </div>
      <div class="faq__list" data-reveal="right">
{faq_html}
      </div>
    </div>
  </div>
</section>
'''

# ------------------------------------------ 8. honest reviews + no fake stats
rev_start = html.index('<section class="section reviews" id="reviews">')
rev_end = html.index('</section>', rev_start) + len('</section>')
honest = f'''
<!-- ================= REVIEWS (honest) ================= -->
<section class="section reviews" id="reviews">
  <div class="wrap">
    <div class="section-head section-head--center">
      <p class="eyebrow eyebrow--center" data-reveal>Reviews</p>
      <h2 class="h2" data-reveal style="--d:.06s">Asli review, <em>asli customer.</em></h2>
      <p class="lead" data-reveal style="--d:.12s">Hum site par banaye hue stars nahi lagate. Jo customer Google par likhte hain, wahi dikhta hai — aur aap bhi apna anubhav likh sakte hain.</p>
    </div>
    <div class="proofgrid">
      <article class="proofcard" data-reveal>
        <p class="proofcard__tag">Google</p>
        <h3>Google par reviews</h3>
        <p>Dukaan ka Google profile kholiye — timing, location, photos aur customers ke likhe review wahan milenge.</p>
        <a class="btn btn--gold" href="https://www.google.com/maps/search/?api=1&amp;query=Men%27s+Wear+Sudama+Nagar+Nawada+Bihar+805110" target="_blank" rel="noopener">Google par kholein</a>
      </article>
      <article class="proofcard" data-reveal style="--d:.06s">
        <p class="proofcard__tag">Aapka anubhav</p>
        <h3>Review likhna hai?</h3>
        <p>Kapda pasand aaya ho ya koi dikkat aayi ho — seedha WhatsApp par bhejiye. Hum jawab dete hain, chhupate nahi.</p>
        <a class="btn btn--ghost" href="{WA}" data-wa="Namaste Men's Wear! Apna anubhav share karna hai." target="_blank" rel="noopener">Feedback bhejein</a>
      </article>
      <article class="proofcard" data-reveal style="--d:.12s">
        <p class="proofcard__tag">Store</p>
        <h3>Aake khud dekhiye</h3>
        <p>Photo aur asli kapde mein farq hota hai. Trial ke liye aa jaiye — pasand na aaye to lena zaroori nahi.</p>
        <a class="btn btn--ghost" href="#store">Store details</a>
      </article>
    </div>
  </div>
</section>
'''
html = html[:rev_start] + honest + html[rev_end:]

stats_start = html.index('<section class="stats"')
stats_end = html.index('</section>', stats_start) + len('</section>')
strip = '''
<!-- ================= FACTS STRIP ================= -->
<section class="stats stats--facts" aria-label="Why buy from us">
  <div class="wrap">
    <div class="stats__grid">
      <div class="stat"><p class="stat__num">Free</p><p class="stat__label">Alteration on every piece</p></div>
      <div class="stat"><p class="stat__num">Trial</p><p class="stat__label">Pehen ke dekho, phir decide karo</p></div>
      <div class="stat"><p class="stat__num">UPI</p><p class="stat__label">Card aur cash bhi chalta hai</p></div>
      <div class="stat"><p class="stat__num">Wardrobe</p><p class="stat__label">Groom se daily wear tak</p></div>
    </div>
  </div>
</section>
'''
html = html[:stats_start] + strip + html[stats_end:]

# ------------------------------- 9. insert new sections in reading order
html = html.replace('<section class="section craft" id="craft">', package.strip() + "\n\n<section class=\"section craft\" id=\"craft\">", 1)
html = html.replace('<section class="section store" id="store">',
                    offers.strip() + "\n\n" + faq.strip() + "\n\n<section class=\"section store\" id=\"store\">", 1)

# ---------------------------------------------------- 10. nav + map + links
html = html.replace('<a href="#reviews">Reviews</a>', '<a href="#groom">Groom</a>\n      <a href="#faq">FAQ</a>')
html = html.replace('src="https://www.google.com/maps?q=Sudama%20Nagar%2C%20Nawada%2C%20Bihar%20805110&output=embed"',
                    'src="https://maps.google.com/maps?q=Sudama%20Nagar%2C%20Nawada%2C%20Bihar%20805110&z=16&output=embed"')
html = html.replace('''                <p class="store__row-label">Delivery</p>''',
'''                <p class="store__row-label">Landmark</p>
                <p class="store__row-value">Sudama Nagar main road, Nawada</p>
              </div>
              <div class="store__row">
                <p class="store__row-label">Delivery</p>''')

# --------------------------------------------- 11. JSON-LD: rebuild item list
BASE = "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@live-v9/mens-wear/"
items = [{
  "@type": "ListItem", "position": n + 1,
  "item": {"@type": "Product", "name": ALL[i]["name"], "image": BASE + ALL[i]["imgs"][0],
           "description": ALL[i]["short"], "category": CAT[ALL[i]["cat"]],
           "url": "https://nawada-menswear-shop.vercel.app/#p=" + i,
           "brand": {"@type": "Brand", "name": "Men's Wear"},
           "offers": {"@type": "Offer", "price": ALL[i]["price"], "priceCurrency": "INR",
                      "availability": "https://schema.org/InStock",
                      "url": "https://nawada-menswear-shop.vercel.app/#p=" + i}}}
  for n, i in enumerate(ordered)]
block = '<script type="application/ld+json">\n' + json.dumps(
    {"@context": "https://schema.org", "@type": "ItemList", "name": "Men's Wear collection",
     "itemListElement": items}, ensure_ascii=False, indent=1) + '\n</script>\n'
html = re.sub(r'<script type="application/ld\+json">\s*\{\s*"@context": "https://schema\.org",\s*"@type": "ItemList".*?</script>\n',
              block, html, count=1, flags=re.S)

open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(html)

# --------------------------------------------------------------- 12. shop.js
js = open('/tmp/shop-app.js', encoding='utf-8').read()
js = js.replace('    showMrp: true,          // false -> discount line poori tarah hide ho jaati hai',
                '    showMrp: false,         // asli MRP mile to true kar dein, warna discount line hide rehti hai')
js = js.replace("    alteration: \"Free alteration, 24 ghante mein\"",
                "    alteration: \"Free alteration\",\n    landline: \"\",")

# drop the rating line + fake review block from the sheet
js = re.sub(r"'<div class=\"sheet__rate\"><span class=\"rating\">' \+ stars\(p\) \+ '</span>' \+\n\s*'<span class=\"sheet__count\">' \+ p\.ratings\.toLocaleString\(\"en-IN\"\) \+ ' ratings</span>' \+\n\s*'<span class=\"sheet__verified\">✓ Store se seedha</span>' \+\n\s*'<button type=\"button\" class=\"sheet__share\" data-share>Share</button></div>' \+",
            "'<div class=\"sheet__rate\">' +\n        '<span class=\"sheet__verified\">✓ Store se seedha · free alteration</span>' +\n        '<button type=\"button\" class=\"sheet__share\" data-share>Share</button></div>' +", js)

start = js.index("      '<div class=\"sheet__block\"><p class=\"sheet__label\">Ratings &amp; reviews</p>' +")
end = js.index("      '<p class=\"sheet__foot\">", start)
js = js[:start] + js[end:]

js = js.replace("  function stars(p) { return p.rating + \" ★\"; }\n", "")
open(os.path.join(ROOT, "assets/js/shop.js"), "w", encoding="utf-8").write(
    js.replace('__DATA__', json.dumps({i: ALL[i] for i in ordered}, ensure_ascii=False, indent=2)))

print("products:", len(ordered), "| cards:", len(cards), "| html:", len(html), "| js:", len(js))
print("counts:", counts)
