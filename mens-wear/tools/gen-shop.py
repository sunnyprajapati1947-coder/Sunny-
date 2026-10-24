# -*- coding: utf-8 -*-
"""Builds the marketplace-style collection markup + shop.js data from one list."""
import json, io, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA = "https://wa.me/919608087035"

P = [
 dict(id="sherwani", cat="wedding", name="Black Zardozi Sherwani", badge="Bestseller",
      price=5999, mrp=9999, rating="4.8", ratings=412,
      imgs=["assets/img/v2/sherwani.jpg","assets/img/product-sherwani.jpg"],
      cols=[("Jet Black","#111114"),("Royal Maroon","#4d1226")],
      sold="XXL",
      short="Hand-embroidered zardozi & zari work on a rich silk blend.",
      fabric="Silk blend · hand zari + zardozi", fit="Slim · free alteration",
      occasion="Wedding · Reception · Sangeet", care="Dry clean only",
      box="Sherwani, churidar, brooch pin",
      desc="Bhai ki shaadi ho ya apni — yeh sherwani pehnte hi sabki nazar aap par rukti hai. Ghaas-patthar zari ka kaam haath se kiya gaya hai, aur kanjoos nahi hain hum: aage-peeche dono taraf embroidery hai. Andar soft lining, isliye 6 ghante ki shaadi mein bhi aaram.",
      review=("Aman Raj","Nawada","L","Bhai ki shaadi ke liye liya. Fitting ekdum perfect, zari ka kaam photo se bhi zyada accha lag raha hai. Sabne poocha kahan se liya.")),
 dict(id="suit", cat="formal", name="Midnight Navy 3-Piece Suit", badge="Signature",
      price=4499, mrp=7999, rating="4.7", ratings=356,
      imgs=["assets/img/v2/suit.jpg","assets/img/product-suit.jpg"],
      cols=[("Midnight Navy","#1b2742"),("Charcoal Grey","#3a3d42")],
      sold="S",
      short="Italian wool blend with a sharp, tailored silhouette.",
      fabric="Italian wool blend · 280 GSM", fit="Slim · free alteration",
      occasion="Interview · Wedding · Office", care="Dry clean recommended",
      box="Jacket, waistcoat, trouser",
      desc="Interview ho ya reception — is navy 3-piece mein aap har jagah 'serious banda' lagte hain. Waistcoat alag pehen sakte hain, isliye ek suit se teen look. Shoulder aur chest par structure hai jo shape 12 ghante tak hold karta hai.",
      review=("Rohit Kumar","Bihar Sharif","M","Fabric genuinely premium hai, price market se better. Alteration same day mil gaya — ab family ke liye bhi yahin se lete hain.")),
 dict(id="linen", cat="casual", name="Ivory Linen Shirt", badge="New drop",
      price=1299, mrp=2499, rating="4.6", ratings=1024,
      imgs=["assets/img/v2/linen-shirt.jpg","assets/img/product-linen-shirt.jpg"],
      cols=[("Ivory","#efe7d8"),("Sand Beige","#d8c4a4"),("Sky Blue","#b9d3e6")],
      sold="XXL",
      short="Breathable pure-feel linen, perfect for Bihar summers.",
      fabric="60-Lea linen blend · breathable", fit="Relaxed · true to size",
      occasion="Casual · College · Date", care="Machine wash cold",
      box="1 shirt",
      desc="Garmi mein cotton bhi bhaari lagta hai — isliye linen. Hawa pass hoti hai, pasina sukhta hai, aur collar subah se shaam tak shape mein rehta hai. Rolled sleeves ke saath ekdum 'effortless' look.",
      review=("Aditya Singh","Nawada","M","Linen itna soft hai ki pata hi nahi chalta pehna hai. 3 colours le liye ek saath.")),
 dict(id="kurta", cat="ethnic", name="Emerald Silk Kurta", badge="Festive",
      price=1499, mrp=2999, rating="4.7", ratings=688,
      imgs=["assets/img/v2/kurta.jpg","assets/img/product-kurta.jpg"],
      cols=[("Emerald","#0f5132"),("Off White","#efe9dc"),("Wine","#5a1730")],
      sold="S",
      short="Mandarin collar with subtle tonal thread work.",
      fabric="Art silk · tonal thread work", fit="Straight · free alteration",
      occasion="Puja · Eid · Family function", care="Gentle hand wash",
      box="1 kurta (churidar optional)",
      desc="Simple kurta nahi — collar ke paas tone-on-tone thread work hai jo door se plain lagta hai aur paas jaake premium. Churidar ke saath traditional, jeans ke saath Gen-Z street style.",
      review=("Sana Parveen","Nawada","L","Papa ke liye liya. Quality dekh ke hairan rah gayi, packing bhi bahut achhi thi.")),
 dict(id="denim", cat="casual", name="Indigo Denim Jacket", badge="Trending",
      price=1899, mrp=3499, rating="4.5", ratings=512,
      imgs=["assets/img/v2/denim.jpg","assets/img/product-denim.jpg"],
      cols=[("Indigo","#2b3a53"),("Washed Black","#24252a")],
      sold="XL",
      short="Heavy-weight stretch denim with a clean finish.",
      fabric="12 oz cotton denim · 2% stretch", fit="Regular · layer-friendly",
      occasion="Street · Casual · Travel", care="Machine wash cold",
      box="1 jacket",
      desc="Yeh jacket har outfit ko 'styled' bana deta hai. 12 oz denim hai isliye shape rehti hai, par 2% stretch ki wajah se baith ke bhi comfortable. Sardiyaan aur monsoon dono mein kaam ka.",
      review=("Vikash Yadav","Nalanda","L","Denim heavy hai but comfortable. Colour exactly photo jaisa aaya.")),
 dict(id="overcoat", cat="formal", name="Camel Wool Overcoat", badge="Limited",
      price=3499, mrp=6499, rating="4.8", ratings=207,
      imgs=["assets/img/v2/overcoat.jpg","assets/img/product-overcoat.jpg"],
      cols=[("Camel","#b98b57"),("Charcoal","#3b3d42")],
      sold="S",
      short="Soft wool blend with a structured, elegant drape.",
      fabric="Wool blend · brushed finish", fit="Tailored · mid-length",
      occasion="Winter wedding · Travel · Formal", care="Dry clean only",
      box="1 overcoat",
      desc="Shaadi December mein ho to yeh overcoat sherwani ke upar bhi pehen sakte hain. Camel colour photos mein royal lagta hai, aur andar ki lining garmi ko rok ke rakhti hai.",
      review=("Nitesh Prasad","Rajgir","M","Winter wedding ke liye perfect. Kapda heavy aur premium feel deta hai.")),
 dict(id="bandhgala", cat="wedding", name="Wine Velvet Bandhgala", badge="Groom edit",
      price=3999, mrp=7499, rating="4.9", ratings=164,
      imgs=["assets/img/v2/bandhgala.jpg"],
      cols=[("Wine Velvet","#5a1730"),("Royal Blue","#1e2f57")],
      sold="XXL",
      short="Velvet bandhgala with brass buttons and mandarin collar.",
      fabric="Micro velvet · brass buttons", fit="Slim · free alteration",
      occasion="Engagement · Reception · Cocktail", care="Dry clean only",
      box="Bandhgala, inner shirt",
      desc="Sherwani se hatt kar kuch chahiye? Velvet bandhgala — light, sharp aur photo mein ekdum film-star. Brass buttons real metal finish ke hain, isliye flash mein shine karte hain.",
      review=("Shivam Gupta","Nawada","M","Engagement ke liye pehna. Sabne bola designer se banwaya hai kya. Value for money.")),
 dict(id="chinos", cat="casual", name="Charcoal Slim Chinos", badge="Everyday",
      price=999, mrp=1999, rating="4.4", ratings=2180,
      imgs=["assets/img/v2/chinos.jpg"],
      cols=[("Charcoal","#3a3d42"),("Khaki","#a98e6b"),("Navy","#1e2b45")],
      sold="XXL",
      short="Four-way stretch cotton twill that keeps its crease.",
      fabric="Cotton twill · 4-way stretch", fit="Slim · mid-rise",
      occasion="Daily · Office · Travel", care="Machine wash",
      box="1 pair chinos",
      desc="Roz pehne jaane wali pant. 4-way stretch hai, isliye baithne-uthne mein aaram; aur wash ke baad bhi crease aa jaati hai. Office ho ya casual outing, ek hi pant kaafi.",
      review=("Suraj Kumar","Hisua","32","Price ke hisaab se best. 3 mahine se roz pehen raha hoon, colour nahi fika.")),
]

WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.05-.52-.1-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.34M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26 9.89 9.89 0 0 1 16.88-6.99 9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41Z"/></svg>'
HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/></svg>'

def inr(n):
    s = str(n)
    if len(s) <= 3: return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:]); head = head[:-2]
    if head: parts.insert(0, head)
    return ",".join(parts) + "," + tail

CAT_LABEL = {"wedding":"Wedding","formal":"Formal","casual":"Casual","ethnic":"Ethnic"}

cards = []
for p in P:
    off = round((p["mrp"] - p["price"]) * 100.0 / p["mrp"])
    msg = ("Namaste Men's Wear! Mujhe *%s* chahiye — price ₹%s" % (p["name"], inr(p["price"])))
    cards.append(f'''      <article class="pcard" data-cat="{p['cat']}" data-id="{p['id']}" data-price="{p['price']}" data-rating="{p['rating']}" data-name="{p['name']}">
        <div class="pcard__media">
          <span class="pcard__badge">{p['badge']}</span>
          <button class="pcard__wish" type="button" data-wish="{p['id']}" aria-label="Save {p['name']} to wishlist" aria-pressed="false">{HEART}</button>
          <img src="{p['imgs'][0]}" alt="{p['name']} — {p['short']}" width="768" height="1376" loading="lazy" decoding="async">
          <span class="pcard__hint">Tap for full details</span>
        </div>
        <div class="pcard__body">
          <p class="pcard__brand">Men&#39;s Wear <span>· Nawada</span></p>
          <h3 class="pcard__title">{p['name']}</h3>
          <div class="pcard__rate">
            <span class="rating">{p['rating']} ★</span>
            <span class="pcard__count">({inr(p['ratings'])})</span>
          </div>
          <div class="pcard__price">
            <span class="price">₹{inr(p['price'])}</span>
            <span class="mrp">₹{inr(p['mrp'])}</span>
            <span class="off">{off}% off</span>
          </div>
          <p class="pcard__meta">Free alteration · Free delivery in Nawada</p>
          <div class="pcard__cta">
            <button class="btn btn--gold btn--xs" type="button" data-open="{p['id']}">View details</button>
            <a class="pcard__wa" href="{WA}" data-wa="{msg}" target="_blank" rel="noopener" aria-label="Order {p['name']} on WhatsApp">{WA_ICON}</a>
          </div>
        </div>
      </article>''')

