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
    showMrp: false,         // asli MRP mile to true kar dein, warna discount line hide rehti hai
    priceNote: "Final price aur offer WhatsApp par confirm hote hain.",
    delivery: "Free delivery in Nawada · store pickup",
    exchange: "Size exchange available — store par confirm karein",
    alteration: "Free alteration",
    instagram: "",          // jaise "https://instagram.com/menswear_nawada" — khali ho to icon chhupa rehta hai
    facebook: "",
    googleProfile: "https://www.google.com/maps/search/?api=1&query=Men%27s+Wear+Sudama+Nagar+Nawada+Bihar+805110",
    catalogPdf: ""          // WhatsApp catalogue ka link (agar hai),
  };

  var PRODUCTS =  {
  "sherwani": {
    "id": "sherwani",
    "name": "Black Zardozi Sherwani",
    "cat": "wedding",
    "price": 5999,
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
    "box": "Sherwani, churidar, brooch pin"
  },
  "ivory-sherwani": {
    "id": "ivory-sherwani",
    "cat": "wedding",
    "name": "Ivory Groom Sherwani",
    "badge": "Groom",
    "price": 6499,
    "imgs": [
      "assets/img/v2/ivory-sherwani.jpg"
    ],
    "cols": [
      {
        "name": "Ivory",
        "hex": "#efe6d5"
      },
      {
        "name": "Champagne",
        "hex": "#d9c29a"
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
    "short": "Cream sherwani with fine gold thread work — classic groom pick.",
    "fabric": "Silk blend · gold thread embroidery",
    "fit": "Slim · free alteration",
    "occasion": "Wedding · Reception",
    "care": "Dry clean only",
    "box": "Sherwani, churidar, dupatta (optional)",
    "desc": "Cream sherwani har skin tone par lagti hai — isliye Nawada ke groom sabse zyada yahi uthate hain. Zari ka kaam halka hai, isliye poore function mein bhaari nahi lagta. Safa aur mojari ke saath ek complete groom look ban jaata hai."
  },
  "indo-western": {
    "id": "indo-western",
    "cat": "wedding",
    "name": "Black Indo-Western Set",
    "badge": "Trending",
    "price": 5499,
    "imgs": [
      "assets/img/v2/indo-western.jpg"
    ],
    "cols": [
      {
        "name": "Jet Black",
        "hex": "#141418"
      },
      {
        "name": "Deep Wine",
        "hex": "#4a1226"
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
    "short": "Asymmetric kurta-jacket with drape sash — cocktail & sangeet ke liye.",
    "fabric": "Suiting blend · layered drape",
    "fit": "Tailored · free alteration",
    "occasion": "Sangeet · Cocktail · Reception",
    "care": "Dry clean only",
    "box": "Kurta-jacket, sash, trouser",
    "desc": "Sherwani pehen-pehen ke bore ho gaye? Indo-western ek hi outfit mein modern aur desi dono hai. Drape sash alag se pin hota hai, isliye aap decide kar sakte hain kitna dramatic chahiye."
  },
  "bandhgala": {
    "id": "bandhgala",
    "name": "Wine Velvet Bandhgala",
    "cat": "wedding",
    "price": 3999,
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
    "box": "Bandhgala, inner shirt"
  },
  "jodhpuri": {
    "id": "jodhpuri",
    "cat": "wedding",
    "name": "Royal Blue Jodhpuri Suit",
    "badge": "Royal",
    "price": 5999,
    "imgs": [
      "assets/img/v2/jodhpuri.jpg"
    ],
    "cols": [
      {
        "name": "Royal Blue",
        "hex": "#1e2f57"
      },
      {
        "name": "Bottle Green",
        "hex": "#14402f"
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
    "short": "High mandarin collar bandhgala suit with gold buttons.",
    "fabric": "Wool blend · brass buttons",
    "fit": "Structured · free alteration",
    "occasion": "Wedding · Engagement · Formal dinner",
    "care": "Dry clean only",
    "box": "Jodhpuri jacket, trouser",
    "desc": "Jodhpuri suit ka collar hi isko royal banata hai. Shaadi mein sherwani se halka lagta hai, isliye garmi mein bhi comfortable. Gold buttons shaam ki roshni mein khul ke dikhte hain."
  },
  "safa": {
    "id": "safa",
    "cat": "wedding",
    "name": "Groom Safa + Kalgi",
    "badge": "Groom set",
    "price": 899,
    "imgs": [
      "assets/img/v2/safa.jpg"
    ],
    "cols": [
      {
        "name": "Cream Gold",
        "hex": "#e8d6b0"
      },
      {
        "name": "Maroon Gold",
        "hex": "#6c1a2c"
      }
    ],
    "sizes": [
      "Free size"
    ],
    "sold": "",
    "short": "Pre-tied safa with kalgi pin — 2 minute mein ready.",
    "fabric": "Crushed silk · zari border",
    "fit": "Pre-tied · adjustable",
    "occasion": "Wedding · Baraat · Photos",
    "care": "Dry clean / hand steam",
    "box": "Safa, kalgi pin, extra pin",
    "desc": "Safa khud baandhne mein time aur practice lagti hai — yeh pre-tied hai, isliye 2 minute mein pehen ke nikal sakte hain. Kalgi pin alag se aata hai, sherwani ke brooch ki jagah bhi use kar sakte hain."
  },
  "mojari": {
    "id": "mojari",
    "cat": "wedding",
    "name": "Zari Velvet Mojari",
    "badge": "Accessory",
    "price": 999,
    "imgs": [
      "assets/img/v2/mojari.jpg"
    ],
    "cols": [
      {
        "name": "Black Gold",
        "hex": "#15151a"
      },
      {
        "name": "Cream Gold",
        "hex": "#e3d3ae"
      }
    ],
    "sizes": [
      "6",
      "7",
      "8",
      "9",
      "10"
    ],
    "sold": "6",
    "short": "Hand-embroidered velvet mojari with cushioned insole.",
    "fabric": "Velvet · zari embroidery",
    "fit": "True to size · cushioned",
    "occasion": "Wedding · Festive · Kurta",
    "care": "Dry brush only",
    "box": "1 pair",
    "desc": "Shaadi mein 6 ghante khade rehna hota hai — isliye insole cushioned hai, plain jutti jaisi sakht nahi. Zari ka kaam haath se kiya gaya hai, isliye har jodi thodi unique lagti hai."
  },
  "kurta-pyjama": {
    "id": "kurta-pyjama",
    "cat": "ethnic",
    "name": "Cream Kurta Pyjama Set",
    "badge": "Festive",
    "price": 1899,
    "imgs": [
      "assets/img/v2/kurta-pyjama.jpg"
    ],
    "cols": [
      {
        "name": "Cream",
        "hex": "#efe7d8"
      },
      {
        "name": "Sage",
        "hex": "#b9c4ab"
      }
    ],
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "sold": "M",
    "short": "Self-textured cotton kurta with churidar — all-day comfortable.",
    "fabric": "Cotton blend · self texture",
    "fit": "Straight · free alteration",
    "occasion": "Puja · Eid · Family function",
    "care": "Machine wash cold",
    "box": "Kurta, churidar",
    "desc": "Pooja, milan ya ghar ke function — yeh set sab jagah chal jaata hai. Cotton hai isliye pasina soakta hai, aur churidar thoda stretch deta hai taaki baithne mein dikkat na ho."
  },
  "suit": {
    "id": "suit",
    "name": "Midnight Navy 3-Piece Suit",
    "cat": "formal",
    "price": 4499,
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
    "box": "Jacket, waistcoat, trouser"
  },
  "blazer": {
    "id": "blazer",
    "cat": "formal",
    "name": "Charcoal Wool Blazer",
    "badge": "Office",
    "price": 2999,
    "imgs": [
      "assets/img/v2/blazer.jpg"
    ],
    "cols": [
      {
        "name": "Charcoal",
        "hex": "#3a3d42"
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
    "short": "Single-breasted blazer that works with jeans and trousers both.",
    "fabric": "Wool blend · half-canvas front",
    "fit": "Slim · free alteration",
    "occasion": "Office · Interview · Dinner",
    "care": "Dry clean recommended",
    "box": "1 blazer",
    "desc": "Ek blazer se do look: shirt-trouser ke saath formal, t-shirt-jeans ke saath smart casual. Half-canvas front hai isliye chest par shape aati hai, par price poore suit jaisi nahi."
  },
  "overcoat": {
    "id": "overcoat",
    "name": "Camel Wool Overcoat",
    "cat": "formal",
    "price": 3499,
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
    "box": "1 overcoat"
  },
  "white-shirt": {
    "id": "white-shirt",
    "cat": "formal",
    "name": "Classic White Formal Shirt",
    "badge": "Essential",
    "price": 899,
    "imgs": [
      "assets/img/v2/white-shirt.jpg"
    ],
    "cols": [
      {
        "name": "White",
        "hex": "#f6f4ef"
      },
      {
        "name": "Sky",
        "hex": "#cfe0ee"
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
    "short": "Crisp cotton poplin, wrinkle-resistant finish.",
    "fabric": "Cotton poplin · wrinkle resistant",
    "fit": "Slim · true to size",
    "occasion": "Office · Interview · Formal",
    "care": "Machine wash",
    "box": "1 shirt",
    "desc": "Safed shirt har aadmi ke paas honi chahiye — par achhi wali. Yeh poplin hai, isliye dhone ke baad zyada press nahi karni padti. Collar stiff hai, isliye tie ke saath bhi theek lagti hai."
  },
  "trousers": {
    "id": "trousers",
    "cat": "formal",
    "name": "Black Slim Formal Trouser",
    "badge": "Essential",
    "price": 1199,
    "imgs": [
      "assets/img/v2/trousers.jpg"
    ],
    "cols": [
      {
        "name": "Black",
        "hex": "#17171b"
      },
      {
        "name": "Navy",
        "hex": "#1e2b45"
      },
      {
        "name": "Grey",
        "hex": "#4a4d52"
      }
    ],
    "sizes": [
      "30",
      "32",
      "34",
      "36",
      "38",
      "40"
    ],
    "sold": "30",
    "short": "Poly-wool trouser with a sharp crease that stays.",
    "fabric": "Poly-wool blend · crease hold",
    "fit": "Slim · mid-rise",
    "occasion": "Office · Wedding · Daily formal",
    "care": "Machine wash / dry clean",
    "box": "1 trouser",
    "desc": "Formal trouser ki asli test: shaam tak crease rehni chahiye. Yeh poly-wool blend hai isliye crease hold karti hai aur ghisne par bhi chamakti nahi. Length free alter hoti hai."
  },
  "linen": {
    "id": "linen",
    "name": "Ivory Linen Shirt",
    "cat": "casual",
    "price": 1299,
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
    "box": "1 shirt"
  },
  "checked-shirt": {
    "id": "checked-shirt",
    "cat": "casual",
    "name": "Navy Check Casual Shirt",
    "badge": "Everyday",
    "price": 899,
    "imgs": [
      "assets/img/v2/checked-shirt.jpg"
    ],
    "cols": [
      {
        "name": "Navy Check",
        "hex": "#2b3a53"
      },
      {
        "name": "Green Check",
        "hex": "#2f4a37"
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
    "short": "Soft brushed cotton check — college aur outing ke liye.",
    "fabric": "Brushed cotton · yarn dyed check",
    "fit": "Regular · relaxed",
    "occasion": "College · Casual · Travel",
    "care": "Machine wash cold",
    "box": "1 shirt",
    "desc": "Check shirt ka fayda: plain se zyada stylish, par print se zyada safe. Yeh brushed cotton hai isliye garmi mein bhi chipakti nahi. Jeans ho ya chinos, dono ke saath set."
  },
  "denim": {
    "id": "denim",
    "name": "Indigo Denim Jacket",
    "cat": "casual",
    "price": 1899,
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
    "box": "1 jacket"
  },
  "chinos": {
    "id": "chinos",
    "name": "Charcoal Slim Chinos",
    "cat": "casual",
    "price": 999,
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
    "box": "1 pair chinos"
  },
  "kurta": {
    "id": "kurta",
    "name": "Emerald Silk Kurta",
    "cat": "ethnic",
    "price": 1499,
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
    "box": "1 kurta (churidar optional)"
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
    chinos: ["linen", "denim"],
    "ivory-sherwani": ["safa", "mojari"],
    "indo-western": ["mojari", "bandhgala"],
    jodhpuri: ["white-shirt", "trousers"],
    safa: ["ivory-sherwani", "mojari"],
    mojari: ["safa", "sherwani"],
    "kurta-pyjama": ["mojari", "nehru"],
    blazer: ["white-shirt", "trousers"],
    "white-shirt": ["trousers", "blazer"],
    "checked-shirt": ["chinos", "denim"],
    trousers: ["white-shirt", "blazer"]
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function rupee(n) { return "₹" + n.toLocaleString("en-IN"); }
  function off(p) { return p.mrp && p.mrp > p.price ? Math.round((p.mrp - p.price) * 100 / p.mrp) : 0; }
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

  /* the app shell can nudge the visitor (offline, saved copy, …) */
  window.__mwToast = toast;

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
      return p ? sum + (p.mrp || p.price) * it.qty : sum;
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
    bits.push("Price dikha raha hai " + rupee(p.price) +
      (CONFIG.showMrp && p.mrp ? " (MRP " + rupee(p.mrp) + ")" : "") + ".");
    bits.push("Availability, delivery aur fitting bata dijiye.");
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(bits.join(" "));
  }

  function syncWa() {
    var p = PRODUCTS[state.id];
    if (!p || !waBtn) return;
    waBtn.setAttribute("href", waMessage(p));
  }


  function render(p) {
    var disc = off(p);
    var pair = (PAIRS[p.id] || []).map(function (id) { return PRODUCTS[id]; }).filter(Boolean);

    info.innerHTML =
      '<p class="sheet__crumb">' + p.cat + ' · Men&#39;s Wear, Sudama Nagar</p>' +
      '<h2 class="sheet__title" id="sheetTitle">' + p.name + '</h2>' +
      '<p class="sheet__short">' + p.short + '</p>' +
      '<div class="sheet__rate">' +
        '<span class="sheet__verified">✓ Store se seedha · free alteration</span>' +
        '<button type="button" class="sheet__share" data-share>Share</button></div>' +
      '<div class="sheet__price"><span class="price">' + rupee(p.price) + '</span>' +
        (CONFIG.showMrp && p.mrp ? '<s class="mrp">' + rupee(p.mrp) + '</s><span class="off">' + disc + '% off</span>' : '') +
      '</div>' +
      '<p class="sheet__tax">Inclusive of all taxes · free alteration included</p>' +
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

      '<p class="sheet__foot">Aap seedha dukaan se kharid rahe hain — koi middle-man nahi. Size ya fitting ki dikkat ho to free alteration hamari taraf se.</p>';

    thumbs.innerHTML = p.imgs.map(function (src, i) {
      var url = imgSrc(src);
      return '<button type="button" class="sheet__thumb' + (i === 0 ? ' is-on' : '') + '" data-src="' + url + '"><img src="' + url + '" alt="" loading="lazy"></button>';
    }).join("");
    stageImg.src = imgSrc(p.imgs[0]);
    stageImg.alt = p.name;

    if (barPrice) barPrice.textContent = rupee(p.price);
    if (barMrp) {
      barMrp.textContent = CONFIG.showMrp && p.mrp ? rupee(p.mrp) : "";
      barMrp.hidden = !(CONFIG.showMrp && p.mrp);
    }
    if (barOff) {
      barOff.textContent = disc ? disc + "% off" : "";
      barOff.hidden = !(CONFIG.showMrp && disc);
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

  /* owner links: social icons appear only when a real URL is configured */
  (function socials() {
    var box = document.querySelector(".footer__socials");
    if (!box) return;
    var icons = { instagram: CONFIG.instagram, facebook: CONFIG.facebook };
    var svg = {
      instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 9h3V5.6h-3c-2.2 0-4 1.8-4 4V12H7v3.4h3V22h3.4v-6.6H16L16.6 12h-3.2V9.8c0-.5.3-.8.6-.8Z"/></svg>'
    };
    Object.keys(icons).forEach(function (key) {
      var url = icons[key];
      if (!url) return;
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", "Men's Wear on " + key);
      a.innerHTML = svg[key];
      box.appendChild(a);
    });
  })();

  applySort();
  applyFilters(false);
  renderBag();
  refreshWish();
  fromHash();
})();
