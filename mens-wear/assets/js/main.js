/* ==========================================================================
   MEN'S WEAR — interactions
   Vanilla JS, no dependencies.
   ========================================================================== */
(function () {
  "use strict";

  var WHATSAPP_NUMBER = "919608087035";

  /* Photos live in the project repo. When the site is served from a host that
     only receives the HTML/CSS/JS bundle, a missing photo automatically loads
     from this base instead — the visitor never sees a broken image. */
  var IMG_CDNS = [
    "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@app-v19/mens-wear/",
    "https://cdn.statically.io/gh/sunnyprajapati1947-coder/Sunny-/app-v19/mens-wear/"
  ];
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------------------------------------------------------- utils */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* -------------------------------------------------------------------------
     1. WhatsApp deep links — every [data-wa] gets a prefilled message
     so tapping "Order" lands in the shop's WhatsApp with context.
     ---------------------------------------------------------------------- */
  function buildWhatsAppLinks() {
    $$("[data-wa]").forEach(function (el) {
      var msg = el.getAttribute("data-wa") || "";
      if (!msg) return;
      el.setAttribute("href", "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    });
  }

  /* -------------------------------------------------------------------------
     2. Scroll reveal
     ---------------------------------------------------------------------- */
  function initReveals() {
    var items = $$("[data-reveal]");
    if (!items.length) return;

    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        if (entry.target.hasAttribute("data-count")) startCount(entry.target);
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.14 });

    items.forEach(function (el) { io.observe(el); });

    // counters live inside revealed blocks, observe them too
    $$("[data-count]").forEach(function (el) { io.observe(el); });
  }

  /* -------------------------------------------------------------------------
     3. Header state + scroll spy
     ---------------------------------------------------------------------- */
  function initHeader() {
    var header = $("#header");
    if (!header) return;

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle("is-scrolled", window.scrollY > 28);
        updateActiveNav();
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function updateActiveNav() {
    var sections = ["collection", "craft", "reviews", "store", "contact"];
    var offset = window.innerHeight * 0.34;
    var current = "";
    sections.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.top <= offset && r.bottom > offset) current = id;
    });
    $$(".nav a").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("href") === "#" + current);
    });
  }

  /* -------------------------------------------------------------------------
     4. Mobile drawer
     ---------------------------------------------------------------------- */
  function initDrawer() {
    var burger = $("#burger");
    var drawer = $("#drawer");
    if (!burger || !drawer) return;

    function setOpen(open) {
      burger.classList.toggle("is-open", open);
      drawer.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("is-locked", open);
    }

    burger.addEventListener("click", function () {
      setOpen(!drawer.classList.contains("is-open"));
    });
    $$("a", drawer).forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  /* -------------------------------------------------------------------------
     5. Animated counters
     ---------------------------------------------------------------------- */
  function startCount(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";

    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    if (reduceMotion) { el.textContent = target.toLocaleString("en-IN"); return; }

    var duration = 1600;
    var start = null;

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString("en-IN");
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------------------
     6. 3D tilt on cards / craft panel  (pointer devices only)
     ---------------------------------------------------------------------- */
  function initTilt() {
    if (reduceMotion || !finePointer) return;

    $$("[data-tilt]").forEach(function (el) {
      var max = 5;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          "perspective(1000px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" +
          (px * max).toFixed(2) + "deg) translateY(-4px)";
      });
      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
      });
    });

    $$("[data-tilt-soft]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          "perspective(1400px) rotateX(" + (-py * 3.4).toFixed(2) + "deg) rotateY(" +
          (px * 3.4).toFixed(2) + "deg)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  /* -------------------------------------------------------------------------
     7. Misc: year, image error safety
     ---------------------------------------------------------------------- */
  function initMisc() {
    var year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    // Photos: walk a small CDN chain before giving up, so a single outage never
    // leaves an empty card. Last resort is a quiet gradient placeholder.
    function relativeOf(src) {
      var i = src.indexOf("assets/img/");
      if (i > -1) return src.slice(i);
      return "assets/img/" + src.split("/").pop();
    }
    $$("img").forEach(function (img) {
      img.addEventListener("error", function () {
        var src = img.getAttribute("src") || "";
        if (!src) return;
        var rel = relativeOf(src);
        var next = img.dataset.cdn ? parseInt(img.dataset.cdn, 10) + 1 : 0;
        // first hop: local file that only exists in the repo -> use the CDN list
        if (src.indexOf("http") !== 0 && !img.dataset.cdn) { next = 0; }
        if (next < IMG_CDNS.length) {
          img.dataset.cdn = String(next);
          img.src = IMG_CDNS[next] + rel;
          return;
        }
        img.style.opacity = "0";
        var media = img.closest(".pcard__media, .sheet__stage, .card__media, .hero__frame, .craft__card");
        if (media) media.style.background = "linear-gradient(140deg,#141419,#0b0b0e)";
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    buildWhatsAppLinks();
    initReveals();
    initHeader();
    initDrawer();
    initTilt();
    initMisc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ==========================================================================
   FAQ accordion (v9) — one answer open at a time, keyboard friendly
   ========================================================================== */
(function () {
  "use strict";
  var items = Array.prototype.slice.call(document.querySelectorAll(".faq__item"));
  if (!items.length) return;

  items.forEach(function (item) {
    var btn = item.querySelector(".faq__q");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var open = !item.classList.contains("is-open");
      items.forEach(function (other) {
        other.classList.remove("is-open");
        var b = other.querySelector(".faq__q");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      if (open) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
})();
