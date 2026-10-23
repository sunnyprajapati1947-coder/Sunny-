/* ==========================================================================
   MEN'S WEAR — shop layer
   Tap a garment  -> full detail sheet (price, MRP, sizes, colours, offers,
                     delivery, specs, reviews, "complete the look", share).
   Add to bag     -> bag drawer with quantity, savings and one-tap WhatsApp
                     order that carries the whole order in a single message.
   Every product also has its own link:  <site>/#p=sherwani
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- config
     Shop owner can change these lines without touching anything else.      */
  var CONFIG = {
    whatsapp: "919608087035",
    showMrp: true,          // false -> discount line poori tarah hide ho jaati hai
    priceNote: "Final price aur offer WhatsApp par confirm hote hain.",
    delivery: "Free delivery in Nawada · store pickup 2 ghante mein",
    exchange: "Size exchange available — store par confirm karein",
    alteration: "Free alteration, 24 ghante mein"
  };

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

  /* "Complete the look" — is piece ke saath kaunse 2 piece achhe lagte hain */
  var PAIRS = {
    sherwani: ["kurta", "bandhgala"],
    suit: ["linen", "chinos"],
    linen: ["chinos", "denim"],
    kurta: ["chinos", "bandhgala"],
    denim: ["chinos", "linen"],
    overcoat: ["suit", "chinos"],
    bandhgala: ["kurta", "sherwani"],
    chinos: ["linen", "denim"]
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function rupee(n) { return "₹" + n.toLocaleString("en-IN"); }
  function off(p) { return Math.round((p.mrp - p.price) * 100 / p.mrp); }
  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
    return null;
  }

  /* Analytics: fires only when Vercel Web Analytics is switched on. */
  function track(name, params) {
    try { if (typeof window.va === "function") window.va("event", { name: name, data: params || {} }); } catch (e) {}
    try { if (window.dataLayer) window.dataLayer.push({ event: name, ...(params || {}) }); } catch (e) {}
  }

  /* Photos sit next to this script, wherever it is served from. */
  var IMG_BASE = (function () {
    var tag = document.currentScript || document.querySelector('script[src*="shop.js"]');
    var src = tag && tag.src ? tag.src : "";
    var i = src.indexOf("assets/js/shop.js");
    return i > -1 ? src.slice(0, i) : "";
  })();
  function imgSrc(path) { return path.indexOf("http") === 0 ? path : IMG_BASE + path; }

  var productUrl = function (id) {
    return location.origin + location.pathname + "#p=" + id;
  };

  /* ---------------------------------------------------------------- toast */
  var toastEl = $("#toast"), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* -------------------------------------------------------------- wishlist */
  var saved = store("mw-saved") || [];
  if (!Array.isArray(saved)) saved = [];

  function paintWish(btn) {
    var on = saved.indexOf(btn.getAttribute("data-wish")) > -1;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function refreshWish() {
    $$("[data-wish]").forEach(paintWish);
    var n = saved.length;
    $$("[data-wish-count]").forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
    });
  }
  $$("[data-wish]").forEach(function (btn) {
    paintWish(btn);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var id = btn.getAttribute("data-wish");
      var i = saved.indexOf(id);
      if (i > -1) { saved.splice(i, 1); toast("Wishlist se hata diya"); }
      else { saved.push(id); toast("Wishlist mein save ho gaya"); track("wishlist_add", { id: id }); }
      store("mw-saved", saved);
      refreshWish();
    });
  });

  /* ------------------------------------------------------------------ bag */
  var bag = store("mw-bag") || [];
  if (!Array.isArray(bag)) bag = [];

  var bagPanel = $("#bag");
  var bagList = $("#bagList");
  var bagFoot = $("#bagFoot");
  var bagCountEls = $$("[data-bag-count]");

  function bagTotal() {
    return bag.reduce(function (sum, it) {
      var p = PRODUCTS[it.id];
      return p ? sum + p.price * it.qty : sum;
    }, 0);
  }
  function bagMrp() {
    return bag.reduce(function (sum, it) {
      var p = PRODUCTS[it.id];
      return p ? sum + p.mrp * it.qty : sum;
    }, 0);
  }
  function bagQty() {
    return bag.reduce(function (n, it) { return n + it.qty; }, 0);
  }
  function saveBag() { store("mw-bag", bag); paintBagCount(); }
  function paintBagCount() {
    var n = bagQty();
    bagCountEls.forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
    });
    var b = $("#bagBtn");
    if (b) b.setAttribute("aria-label", "Bag, " + n + (n === 1 ? " item" : " items"));
  }

  function orderRef() {
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
    return "MW-" + stamp + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function orderText(ref) {
    var lines = ["Namaste Men's Wear! Order karna hai:", ""];
    lines.push("Order ref: " + ref);
    bag.forEach(function (it, i) {
      var p = PRODUCTS[it.id];
      if (!p) return;
      lines.push((i + 1) + ". " + p.name +
        " | Size " + it.size +
        " | Colour " + it.colour +
        " | Qty " + it.qty +
        " | ₹" + (p.price * it.qty).toLocaleString("en-IN"));
    });
    lines.push("");
    lines.push("Total: ₹" + bagTotal().toLocaleString("en-IN") +
      (CONFIG.showMrp && bagMrp() > bagTotal() ? " (MRP ₹" + bagMrp().toLocaleString("en-IN") + ")" : ""));
    lines.push("Naam: ");
    lines.push("Delivery address ya store pickup: ");
    lines.push("Payment: UPI / Card / Cash");
    lines.push("");
    lines.push("Confirm kar dijiye — fitting aur delivery bata dijiye.");
    return lines.join("\n");
  }

  function renderBag() {
    if (!bagList) return;
    if (!bag.length) {
      bagList.innerHTML =
        '<div class="bag__empty"><p>Bag khali hai.</p>' +
        '<p class="bag__emptysub">Koi bhi piece kholiye aur <b>Add to bag</b> dabaiye.</p></div>';
      if (bagFoot) bagFoot.innerHTML = "";
    } else {
      bagList.innerHTML = bag.map(function (it, i) {
        var p = PRODUCTS[it.id];
        if (!p) return "";
        return '<article class="bagitem" data-i="' + i + '">' +
          '<div class="bagitem__img"><img src="' + imgSrc(p.imgs[0]) + '" alt="' + p.name + '" loading="lazy"></div>' +
          '<div class="bagitem__body">' +
            '<p class="bagitem__name">' + p.name + '</p>' +
            '<p class="bagitem__meta">Size ' + it.size + ' · ' + it.colour + '</p>' +
            '<p class="bagitem__price">' + rupee(p.price * it.qty) +
              (CONFIG.showMrp && p.mrp > p.price ? ' <s>' + rupee(p.mrp * it.qty) + '</s>' : '') + '</p>' +
            '<div class="bagitem__row">' +
              '<div class="qty">' +
                '<button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>' +
                '<span>' + it.qty + '</span>' +
                '<button type="button" data-qty="1" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<button type="button" class="bagitem__remove" data-remove>Remove</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join("");

      $$("[data-qty]", bagList).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = +btn.closest(".bagitem").getAttribute("data-i");
          bag[i].qty += +btn.getAttribute("data-qty");
          if (bag[i].qty < 1) bag.splice(i, 1);
          saveBag();
          renderBag();
        });
      });
      $$("[data-remove]", bagList).forEach(function (btn) {
        btn.addEventListener("click", function () {
          bag.splice(+btn.closest(".bagitem").getAttribute("data-i"), 1);
          saveBag();
          renderBag();
          toast("Bag se hata diya");
        });
      });

      if (bagFoot) {
        var total = bagTotal(), mrp = bagMrp();
        var save = mrp - total;
        bagFoot.innerHTML =
          '<div class="bag__sum"><div><span>Total MRP</span><b>' + rupee(mrp) + '</b></div>' +
          (save > 0 ? '<div class="bag__save"><span>Aap bacha rahe hain</span><b>' + rupee(save) + '</b></div>' : '') +
          '<div class="bag__grand"><span>Total</span><b>' + rupee(total) + '</b></div></div>' +
          '<p class="bag__note">' + CONFIG.alteration + ' · ' + CONFIG.exchange + '</p>' +
          '<div class="bag__actions">' +
            '<a class="btn btn--wa btn--block" id="bagOrder" href="#" target="_blank" rel="noopener">Order on WhatsApp</a>' +
            '<button type="button" class="btn btn--ghost" id="bagCopy">Copy order</button>' +
          '</div>' +
          '<p class="bag__ref">Order ref message mein apne aap chala jayega — dukaan par isi se order milega.</p>';

        var ref = orderRef();
        var orderBtn = $("#bagOrder");
        if (orderBtn) {
          orderBtn.setAttribute("href", "https://wa.me/" + CONFIG.whatsapp +
            "?text=" + encodeURIComponent(orderText(ref)));
          orderBtn.addEventListener("click", function () {
            track("bag_order", { items: bagQty(), value: total });
          });
        }
        var copyBtn = $("#bagCopy");
        if (copyBtn) {
          copyBtn.addEventListener("click", function () {
            copy(orderText(ref)).then(function () { toast("Order details copy ho gayi"); });
          });
        }
      }
    }
    if (bagPanel) {
      var badge = $("#bagWishCount");
      if (badge) {
        badge.textContent = saved.length;
        badge.hidden = saved.length === 0;
      }
    }
    paintBagCount();
  }

  function addToBag(p, size, colour) {
    if (!size) {
      toast("Pehle size choose karein");
      var box = $(".sizes", info);
      if (box) {
        box.classList.add("is-warn");
        setTimeout(function () { box.classList.remove("is-warn"); }, 1200);
      }
      return false;
    }
    var same = bag.filter(function (it) {
      return it.id === p.id && it.size === size && it.colour === colour;
    })[0];
    if (same) same.qty += 1;
    else bag.push({ id: p.id, size: size, colour: colour, qty: 1 });
    saveBag();
    renderBag();
    track("add_to_bag", { id: p.id, size: size, colour: colour });
    toast(p.name + " bag mein add ho gaya");
    return true;
  }

  /* --------------------------------------------------------------- filters */
  var grid = $("#productGrid");
  var cards = grid ? $$(".pcard", grid) : [];
  var activeCat = "all", query = "", sortBy = "popular", priceRange = "all";

  var RANGES = {
    all: [0, Infinity],
    low: [0, 1500],
    mid: [1500, 3000],
    high: [3000, 5000],
    max: [5000, Infinity]
  };

  function matchesPrice(price) {
    var r = RANGES[priceRange] || RANGES.all;
    return price >= r[0] && (r[1] === Infinity || price < r[1]);
  }

  function applyFilters(animate) {
    var shown = 0;
    cards.forEach(function (card) {
      var cat = card.getAttribute("data-cat");
      var name = (card.getAttribute("data-name") || "").toLowerCase();
      var ok = (activeCat === "all" || cat === activeCat) &&
        (!query || name.indexOf(query) > -1) &&
        matchesPrice(+card.getAttribute("data-price"));
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
    var label = $("#shopCount");
    if (label) label.textContent = shown + (shown === 1 ? " piece" : " pieces");
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

  $$(".filter[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCat = btn.getAttribute("data-filter");
      $$(".filter[data-filter]").forEach(function (f) {
        f.classList.toggle("is-active", f === btn);
        f.setAttribute("aria-selected", f === btn ? "true" : "false");
      });
      applyFilters(true);
    });
  });

  $$("[data-price-range]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      priceRange = btn.getAttribute("data-price-range");
      $$("[data-price-range]").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
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
  var bagBtn = $("#sheetBag");
  var lastFocus = null;
  var state = { id: null, size: null, colour: null };

  function waMessage(p) {
    var bits = ["Namaste Men's Wear! Mujhe *" + p.name + "* chahiye."];
    if (state.colour) bits.push("Colour: " + state.colour + ".");
    bits.push("Size: " + (state.size || "confirm karna hai") + ".");
    bits.push("Price dikha raha hai " + rupee(p.price) + " (MRP " + rupee(p.mrp) + ").");
    bits.push("Availability, delivery aur fitting bata dijiye.");
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(bits.join(" "));
  }

  function syncWa() {
    var p = PRODUCTS[state.id];
    if (!p || !waBtn) return;
    waBtn.setAttribute("href", waMessage(p));
  }

  function stars(p) { return p.rating + " ★"; }

  function render(p) {
    var disc = off(p);
    var pair = (PAIRS[p.id] || []).map(function (id) { return PRODUCTS[id]; }).filter(Boolean);

    info.innerHTML =
      '<p class="sheet__crumb">' + p.cat + ' · Men&#39;s Wear, Sudama Nagar</p>' +
      '<h2 class="sheet__title" id="sheetTitle">' + p.name + '</h2>' +
      '<p class="sheet__short">' + p.short + '</p>' +
      '<div class="sheet__rate"><span class="rating">' + stars(p) + '</span>' +
        '<span class="sheet__count">' + p.ratings.toLocaleString("en-IN") + ' ratings</span>' +
        '<span class="sheet__verified">✓ Store se seedha</span>' +
        '<button type="button" class="sheet__share" data-share>Share</button></div>' +
      '<div class="sheet__price"><span class="price">' + rupee(p.price) + '</span>' +
        (CONFIG.showMrp ? '<s class="mrp">' + rupee(p.mrp) + '</s><span class="off">' + disc + '% off</span>' : '') +
      '</div>' +
      '<p class="sheet__tax">' + (CONFIG.showMrp ? 'Inclusive of all taxes · ' : '') + 'Free alteration included</p>' +
      '<p class="sheet__note">' + CONFIG.priceNote + '</p>' +

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
        '<li><b>Free alteration</b> — ' + CONFIG.alteration.replace('Free alteration, ', '') + '</li>' +
        '<li><b>' + CONFIG.exchange + '</b></li></ul>' +
      '</div>' +

      '<div class="sheet__delivery">' +
        '<div><span class="tick">✓</span><p><b>Delivery &amp; pickup</b><br><small>' + CONFIG.delivery + '</small></p></div>' +
        '<div><span class="tick">✓</span><p><b>Store pickup</b><br><small>Sudama Nagar, Nawada — 805110</small></p></div>' +
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

      (pair.length ? '<div class="sheet__block"><p class="sheet__label">Complete the look</p><div class="pairs">' +
        pair.map(function (q) {
          return '<button type="button" class="pair" data-open="' + q.id + '">' +
            '<span class="pair__img"><img src="' + imgSrc(q.imgs[0]) + '" alt="' + q.name + '" loading="lazy"></span>' +
            '<span class="pair__body"><b>' + q.name + '</b><small>' + rupee(q.price) + '</small></span>' +
          '</button>';
        }).join("") + '</div></div>' : '') +

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
          '<p class="reviewcard__by">' + p.review.name + ' · ' + p.review.city + ' · Size ' + p.review.size + ' <span>Customer feedback</span></p></div>' +
      '</div>' +

      '<p class="sheet__foot">Aap seedha dukaan se kharid rahe hain — koi middle-man nahi. Size ya fitting ki dikkat ho to free alteration hamari taraf se.</p>';

    thumbs.innerHTML = p.imgs.map(function (src, i) {
      var url = imgSrc(src);
      return '<button type="button" class="sheet__thumb' + (i === 0 ? ' is-on' : '') + '" data-src="' + url + '"><img src="' + url + '" alt="" loading="lazy"></button>';
    }).join("");
    stageImg.src = imgSrc(p.imgs[0]);
    stageImg.alt = p.name;

    if (barPrice) barPrice.textContent = rupee(p.price);
    if (barMrp) {
      barMrp.textContent = rupee(p.mrp);
      barMrp.hidden = !CONFIG.showMrp;
    }
    if (barOff) {
      barOff.textContent = disc + "% off";
      barOff.hidden = !CONFIG.showMrp;
    }
    syncWa();

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
    $$("[data-share]", info).forEach(function (b) {
      b.addEventListener("click", function () { shareProduct(p); });
    });
    $$(".pair", info).forEach(function (b) {
      b.addEventListener("click", function () { open(b.getAttribute("data-open")); });
    });
  }

  function shareProduct(p) {
    var url = productUrl(p.id);
    var text = p.name + " — " + rupee(p.price) + " · Men's Wear, Nawada";
    track("share", { id: p.id });
    if (navigator.share) {
      navigator.share({ title: p.name, text: text, url: url }).catch(function () {});
      return;
    }
    copy(text + "\n" + url).then(function () { toast("Link copy ho gaya — WhatsApp par bhej dijiye"); });
  }

  function lockBody() { document.body.classList.add("is-locked"); }
  function unlockBody() {
    if ($("#sheet") && !$("#sheet").hidden) return;
    if ($("#bag") && !$("#bag").hidden) return;
    if ($("#drawer") && $("#drawer").classList.contains("is-open")) return;
    document.body.classList.remove("is-locked");
  }

  function open(id, opts) {
    var p = PRODUCTS[id];
    if (!p || !sheet) return;
    opts = opts || {};
    state = { id: id, size: null, colour: p.cols[0].name };
    lastFocus = document.activeElement;
    render(p);
    sheet.hidden = false;
    lockBody();
    requestAnimationFrame(function () { sheet.classList.add("is-open"); });
    var panelInfo = $(".sheet__info", sheet);
    if (panelInfo) panelInfo.scrollTop = 0;
    if (opts.focus !== false) {
      var close = $(".sheet__close", sheet);
      if (close) close.focus({ preventScroll: true });
    }
    if (!opts.fromHash) {
      try { history.replaceState(null, "", "#p=" + id); } catch (e) { location.hash = "p=" + id; }
    }
    document.title = p.name + " — Men's Wear, Nawada";
    track("product_view", { id: id });
  }

  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("is-open");
    setTimeout(function () {
      sheet.hidden = true;
      unlockBody();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 260);
    if (location.hash.indexOf("#p=") === 0) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    document.title = "Men's Wear — Premium Menswear Boutique, Nawada";
  }

  /* ---- bag drawer ---- */
  function openBag(fromHash) {
    if (!bagPanel) return;
    renderBag();
    lastFocus = document.activeElement;
    bagPanel.hidden = false;
    lockBody();
    requestAnimationFrame(function () { bagPanel.classList.add("is-open"); });
    if (!fromHash) {
      try { history.replaceState(null, "", "#bag"); } catch (e) {}
    }
    var b = $(".bag__close", bagPanel);
    if (b) b.focus({ preventScroll: true });
    track("bag_view", { items: bagQty() });
  }
  function closeBag() {
    if (!bagPanel || bagPanel.hidden) return;
    bagPanel.classList.remove("is-open");
    setTimeout(function () {
      bagPanel.hidden = true;
      unlockBody();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 260);
    if (location.hash === "#bag") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
  }

  /* ------------------------------------------------------------- wiring */
  $$("[data-open]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); open(b.getAttribute("data-open")); });
  });
  cards.forEach(function (card) {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      open(card.getAttribute("data-id"));
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(card.getAttribute("data-id")); }
    });
  });

  $$("[data-close]", sheet || document).forEach(function (b) { b.addEventListener("click", close); });
  $$("[data-close]", bagPanel || document).forEach(function (b) { b.addEventListener("click", closeBag); });

  var headerBag = $("#bagBtn");
  if (headerBag) headerBag.addEventListener("click", function (e) { e.preventDefault(); openBag(); });
  var actionBag = $("#abBag");
  if (actionBag) actionBag.addEventListener("click", function (e) { e.preventDefault(); openBag(); });

  if (bagBtn) {
    bagBtn.addEventListener("click", function () {
      var p = PRODUCTS[state.id];
      if (!p) return;
      if (addToBag(p, state.size, p.cols.length ? state.colour : null)) {
        close();
        setTimeout(function () { openBag(); }, 300);
      }
    });
  }

  var wishSend = $("#bagWishSend");
  if (wishSend) {
    wishSend.addEventListener("click", function () {
      if (!saved.length) { toast("Wishlist khali hai"); return; }
      var names = saved.map(function (id) { return PRODUCTS[id] ? PRODUCTS[id].name : ""; }).filter(Boolean);
      var msg = "Namaste Men's Wear! Meri wishlist:\n" + names.map(function (n, i) { return (i + 1) + ". " + n; }).join("\n") +
        "\n\nIn sab ki price, size aur availability bata dijiye.";
      window.open("https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
      track("wishlist_share", { count: names.length });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { close(); closeBag(); }
    if (e.key !== "Tab") return;
    var panel = sheet && !sheet.hidden ? sheet : (bagPanel && !bagPanel.hidden ? bagPanel : null);
    if (!panel) return;
    var f = $$('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])', panel)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* deep links: #p=sherwani  |  #bag */
  function fromHash() {
    var h = location.hash || "";
    var m = h.match(/^#p=([a-z0-9-]+)/i);
    if (m && PRODUCTS[m[1]]) { open(m[1], { fromHash: true, focus: false }); return; }
    if (h === "#bag") openBag(true);
  }
  window.addEventListener("hashchange", function () {
    var h = location.hash || "";
    if (!h) { close(); closeBag(); return; }
    fromHash();
  });

  applySort();
  applyFilters(false);
  renderBag();
  refreshWish();
  fromHash();
})();