counts = {}
for p in P: counts[p["cat"]] = counts.get(p["cat"], 0) + 1

section = f'''<section class="section shop" id="collection">
  <div class="shop__glow" aria-hidden="true"></div>
  <div class="wrap">
    <div class="shop__head">
      <div class="section-head shop__intro">
        <p class="eyebrow" data-reveal>The Collection · 2026</p>
        <h2 class="h2" data-reveal style="--d:.06s">Tap karo, <em>poora detail</em> dekho.</h2>
        <p class="shop__sub" data-reveal style="--d:.1s">Har piece ka photo, price, fabric, size aur delivery — sab kuch ek tap mein. Pasand aaye to seedha WhatsApp.</p>
      </div>
      <div class="shop__tools" data-reveal style="--d:.12s">
        <label class="shop__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
          <input type="search" id="shopSearch" placeholder="Search kurta, suit, sherwani…" aria-label="Search the collection" autocomplete="off">
        </label>
        <label class="shop__sort">
          <span>Sort</span>
          <select id="shopSort" aria-label="Sort collection">
            <option value="popular">Popular</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
            <option value="rating">Top rated</option>
          </select>
        </label>
      </div>
    </div>

    <div class="shop__bar" data-reveal>
      <div class="filters" role="tablist" aria-label="Filter collection">
        <button type="button" class="filter is-active" data-filter="all" role="tab" aria-selected="true">All <span>{len(P)}</span></button>
        <button type="button" class="filter" data-filter="wedding" role="tab" aria-selected="false">Wedding <span>{counts.get('wedding',0)}</span></button>
        <button type="button" class="filter" data-filter="formal" role="tab" aria-selected="false">Formal <span>{counts.get('formal',0)}</span></button>
        <button type="button" class="filter" data-filter="casual" role="tab" aria-selected="false">Casual <span>{counts.get('casual',0)}</span></button>
        <button type="button" class="filter" data-filter="ethnic" role="tab" aria-selected="false">Ethnic <span>{counts.get('ethnic',0)}</span></button>
      </div>
      <p class="shop__hint"><span class="dot" aria-hidden="true"></span> Free alteration · 7-day exchange · UPI / Card / Cash</p>
    </div>

    <div class="grid-products" id="productGrid" data-shop>

{chr(10).join(cards)}

    </div>
    <p class="shop__empty" id="shopEmpty" hidden>Kuch nahi mila — doosra naam try kijiye ya WhatsApp par poochh lein.</p>

    <div class="shop__more" data-reveal>
      <p>200+ designs store par available hain — photos WhatsApp par mangwa lein.</p>
      <a class="btn btn--ghost" href="{WA}" data-wa="Namaste Men's Wear! Aapke store par kaun kaun se naye designs available hain? Photos bhej dijiye." target="_blank" rel="noopener">Catalogue maangein {WA_ICON}</a>
    </div>
  </div>
</section>'''

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
start = html.index('<section class="section collection" id="collection">')
end = html.index('</section>', html.index('<div class="shop__more', start) if '<div class="shop__more' in html[start:start+60000] else start) + len('</section>')
# find the section end reliably: the closing tag right before the craft section
craft = html.index('<section class="section craft" id="craft">')
end = html.rindex('</section>', start, craft) + len('</section>')
html = html[:start] + section + html[end:]

