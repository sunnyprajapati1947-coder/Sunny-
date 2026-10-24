/* ==========================================================================
   MEN'S WEAR — shop plus
   The Flipkart-style shopping layer, built on open-source pieces that are
   small enough to load on a 2G phone and honest enough for this shop:

   - instant fuzzy search over the live catalogue ............ Fuse.js (Apache-2.0)
     github.com/krisk/fuse  ·  vendored: assets/js/vendor/fuse.basic.min.js
   - tap-to-zoom on the product photo ..................... medium-zoom (MIT)
     github.com/francoischalifour/medium-zoom · vendored: vendor/medium-zoom.min.js

   Everything else here is our own: category tiles that drive the real grid
   filter, a "recently viewed" rail kept only on this device, a pincode check
   that states the shop's real delivery rule, and "you may also like" built
   from the same live catalogue.

   No fake ratings, no invented discounts, no third-party tracking.
   ========================================================================== */
(function () {
  "use strict";

  var WA = "919608087035";
  var BASE = window.__MW_BASE || "";
  var ACCESSORY = /mojari|safa|kalgi|brooch|turban|dupatta|stole/i;
  var LS_SEARCH = "mw.searches.v1";
  var LS_VIEWED = "mw.viewed.v1";

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function rupee(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      var val = raw ? JSON.parse(raw) : null;
      return Object.prototype.toString.call(val) === "[object Array]" ? val : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function toast(msg) {
    if (typeof window.__mwToast === "function") window.__mwToast(msg);
  }

  function isClothing(p) {
    return (p.kind || (ACCESSORY.test(p.name || "") ? "accessory" : "clothing")) === "clothing";
  }

  /* the grid's own list, so tiles/search/similar never drift from the page */
  function catalogue() {
    if (typeof window.__mwList === "function") return window.__mwList();
    var box = window.__MW_PRODUCTS || {};
    return Object.keys(box).map(function (k) { return box[k]; })
      .filter(function (p) { return p && p.imgs && p.imgs.length && isClothing(p); });
  }

  function imgOf(p) {
    var src = (p.imgs && p.imgs[0]) || "";
    return src.indexOf("http") === 0 ? src : BASE + src;
  }

  function openProduct(id) {
    if (typeof window.__mwOpenProduct === "function") window.__mwOpenProduct(id);
  }

  var LABEL = {
    drop: "Drop 01", street: "Street", casual: "Casual",
    formal: "Formal", wedding: "Wedding", ethnic: "Ethnic"
  };
  function labelOf(cat) { return LABEL[cat] || "Drop 01"; }

  var CATS = [
    { key: "drop", note: "new in" },
    { key: "street", note: "baggy fit" },
    { key: "casual", note: "daily" },
    { key: "formal", note: "office" },
    { key: "wedding", note: "sherwani" },
    { key: "ethnic", note: "kurta" }
  ];

  /* ------------------------------------------------------- category tiles */
  function paintCats() {
    var box = $("#fpCats");
    if (!box) return;
    var all = catalogue();
    var html = CATS.map(function (c) {
      var items = all.filter(function (p) { return (p.cat || "drop") === c.key; });
      if (!items.length) return "";
      return (
        '<button type="button" class="fp-cat" data-cat="' + c.key + '">' +
          '<span class="fp-cat__pic"><img src="' + imgOf(items[0]) + '" alt="" loading="lazy" decoding="async"></span>' +
          '<span class="fp-cat__label">' + esc(labelOf(c.key)) + "</span>" +
          '<span class="fp-cat__note">' + items.length + " pieces</span>" +
        "</button>"
      );
    }).join("");
    if (!html) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = html;

    $$(".fp-cat", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-cat");
        var wasOn = b.classList.contains("is-on");
        $$(".fp-cat", box).forEach(function (x) { x.classList.remove("is-on"); });
        if (typeof window.__mwSetCat === "function") window.__mwSetCat(wasOn ? "all" : key);
        if (!wasOn) b.classList.add("is-on");
        var head = $("#collection");
        if (head && head.getBoundingClientRect().top < -80) {
          head.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  /* ------------------------------------------------------- instant search */
  var fuse = null;

  function index() {
    var all = catalogue();
    if (typeof window.Fuse !== "function") return null;
    if (!fuse) {
      fuse = new window.Fuse(all, {
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: "name", weight: 0.62 },
          { name: "cat", weight: 0.14 },
          { name: "short", weight: 0.12 },
          { name: "fabric", weight: 0.07 },
          { name: "fit", weight: 0.05 }
        ]
      });
    }
    return fuse;
  }

  function hitHTML(p) {
    return (
      '<a class="fp-hit" href="#p=' + p.id + '" data-hit="' + p.id + '">' +
        '<span class="fp-hit__pic"><img src="' + imgOf(p) + '" alt="" loading="lazy" decoding="async"></span>' +
        '<span class="fp-hit__body"><b>' + esc(p.name) + "</b>" +
          "<span>" + esc(labelOf(p.cat)) + " \u00b7 " + esc(p.fabric || p.short || "Free alteration") + "</span></span>" +
        '<span class="fp-hit__price">' + rupee(p.price) + "</span>" +
      "</a>"
    );
  }

  function paintRecentSearches() {
    var box = $("#fpSearches");
    if (!box) return;
    var terms = read(LS_SEARCH, []);
    if (!terms.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p class="fp-s__label">Recent searches</p><div class="fp-s__chips">' +
      terms.map(function (t) {
        return '<button type="button" class="fp-chip" data-term="' + esc(t) + '">' + esc(t) + "</button>";
      }).join("") + "</div>";
    $$("[data-term]", box).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var input = $("#fpSearchInput");
        if (!input) return;
        input.value = b.getAttribute("data-term");
        run();
      });
    });
  }

  function remember(term) {
    term = String(term || "").trim();
    if (term.length < 2) return;
    var terms = read(LS_SEARCH, []).filter(function (t) {
      return String(t).toLowerCase() !== term.toLowerCase();
    });
    terms.unshift(term);
    write(LS_SEARCH, terms.slice(0, 6));
    paintRecentSearches();
  }

  function run() {
    var input = $("#fpSearchInput");
    var out = $("#fpResults");
    if (!input || !out) return;
    var q = input.value.trim();
    var all = catalogue();

    if (q.length < 2) {
      out.innerHTML = '<p class="fp-s__label">All ' + all.length + " pieces</p>" +
        '<div class="fp-s__chips">' + CATS.map(function (c) {
          var n = all.filter(function (p) { return (p.cat || "drop") === c.key; }).length;
          return n ? '<button type="button" class="fp-chip" data-cat="' + c.key + '">' + labelOf(c.key) + " " + n + "</button>" : "";
        }).join("") + "</div>";
      $$("[data-cat]", out).forEach(function (b) {
        b.addEventListener("click", function () {
          var key = b.getAttribute("data-cat");
          closeSearch();
          if (typeof window.__mwSetCat === "function") window.__mwSetCat(key);
          $$(".fp-cat").forEach(function (x) {
            x.classList.toggle("is-on", x.getAttribute("data-cat") === key);
          });
        });
      });
      return;
    }

    var idx = index();
    var hits = idx ? idx.search(q).slice(0, 8).map(function (r) { return r.item; }) : [];
    if (!hits.length) {
      out.innerHTML =
        '<div class="fp-none"><p>Nothing called \u201c' + esc(q) + "\u201d on the racks right now.</p>" +
        "<p>Tell us what you want on WhatsApp \u2014 we will check the store and send photos.</p>" +
        '<a class="btn btn--wa" href="https://wa.me/' + WA + "?text=" +
        encodeURIComponent("Hi Men's Wear! I am looking for: " + q + ". Please send photos and the price.") +
        '" target="_blank" rel="noopener">Ask the store</a></div>';
      return;
    }
    out.innerHTML = '<p class="fp-s__label">' + hits.length + (hits.length === 1 ? " match" : " matches") + "</p>" +
      hits.map(hitHTML).join("");
    $$("[data-hit]", out).forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var id = a.getAttribute("data-hit");
        remember(q);
        closeSearch();
        openProduct(id);
      });
    });
  }

  function openSearch() {
    var box = $("#fpSearch");
    if (!box) return;
    box.hidden = false;
    document.body.classList.add("is-locked");
    paintRecentSearches();
    run();
    var input = $("#fpSearchInput");
    if (input) {
      input.value = "";
      setTimeout(function () { input.focus({ preventScroll: true }); }, 40);
    }
  }

  function closeSearch() {
    var box = $("#fpSearch");
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove("is-locked");
    var btn = $("#fpSearchBtn");
    if (btn) btn.focus({ preventScroll: true });
  }

  function wireSearch() {
    var box = $("#fpSearch");
    var input = $("#fpSearchInput");
    if (!box || !input) return;

    var btn = $("#fpSearchBtn");
    if (btn) btn.addEventListener("click", function (e) { e.preventDefault(); openSearch(); });
    $$("[data-fp-close]", box).forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); closeSearch(); });
    });
    input.addEventListener("input", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
      if (e.key === "Enter") {
        e.preventDefault();
        var first = $("#fpResults [data-hit]");
        if (first) { remember(input.value); first.click(); }
      }
      if (e.key === "ArrowDown") {
        var f = $("#fpResults [data-hit]");
        if (f) { e.preventDefault(); f.focus(); }
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSearch();
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) &&
          !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) {
        e.preventDefault();
        openSearch();
      }
    });
    box.addEventListener("click", function (e) {
      if (e.target === box) closeSearch();
    });
  }

  /* ------------------------------------------------------ recently viewed */
  function paintRecent() {
    var rail = $("#fpRecent");
    var section = $("#fpRecentSection");
    if (!rail) return;
    var all = window.__MW_PRODUCTS || {};
    var ids = read(LS_VIEWED, []).filter(function (id) { return all[id]; }).slice(0, 8);
    if (!ids.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    rail.innerHTML = ids.map(function (id) {
      var p = all[id];
      return (
        '<button type="button" class="fp-rv" data-rv="' + id + '">' +
          '<span class="fp-rv__pic"><img src="' + imgOf(p) + '" alt="" loading="lazy" decoding="async"></span>' +
          '<span class="fp-rv__name">' + esc(p.name) + "</span>" +
          '<span class="fp-rv__price">' + rupee(p.price) + "</span>" +
        "</button>"
      );
    }).join("");
    $$("[data-rv]", rail).forEach(function (b) {
      b.addEventListener("click", function () { openProduct(b.getAttribute("data-rv")); });
    });
  }

  function noteView(id) {
    var ids = read(LS_VIEWED, []).filter(function (x) { return x !== id; });
    ids.unshift(id);
    write(LS_VIEWED, ids.slice(0, 8));
  }

  /* --------------------------------------------------- you may also like */
  function paintSimilar(id) {
    var info = $("#sheetInfo");
    var cur = (window.__MW_PRODUCTS || {})[id];
    if (!info || !cur) return;
    var old = $("#fpSimilar", info);
    if (old) old.remove();

    var all = catalogue().filter(function (p) { return p.id !== id; });
    var same = all.filter(function (p) { return p.cat === cur.cat; })
      .sort(function (a, b) { return Math.abs(a.price - cur.price) - Math.abs(b.price - cur.price); });
    var near = all.filter(function (p) { return p.cat !== cur.cat; })
      .sort(function (a, b) {
        if (a.cat === cur.cat) return -1;
        return Math.abs(a.price - cur.price) - Math.abs(b.price - cur.price);
      });
    var picks = same.concat(near).slice(0, 3);
    if (!picks.length) return;

    var wrap = document.createElement("div");
    wrap.className = "fp-sim";
    wrap.id = "fpSimilar";
    wrap.innerHTML = '<p class="fp-sim__t">You may also like</p><div class="fp-sim__rail">' +
      picks.map(function (p) {
        return (
          '<button type="button" class="fp-sim__card" data-sim="' + p.id + '">' +
            '<span class="fp-sim__pic"><img src="' + imgOf(p) + '" alt="" loading="lazy" decoding="async"></span>' +
            '<span class="fp-sim__name">' + esc(p.name) + "</span>" +
            '<span class="fp-sim__price">' + rupee(p.price) + "</span>" +
          "</button>"
        );
      }).join("") + "</div>";
    info.appendChild(wrap);
    $$("[data-sim]", wrap).forEach(function (b) {
      b.addEventListener("click", function () { openProduct(b.getAttribute("data-sim")); });
    });
  }

  /* --------------------------------------------------------- photo zoom */
  var zoom = null;
  function wireZoom() {
    var img = $("#sheetImg");
    if (!img || typeof window.mediumZoom !== "function") return;
    try {
      if (!zoom) {
        zoom = window.mediumZoom({ background: "rgba(12,12,10,.92)", margin: 24, scrollOffset: 40 });
      }
      zoom.detach();
      zoom.attach(img);
    } catch (e) {}
  }

  /* ------------------------------------------------------ pincode / delivery */
  function mountPincode() {
    var panel = $(".bag__panel");
    if (!panel || $("#fpPin")) return;
    var box = document.createElement("div");
    box.className = "fp-pin";
    box.innerHTML =
      '<p class="fp-pin__t">Delivery</p>' +
      '<form class="fp-pin__f" id="fpPin" novalidate>' +
        '<input id="fpPinInput" type="text" inputmode="numeric" maxlength="6" placeholder="Enter pincode" aria-label="Delivery pincode" autocomplete="postal-code">' +
        "<button type=\"submit\">Check</button>" +
      "</form>" +
      '<p class="fp-pin__r" id="fpPinOut" aria-live="polite">Free delivery inside Nawada district. Outside, it goes by courier.</p>';
    var wish = panel.querySelector(".bag__wish");
    if (wish) panel.insertBefore(box, wish); else panel.appendChild(box);

    var form = $("#fpPin", box);
    var input = $("#fpPinInput", box);
    var out = $("#fpPinOut", box);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pin = String(input.value || "").replace(/\D/g, "");
      if (pin.length !== 6) {
        out.innerHTML = "Six digits, please \u2014 that is the whole pincode.";
        out.className = "fp-pin__r is-warn";
        return;
      }
      if (pin.indexOf("805") === 0) {
        out.innerHTML = "<b>Free delivery</b> in Nawada district \u00b7 " + esc(pin) +
          ". Alteration takes 2\u20134 days, so tell us the function date early.";
        out.className = "fp-pin__r is-ok";
      } else {
        out.innerHTML = "<b>Courier</b> to " + esc(pin) +
          ". The charge is shared with the order \u2014 " +
          '<a href="https://wa.me/' + WA + "?text=" +
          encodeURIComponent("Hi Men's Wear! What is the courier charge to pincode " + pin + "?") +
          '" target="_blank" rel="noopener">confirm the exact amount on WhatsApp</a>.';
        out.className = "fp-pin__r is-info";
      }
    });
  }

  /* ------------------------------------------------------------- wiring */
  function wire() {
    paintCats();
    wireSearch();
    mountPincode();
    paintRecent();
    wireZoom();

    /* shop.js dispatches on window, so listen there, not on document */
    window.addEventListener("mw:product-open", function (e) {
      var id = e.detail && e.detail.id;
      if (!id) return;
      noteView(id);
      paintRecent();
      setTimeout(function () { paintSimilar(id); wireZoom(); }, 80);
    });

    window.addEventListener("mw:catalogue", function () {
      fuse = null;
      paintCats();
      paintRecent();
    });

    /* the layout adds the tiles late on slow connections — repaint once more */
    window.addEventListener("load", function () { paintCats(); paintRecent(); });
  }

  window.__mwShopPlus = { openSearch: openSearch, closeSearch: closeSearch, paintCats: paintCats };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
