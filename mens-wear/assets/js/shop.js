/* ==========================================================================
   MEN'S WEAR — marketplace layer
   Tap a garment -> full product sheet (price, MRP, discount, sizes, colours,
   delivery, specs, reviews). Every CTA lands in the shop's own WhatsApp.
   ========================================================================== */
(function () {
  "use strict";

  var WA_NUMBER = "919608087035";

  /* Where the garment photos live. When this file is served from a CDN the
     photos sit next to it, so resolve the base from our own <script> URL.
     Served locally the paths stay relative. */
  var IMG_BASE = (function () {
    var tag = document.currentScript || document.querySelector('script[src*="shop.js"]');
    var src = tag && tag.src ? tag.src : "";
    var i = src.indexOf("assets/js/shop.js");
    return i > -1 ? src.slice(0, i + "assets/js/shop.js".length).replace(/assets\/js\/shop\.js$/, "") : "";
  })();

  function imgSrc(path) { return path.indexOf("http") === 0 ? path : IMG_BASE + path; }
  var PRODUCTS = {
  "sherwani": {
    "id": "sherwani",
    "name": "Black Zardozi Sherwani",
    "cat": "Wedding",
    "price": 5999,
    "mrp": 9999,
    "rating": "4.8",
    "ratings": 412,
    "imgs": [
      "assets/img/v2/sherwani.jpg",
      "assets/img/product-sherwani.jpg"
    ],
    "cols": [
      {
        "name": "Jet Black",
        "hex": "#111114"
      },
      {
        "name": "Royal Maroon",
        "hex": "#4d1226"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "XXL",
    "short": "Hand-embroidered zardozi & zari work on a rich silk blend.",
    "desc": "Bhai ki shaadi ho ya apni — yeh sherwani pehnte hi sabki nazar aap par rukti hai. Ghaas-patthar zari ka kaam haath se kiya gaya hai, aur kanjoos nahi hain hum: aage-peeche dono taraf embroidery hai. Andar soft lining, isliye 6 ghante ki shaadi mein bhi aaram.",
    "fabric": "Silk blend · hand zari + zardozi",
    "fit": "Slim · free alteration",
    "occasion": "Wedding · Reception · Sangeet",
    "care": "Dry clean only",
    "box": "Sherwani, churidar, brooch pin",
    "review": {
      "name": "Aman Raj",
      "city": "Nawada",
      "size": "L",
      "text": "Bhai ki shaadi ke liye liya. Fitting ekdum perfect, zari ka kaam photo se bhi zyada accha lag raha hai. Sabne poocha kahan se liya."
    }
  },
  "suit": {
    "id": "suit",
    "name": "Midnight Navy 3-Piece Suit",
    "cat": "Formal",
    "price": 4499,
    "mrp": 7999,
    "rating": "4.7",
    "ratings": 356,
    "imgs": [
      "assets/img/v2/suit.jpg",
      "assets/img/product-suit.jpg"
    ],
    "cols": [
      {
        "name": "Midnight Navy",
        "hex": "#1b2742"
      },
      {
        "name": "Charcoal Grey",
        "hex": "#3a3d42"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "S",
    "short": "Italian wool blend with a sharp, tailored silhouette.",
    "desc": "Interview ho ya reception — is navy 3-piece mein aap har jagah 'serious banda' lagte hain. Waistcoat alag pehen sakte hain, isliye ek suit se teen look. Shoulder aur chest par structure hai jo shape 12 ghante tak hold karta hai.",
    "fabric": "Italian wool blend · 280 GSM",
    "fit": "Slim · free alteration",
    "occasion": "Interview · Wedding · Office",
    "care": "Dry clean recommended",
    "box": "Jacket, waistcoat, trouser",
    "review": {
      "name": "Rohit Kumar",
      "city": "Bihar Sharif",
      "size": "M",
      "text": "Fabric genuinely premium hai, price market se better. Alteration same day mil gaya — ab family ke liye bhi yahin se lete hain."
    }
  },
  "linen": {
    "id": "linen",
    "name": "Ivory Linen Shirt",
    "cat": "Casual",
    "price": 1299,
    "mrp": 2499,
    "rating": "4.6",
    "ratings": 1024,
    "imgs": [
      "assets/img/v2/linen-shirt.jpg",
      "assets/img/product-linen-shirt.jpg"
    ],
    "cols": [
      {
        "name": "Ivory",
        "hex": "#efe7d8"
      },
      {
        "name": "Sand Beige",
        "hex": "#d8c4a4"
      },
      {
        "name": "Sky Blue",
        "hex": "#b9d3e6"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "XXL",
    "short": "Breathable pure-feel linen, perfect for Bihar summers.",
    "desc": "Garmi mein cotton bhi bhaari lagta hai — isliye linen. Hawa pass hoti hai, pasina sukhta hai, aur collar subah se shaam tak shape mein rehta hai. Rolled sleeves ke saath ekdum 'effortless' look.",
    "fabric": "60-Lea linen blend · breathable",
    "fit": "Relaxed · true to size",
    "occasion": "Casual · College · Date",
    "care": "Machine wash cold",
    "box": "1 shirt",
    "review": {
      "name": "Aditya Singh",
      "city": "Nawada",
      "size": "M",
      "text": "Linen itna soft hai ki pata hi nahi chalta pehna hai. 3 colours le liye ek saath."
    }
  },
  "kurta": {
    "id": "kurta",
    "name": "Emerald Silk Kurta",
    "cat": "Ethnic",
    "price": 1499,
    "mrp": 2999,
    "rating": "4.7",
    "ratings": 688,
    "imgs": [
      "assets/img/v2/kurta.jpg",
      "assets/img/product-kurta.jpg"
    ],
    "cols": [
      {
        "name": "Emerald",
        "hex": "#0f5132"
      },
      {
        "name": "Off White",
        "hex": "#efe9dc"
      },
      {
        "name": "Wine",
        "hex": "#5a1730"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "S",
    "short": "Mandarin collar with subtle tonal thread work.",
    "desc": "Simple kurta nahi — collar ke paas tone-on-tone thread work hai jo door se plain lagta hai aur paas jaake premium. Churidar ke saath traditional, jeans ke saath Gen-Z street style.",
    "fabric": "Art silk · tonal thread work",
    "fit": "Straight · free alteration",
    "occasion": "Puja · Eid · Family function",
    "care": "Gentle hand wash",
    "box": "1 kurta (churidar optional)",
    "review": {
      "name": "Sana Parveen",
      "city": "Nawada",
      "size": "L",
      "text": "Papa ke liye liya. Quality dekh ke hairan rah gayi, packing bhi bahut achhi thi."
    }
  },
  "denim": {
    "id": "denim",
    "name": "Indigo Denim Jacket",
    "cat": "Casual",
    "price": 1899,
    "mrp": 3499,
    "rating": "4.5",
    "ratings": 512,
    "imgs": [
      "assets/img/v2/denim.jpg",
      "assets/img/product-denim.jpg"
    ],
    "cols": [
      {
        "name": "Indigo",
        "hex": "#2b3a53"
      },
      {
        "name": "Washed Black",
        "hex": "#24252a"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "XL",
    "short": "Heavy-weight stretch denim with a clean finish.",
    "desc": "Yeh jacket har outfit ko 'styled' bana deta hai. 12 oz denim hai isliye shape rehti hai, par 2% stretch ki wajah se baith ke bhi comfortable. Sardiyaan aur monsoon dono mein kaam ka.",
    "fabric": "12 oz cotton denim · 2% stretch",
    "fit": "Regular · layer-friendly",
    "occasion": "Street · Casual · Travel",
    "care": "Machine wash cold",
    "box": "1 jacket",
    "review": {
      "name": "Vikash Yadav",
      "city": "Nalanda",
      "size": "L",
      "text": "Denim heavy hai but comfortable. Colour exactly photo jaisa aaya."
    }
  },
  "overcoat": {
    "id": "overcoat",
    "name": "Camel Wool Overcoat",
    "cat": "Formal",
    "price": 3499,
    "mrp": 6499,
    "rating": "4.8",
    "ratings": 207,
    "imgs": [
      "assets/img/v2/overcoat.jpg",
      "assets/img/product-overcoat.jpg"
    ],
    "cols": [
      {
        "name": "Camel",
        "hex": "#b98b57"
      },
      {
        "name": "Charcoal",
        "hex": "#3b3d42"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "S",
    "short": "Soft wool blend with a structured, elegant drape.",
    "desc": "Shaadi December mein ho to yeh overcoat sherwani ke upar bhi pehen sakte hain. Camel colour photos mein royal lagta hai, aur andar ki lining garmi ko rok ke rakhti hai.",
    "fabric": "Wool blend · brushed finish",
    "fit": "Tailored · mid-length",
    "occasion": "Winter wedding · Travel · Formal",
    "care": "Dry clean only",
    "box": "1 overcoat",
    "review": {
      "name": "Nitesh Prasad",
      "city": "Rajgir",
      "size": "M",
      "text": "Winter wedding ke liye perfect. Kapda heavy aur premium feel deta hai."
    }
  },
  "bandhgala": {
    "id": "bandhgala",
    "name": "Wine Velvet Bandhgala",
    "cat": "Wedding",
    "price": 3999,
    "mrp": 7499,
    "rating": "4.9",
    "ratings": 164,
    "imgs": [
      "assets/img/v2/bandhgala.jpg"
    ],
    "cols": [
      {
        "name": "Wine Velvet",
        "hex": "#5a1730"
      },
      {
        "name": "Royal Blue",
        "hex": "#1e2f57"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "XXL",
    "short": "Velvet bandhgala with brass buttons and mandarin collar.",
    "desc": "Sherwani se hatt kar kuch chahiye? Velvet bandhgala — light, sharp aur photo mein ekdum film-star. Brass buttons real metal finish ke hain, isliye flash mein shine karte hain.",
    "fabric": "Micro velvet · brass buttons",
    "fit": "Slim · free alteration",
    "occasion": "Engagement · Reception · Cocktail",
    "care": "Dry clean only",
    "box": "Bandhgala, inner shirt",
    "review": {
      "name": "Shivam Gupta",
      "city": "Nawada",
      "size": "M",
      "text": "Engagement ke liye pehna. Sabne bola designer se banwaya hai kya. Value for money."
    }
  },
  "chinos": {
    "id": "chinos",
    "name": "Charcoal Slim Chinos",
    "cat": "Casual",
    "price": 999,
    "mrp": 1999,
    "rating": "4.4",
    "ratings": 2180,
    "imgs": [
      "assets/img/v2/chinos.jpg"
    ],
    "cols": [
      {
        "name": "Charcoal",
        "hex": "#3a3d42"
      },
      {
        "name": "Khaki",
        "hex": "#a98e6b"
      },
      {
        "name": "Navy",
        "hex": "#1e2b45"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "XXL",
    "short": "Four-way stretch cotton twill that keeps its crease.",
    "desc": "Roz pehne jaane wali pant. 4-way stretch hai, isliye baithne-uthne mein aaram; aur wash ke baad bhi crease aa jaati hai. Office ho ya casual outing, ek hi pant kaafi.",
    "fabric": "Cotton twill · 4-way stretch",
    "fit": "Slim · mid-rise",
    "occasion": "Daily · Office · Travel",
    "care": "Machine wash",
    "box": "1 pair chinos",
    "review": {
      "name": "Suraj Kumar",
      "city": "Hisua",
      "size": "32",
      "text": "Price ke hisaab se best. 3 mahine se roz pehen raha hoon, colour nahi fika."
    }
  }
};

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
      var url = imgSrc(src);
      return '<button type="button" class="sheet__thumb' + (i === 0 ? ' is-on' : '') + '" data-src="' + url + '"><img src="' + url + '" alt="" loading="lazy"></button>';
    }).join("");
    stageImg.src = imgSrc(p.imgs[0]);
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