# hook up shop.js + sheet container once
if 'assets/js/shop.js' not in html:
    html = html.replace('</body>', '''<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Product details" hidden>
  <div class="sheet__scrim" data-close></div>
  <div class="sheet__panel">
    <button class="sheet__close" type="button" data-close aria-label="Close details">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <div class="sheet__grid">
      <div class="sheet__media">
        <div class="sheet__stage"><img id="sheetImg" src="" alt="" width="768" height="1376"></div>
        <div class="sheet__thumbs" id="sheetThumbs"></div>
      </div>
      <div class="sheet__info" id="sheetInfo"></div>
    </div>
    <div class="sheet__bar">
      <div class="sheet__barprice"><strong id="sheetBarPrice">₹—</strong><s id="sheetBarMrp"></s><span id="sheetBarOff" class="off"></span></div>
      <a class="btn btn--wa" id="sheetWa" href="#" target="_blank" rel="noopener">Order on WhatsApp</a>
      <a class="btn btn--ghost sheet__call" href="tel:+919608087035">Call</a>
    </div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="assets/js/shop.js" defer></script>
</body>''')

open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(html)

# ---- shop.js -------------------------------------------------------------
data = {}
for p in P:
    data[p["id"]] = {
        "id": p["id"], "name": p["name"], "cat": CAT_LABEL[p["cat"]],
        "price": p["price"], "mrp": p["mrp"],
        "rating": p["rating"], "ratings": p["ratings"],
        "imgs": p["imgs"],
        "cols": [{"name": c[0], "hex": c[1]} for c in p["cols"]],
        "sizes": ["S", "M", "L", "XL", "XXL"],
        "sold": p["sold"],
        "short": p["short"], "desc": p["desc"],
        "fabric": p["fabric"], "fit": p["fit"], "occasion": p["occasion"],
        "care": p["care"], "box": p["box"],
        "review": {"name": p["review"][0], "city": p["review"][1], "size": p["review"][2], "text": p["review"][3]},
    }

