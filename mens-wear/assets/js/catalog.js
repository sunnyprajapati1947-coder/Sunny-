/* ==========================================================================
   MEN'S WEAR — live catalogue
   The drop is not a frozen page any more.

   - The owner edits a piece (price, badge, hide, new arrival) and the change
     is written to Supabase. Every open shop hears it over realtime and repaints
     the card, the filters and the Fit Room without a refresh.
   - "Trending" is built from real views this week (product_view_counts), never
     from a hand-written list. Empty weeks say so instead of inventing numbers.
   - Only clothing is sold: accessories that belong to the groom package
     (mojari, safa, kalgi, brooch) stay out of the shop grid and the Fit Room.
   ========================================================================== */
(function () {
  "use strict";

  var SUPABASE_URL = "https://zneqxctfhwehiuzibjnc.supabase.co";
  var SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZXF4Y3RmaHdlaGl1emliam5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MDEzNTYsImV4cCI6MjEwODM3NzM1Nn0.LbGmxwyrbFe4kw2pTn9jJZ910YX9JGGndScxnrKhMAQ";

  var ACCESSORY = /mojari|safa|kalgi|brooch|turban|dupatta|stole/i;
  var db = null;
  var started = false;

  function client() {
    if (db) return db;
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) return null;
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return db;
  }

  function seed() {
    return window.__MW_PRODUCTS || {};
  }

  function normalise(row, base) {
    var p = Object.assign({}, base || {}, row);
    /* keep the shape the rest of the site expects */
    if (!p.imgs) p.imgs = base && base.imgs ? base.imgs : [];
    if (!p.cols) p.cols = base && base.cols ? base.cols : [];
    if (!p.sizes) p.sizes = base && base.sizes ? base.sizes : ["S", "M", "L", "XL", "XXL"];
    if (row.descr) p.desc = row.descr;
    p.kind = p.kind || (ACCESSORY.test(p.name || "") ? "accessory" : "clothing");
    return p;
  }

  /* -------------------------------------------------------------- catalogue */
  /* Overlay, never replace: the owner only ever writes the pieces they touch.
     A row that exists in Supabase sits on top of the built-in drop; every piece
     the owner has not touched keeps showing exactly as it shipped. Hidden rows
     are the one thing that removes a piece from the shop. */
  function merge(rows) {
    var catalogue = seed();
    var hidden = {};
    var hiddenRows = {};
    (rows || []).forEach(function (row) {
      if (!row || !row.id) return;
      if (row.hidden) {
        /* kept aside, not rendered: the owner still needs it to un-hide it */
        hiddenRows[row.id] = normalise(row, catalogue[row.id]);
        delete catalogue[row.id];
        return;
      }
      catalogue[row.id] = normalise(row, catalogue[row.id]);
    });
    window.__MW_PRODUCTS = catalogue;
    window.__MW_HIDDEN = hiddenRows;
    writeHiddenCache(Object.keys(hiddenRows));
    return catalogue;
  }

  var HIDDEN_KEY = "mw.hidden.v1";

  function readHiddenCache() {
    try {
      var raw = window.localStorage.getItem(HIDDEN_KEY);
      var ids = raw ? JSON.parse(raw) : [];
      return Object.prototype.toString.call(ids) === "[object Array]" ? ids : [];
    } catch (e) { return []; }
  }

  function writeHiddenCache(ids) {
    try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  /* apply the last known hide-list before the network answers */
  function applyHiddenCache() {
    var cat = seed();
    readHiddenCache().forEach(function (id) {
      if (cat[id]) delete cat[id];
    });
  }

  function repaint() {
    if (typeof window.__mwRebuildGrid === "function") window.__mwRebuildGrid();
    try {
      window.dispatchEvent(new CustomEvent("mw:catalogue"));
    } catch (e) {}
  }

  function load() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c
      .from("products")
      .select("id,name,cat,price,imgs,cols,sizes,sold,short,descr,fabric,fit,occasion,care,kind,badge,hidden,sort,updated_at")
      .order("sort", { ascending: true })
      .then(function (res) {
        if (!res || res.error) {
          repaint(); /* offline: the built-in drop still renders, just not live */
          return null;
        }
        var map = res.data && res.data.length ? merge(res.data) : (window.__MW_PRODUCTS || {});
        repaint();
        return map;
      })
      .catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ views */
  function noteView(id) {
    var c = client();
    if (!c || !id) return;
    c.from("product_views").insert({ product_id: id }).then(function () {}).catch(function () {});
  }

  function trending() {
    var c = client();
    if (!c) return Promise.resolve([]);
    return c
      .from("product_view_counts")
      .select("product_id,views")
      .order("views", { ascending: false })
      .limit(8)
      .then(function (res) {
        if (!res || res.error || !res.data) return [];
        return res.data;
      })
      .catch(function () { return []; });
  }

  function rail() {
    var el = document.getElementById("trendRail");
    if (!el) return;
    var box = window.__MW_PRODUCTS || {};
    trending().then(function (rows) {
      var items = rows
        .map(function (r) {
          var p = box[r.product_id];
          if (!p) return null;
          if (p.kind === "accessory" || ACCESSORY.test(p.name || "")) return null;
          return { p: p, v: r.views };
        })
        .filter(Boolean)
        .slice(0, 6);

      var note = document.getElementById("trendNote");
      if (!items.length) {
        el.innerHTML = "";
        var wrap = document.getElementById("trendLive");
        if (wrap) wrap.hidden = true;
        return;
      }
      var wrap2 = document.getElementById("trendLive");
      if (wrap2) wrap2.hidden = false;
      if (note) note.textContent = "Ranked by real views this week — updated as people browse.";
      el.innerHTML = items
        .map(function (it, i) {
          var img = (it.p.imgs && it.p.imgs[0]) || "";
          if (img && img.indexOf("http") !== 0) img = (window.__MW_BASE || "") + img;
          return (
            '<a class="trend__card" href="#p=' + it.p.id + '" data-trend="' + it.p.id + '">' +
              '<span class="trend__rank">' + String(i + 1).padStart(2, "0") + "</span>" +
              '<span class="trend__pic"><img src="' + img + '" alt="' + it.p.name + '" loading="lazy"></span>' +
              '<span class="trend__body"><b>' + it.p.name + "</b>" +
                "<span>" + (it.p.fabric || it.p.short || "") + "</span>" +
                '<i>' + Number(it.v) + (it.v === 1 ? " view" : " views") + " this week</i></span>" +
            "</a>"
          );
        })
        .join("");
      [].slice.call(el.querySelectorAll("[data-trend]")).forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          if (typeof window.__mwOpenProduct === "function") window.__mwOpenProduct(a.getAttribute("data-trend"));
        });
      });
    });
  }

  /* --------------------------------------------------------------- realtime */
  function listen() {
    var c = client();
    if (!c || !c.channel) return;
    try {
      c.channel("catalogue-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, function () {
          load().then(function () {
            if (typeof window.__mwToast === "function") window.__mwToast("The drop just updated");
            rail();
          });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "product_views" }, function () {
          rail();
        })
        .subscribe();
    } catch (e) {}
  }

  function start() {
    if (started) return;
    started = true;

    /* the shop's own catalogue object is filled by shop.js; wait for it */
    var tries = 0;
    (function ready() {
      if (!window.__MW_PRODUCTS && tries++ < 80) return window.setTimeout(ready, 120);
      /* paint from the built-in drop first: clothing only, live badges, honest
         counts — then let the owner's rows land on top when they arrive */
      applyHiddenCache();
      repaint();
      load().then(function () {
        rail();
        listen();
      });
    })();

    window.addEventListener("mw:product-open", function (e) {
      var id = e.detail && e.detail.id;
      if (id) noteView(id);
    });

    /* keep the rail honest without hammering the database */
    window.setInterval(rail, 120000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.__mwLiveCatalogue = { reload: load, trending: trending };
})();