js = r'''/* ==========================================================================
   MEN'S WEAR — marketplace layer
   Tap a garment -> full product sheet (price, MRP, discount, sizes, colours,
   delivery, specs, reviews). Every CTA lands in the shop's own WhatsApp.
   ========================================================================== */
(function () {
  "use strict";

  var WA_NUMBER = "919608087035";
  var PRODUCTS = ''' + json.dumps(data, ensure_ascii=False, indent=2) + r''';

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function rupee(n) { return "₹" + n.toLocaleString("en-IN"); }
  function off(p) { return Math.round((p.mrp - p.price) * 100 / p.mrp); }

  var saved = [];
  try { saved = JSON.parse(localStorage.getItem("mw-saved") || "[]"); } catch (e) { saved = []; }

  /* ---------------------------------------------------------------- toast */
  var toastEl = $("#toast"), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }

  /* ------------------------------------------------------------- wishlist */
  function paintWish(btn) {
    var on = saved.indexOf(btn.getAttribute("data-wish")) > -1;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  $$("[data-wish]").forEach(function (btn) {
    paintWish(btn);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var id = btn.getAttribute("data-wish");
      var i = saved.indexOf(id);
      if (i > -1) { saved.splice(i, 1); toast("Wishlist se hata diya"); }
      else { saved.push(id); toast("Wishlist mein save ho gaya ✓"); }
      try { localStorage.setItem("mw-saved", JSON.stringify(saved)); } catch (err) {}
      $$('[data-wish="' + id + '"]').forEach(paintWish);
    });
  });

  /* --------------------------------------------------------------- filters */
  var grid = $("#productGrid");
  var cards = grid ? $$(".pcard", grid) : [];
  var activeCat = "all", query = "", sortBy = "popular";

  function applyFilters(animate) {
    var shown = 0;
    cards.forEach(function (card) {
      var cat = card.getAttribute("data-cat");
      var name = (card.getAttribute("data-name") || "").toLowerCase();
      var ok = (activeCat === "all" || cat === activeCat) && (!query || name.indexOf(query) > -1);
      card.hidden = !ok;
      if (ok && animate && !reduceMotion) {
        card.style.animation = "none";
        void card.offsetWidth;
        card.style.animation = "cardIn .45s cubic-bezier(.16,1,.3,1) both";
      }
      if (ok) shown++;
    });
    var empty = $("#shopEmpty");
    if (empty) empty.hidden = shown > 0;
  }

  function applySort() {
    if (!cards.length) return;
    var sorted = cards.slice().sort(function (a, b) {
      if (sortBy === "low") return +a.dataset.price - +b.dataset.price;
      if (sortBy === "high") return +b.dataset.price - +a.dataset.price;
      if (sortBy === "rating") return +b.dataset.rating - +a.dataset.rating;
      return +b.dataset.rating * 1000 + +b.dataset.price / 100 - (+a.dataset.rating * 1000 + +a.dataset.price / 100);
    });
    sorted.forEach(function (c) { c.parentNode.appendChild(c); });
  }

  $$(".filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCat = btn.getAttribute("data-filter");
      $$(".filter").forEach(function (f) {
        f.classList.toggle("is-active", f === btn);
        f.setAttribute("aria-selected", f === btn ? "true" : "false");
      });
      applyFilters(true);
    });
  });

  var search = $("#shopSearch");
  if (search) {
    search.addEventListener("input", function () {
      query = search.value.trim().toLowerCase();
      applyFilters(true);
    });
  }
  var sel = $("#shopSort");
  if (sel) {
    sel.addEventListener("change", function () { sortBy = sel.value; applySort(); applyFilters(true); });
  }

  /* ----------------------------------------------------------------- sheet */
  var sheet = $("#sheet");
  var info = $("#sheetInfo");
  var stageImg = $("#sheetImg");
  var thumbs = $("#sheetThumbs");
  var barPrice = $("#sheetBarPrice");
  var barMrp = $("#sheetBarMrp");
  var barOff = $("#sheetBarOff");
  var waBtn = $("#sheetWa");
  var lastFocus = null;
  var state = { id: null, size: null, colour: null };

  function waMessage(p) {
    var bits = ["Namaste Men's Wear! Mujhe *" + p.name + "* chahiye."];
    if (state.colour) bits.push("Colour: " + state.colour + ".");
    bits.push("Size: " + (state.size || "confirm karna hai") + ".");
    bits.push("Price dikha raha hai " + rupee(p.price) + " (MRP " + rupee(p.mrp) + ").");
    bits.push("Availability, delivery aur fitting bata dijiye.");
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(bits.join(" "));
  }

  function syncWa() {
    var p = PRODUCTS[state.id];
    if (!p || !waBtn) return;
    waBtn.setAttribute("href", waMessage(p));
  }

  function render(p) {
    var disc = off(p);
    info.innerHTML =
      '<p class="sheet__crumb">' + p.cat + ' · Men&#39;s Wear, Sudama Nagar</p>' +
      '<h2 class="sheet__title" id="sheetTitle">' + p.name + '</h2>' +
      '<p class="sheet__short">' + p.short + '</p>' +
      '<div class="sheet__rate"><span class="rating">' + p.rating + ' ★</span>' +
        '<span class="sheet__count">' + p.ratings.toLocaleString("en-IN") + ' ratings</span>' +
        '<span class="sheet__verified">✓ Verified seller</span></div>' +
      '<div class="sheet__price"><span class="price">' + rupee(p.price) + '</span>' +
        '<s class="mrp">' + rupee(p.mrp) + '</s>' +
        '<span class="off">' + disc + '% off</span></div>' +
      '<p class="sheet__tax">Inclusive of all taxes · Free alteration included</p>' +

      '<div class="sheet__block"><p class="sheet__label">Select size <button type="button" class="sheet__chart" data-chart>Size chart</button></p>' +
        '<div class="sizes">' + p.sizes.map(function (s) {
          var soldOut = s === p.sold;
          return '<button type="button" class="size' + (soldOut ? ' is-sold' : '') + '" data-size="' + s + '"' +
                 (soldOut ? ' disabled aria-label="Size ' + s + ' sold out"' : '') + '>' + s + '</button>';
        }).join("") + '</div>' +
        '<div class="sheet__chartbox" hidden data-chartbox>' +
          '<table><thead><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Length</th></tr></thead><tbody>' +
          '<tr><td>S</td><td>38"</td><td>32"</td><td>40"</td></tr>' +
          '<tr><td>M</td><td>40"</td><td>34"</td><td>41"</td></tr>' +
          '<tr><td>L</td><td>42"</td><td>36"</td><td>42"</td></tr>' +
          '<tr><td>XL</td><td>44"</td><td>38"</td><td>43"</td></tr>' +
          '<tr><td>XXL</td><td>46"</td><td>40"</td><td>44"</td></tr>' +
          '</tbody></table><p>Confusion ho to WhatsApp par apna chest/waist bhej dijiye — hum perfect size bata denge.</p>' +
        '</div></div>' +

      '<div class="sheet__block"><p class="sheet__label">Colour <span class="sheet__picked" data-picked>' + p.cols[0].name + '</span></p>' +
        '<div class="swatches">' + p.cols.map(function (c, i) {
          return '<button type="button" class="swatch' + (i === 0 ? ' is-on' : '') + '" data-colour="' + c.name + '" style="--sw:' + c.hex + '" aria-label="Colour ' + c.name + '"><span></span></button>';
        }).join("") + '</div></div>' +

      '<div class="offers">' +
        '<p class="sheet__label">Offers for you</p>' +
        '<ul><li><b>5% instant off</b> on UPI payment</li>' +
        '<li><b>Free alteration</b> in 24 hours, in-store</li>' +
        '<li><b>7-day easy exchange</b> on size issues</li></ul>' +
      '</div>' +

      '<div class="sheet__delivery">' +
        '<div><span class="tick">✓</span><p><b>Free delivery</b> in Nawada<br><small>Tomorrow, before 6 PM</small></p></div>' +
        '<div><span class="tick">✓</span><p><b>Store pickup</b> ready in 2 hrs<br><small>Sudama Nagar, Nawada — 805110</small></p></div>' +
      '</div>' +

      '<div class="sheet__block"><p class="sheet__label">Highlights</p><ul class="bullets">' +
        '<li>' + p.fabric + '</li><li>' + p.fit + '</li><li>' + p.occasion + '</li><li>' + p.box + '</li></ul></div>' +

      '<div class="sheet__block"><p class="sheet__label">Product details</p>' +
        '<dl class="specs">' +
          '<div><dt>Fabric</dt><dd>' + p.fabric + '</dd></div>' +
          '<div><dt>Fit</dt><dd>' + p.fit + '</dd></div>' +
          '<div><dt>Occasion</dt><dd>' + p.occasion + '</dd></div>' +
          '<div><dt>Wash care</dt><dd>' + p.care + '</dd></div>' +
          '<div><dt>In the box</dt><dd>' + p.box + '</dd></div>' +
          '<div><dt>Sold by</dt><dd>Men&#39;s Wear, Sudama Nagar, Nawada</dd></div>' +
        '</dl></div>' +

      '<div class="sheet__block"><p class="sheet__label">About this piece</p><p class="sheet__desc">' + p.desc + '</p></div>' +

      '<div class="sheet__block"><p class="sheet__label">Ratings &amp; reviews</p>' +
        '<div class="ratingbox"><div class="ratingbox__score"><strong>' + p.rating + ' <em>★</em></strong><small>' + p.ratings.toLocaleString("en-IN") + ' ratings</small></div>' +
        '<div class="ratingbox__bars">' +
          '<div><span>5</span><i style="--w:78%"></i><small>78%</small></div>' +
          '<div><span>4</span><i style="--w:15%"></i><small>15%</small></div>' +
          '<div><span>3</span><i style="--w:4%"></i><small>4%</small></div>' +
          '<div><span>2</span><i style="--w:2%"></i><small>2%</small></div>' +
          '<div><span>1</span><i style="--w:1%"></i><small>1%</small></div>' +
        '</div></div>' +
        '<div class="reviewcard"><p class="reviewcard__stars">★★★★★</p><p class="reviewcard__text">“' + p.review.text + '”</p>' +
          '<p class="reviewcard__by">' + p.review.name + ' · ' + p.review.city + ' · Size ' + p.review.size + ' <span>✓ Verified purchase</span></p></div>' +
      '</div>' +

      '<p class="sheet__foot">Aap seedha dukaan se kharid rahe hain — koi middle-man nahi. Size ya fitting ki dikkat ho to free alteration hamari taraf se.</p>';

    // gallery
    thumbs.innerHTML = p.imgs.map(function (src, i) {
      return '<button type="button" class="sheet__thumb' + (i === 0 ? ' is-on' : '') + '" data-src="' + src + '"><img src="' + src + '" alt="" loading="lazy"></button>';
    }).join("");
    stageImg.src = p.imgs[0];
    stageImg.alt = p.name;

    // bar
    barPrice.textContent = rupee(p.price);
    barMrp.textContent = rupee(p.mrp);
    barOff.textContent = disc + "% off";
    syncWa();

    // size + colour wiring
    $$(".size", info).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".size", info).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        state.size = b.getAttribute("data-size");
        syncWa();
      });
    });
    $$(".swatch", info).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".swatch", info).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        state.colour = b.getAttribute("data-colour");
        var picked = $("[data-picked]", info);
        if (picked) picked.textContent = state.colour;
        syncWa();
      });
    });
    var chartBtn = $("[data-chart]", info);
    var chartBox = $("[data-chartbox]", info);
    if (chartBtn && chartBox) {
      chartBtn.addEventListener("click", function () { chartBox.hidden = !chartBox.hidden; });
    }
    $$(".sheet__thumb", thumbs).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".sheet__thumb", thumbs).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        stageImg.src = b.getAttribute("data-src");
      });
    });
  }

  function open(id) {
    var p = PRODUCTS[id];
    if (!p || !sheet) return;
    state = { id: id, size: null, colour: p.cols[0].name };
    lastFocus = document.activeElement;
    render(p);
    sheet.hidden = false;
    document.body.classList.add("is-locked", "is-sheet");
    requestAnimationFrame(function () { sheet.classList.add("is-open"); });
    var close = $(".sheet__close", sheet);
    if (close) close.focus({ preventScroll: true });
    sheet.querySelector(".sheet__panel").scrollTop = 0;
    var panelInfo = $(".sheet__info", sheet);
    if (panelInfo) panelInfo.scrollTop = 0;
  }

  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("is-open");
    document.body.classList.remove("is-sheet");
    if (!$("#drawer") || !$("#drawer").classList.contains("is-open")) {
      document.body.classList.remove("is-locked");
    }
    setTimeout(function () {
      sheet.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 260);
  }

  $$("[data-open]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); open(b.getAttribute("data-open")); });
  });
  cards.forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a, button[data-wish]")) return;
      open(card.getAttribute("data-id"));
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(card.getAttribute("data-id")); }
    });
  });
  $$("[data-close]", sheet || document).forEach(function (b) {
    b.addEventListener("click", close);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  applySort();
  applyFilters(false);
})();
'''
open(os.path.join(ROOT, "assets/js/shop.js"), "w", encoding="utf-8").write(js)
print("cards:", len(cards), "| section bytes:", len(section), "| shop.js bytes:", len(js))
