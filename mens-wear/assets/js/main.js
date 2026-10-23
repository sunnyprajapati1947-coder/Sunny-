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
  var REMOTE_IMG_BASE =
    "https://raw.githubusercontent.com/sunnyprajapati1947-coder/Sunny-/arena/42c450ee-sunny/mens-wear/assets/img/";
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
     2. Preloader
     ---------------------------------------------------------------------- */
  function initLoader() {
    var loader = $("#loader");
    if (!loader) return;

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      loader.classList.add("is-done");
      document.body.classList.remove("is-locked");
      window.setTimeout(function () {
        loader.style.display = "none";
      }, 900);
      revealAboveFold();
    }

    document.body.classList.add("is-locked");
    window.addEventListener("load", function () { window.setTimeout(finish, 380); });
    // Never keep the visitor waiting, whatever happens with assets.
    window.setTimeout(finish, 2600);
  }

  /* Reveal whatever is already in view as soon as the loader clears. */
  function revealAboveFold() {
    $$("[data-reveal]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) el.classList.add("in");
    });
  }

  /* -------------------------------------------------------------------------
     3. Scroll reveal
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
     4. Header state + scroll spy
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
     5. Mobile drawer
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
     6. Collection filters
     ---------------------------------------------------------------------- */
  function initFilters() {
    var filters = $$(".filter");
    var cards = $$("#productGrid .card");
    if (!filters.length || !cards.length) return;

    filters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.getAttribute("data-filter");

        filters.forEach(function (f) {
          f.classList.toggle("is-active", f === btn);
          f.setAttribute("aria-selected", f === btn ? "true" : "false");
        });

        cards.forEach(function (card, i) {
          var show = cat === "all" || card.getAttribute("data-cat") === cat;
          card.style.display = show ? "" : "none";
          if (show && !reduceMotion) {
            card.style.animation = "none";
            // force reflow so the entrance animation replays on filter change
            void card.offsetWidth;
            card.style.animation = "cardIn .5s cubic-bezier(.16,1,.3,1) " + (i * 0.045) + "s both";
          }
        });
      });
    });
  }

  /* -------------------------------------------------------------------------
     7. Animated counters
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
     8. 3D tilt on cards / craft panel  (pointer devices only)
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
     9. Hero photo parallax
     ---------------------------------------------------------------------- */
  function initHeroParallax() {
    var frame = $("#heroFrame");
    var hero = $(".hero");
    if (!frame || !hero || reduceMotion) return;

    if (finePointer) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        frame.style.transform =
          "perspective(1200px) rotateY(" + (px * -6).toFixed(2) + "deg) rotateX(" +
          (py * 5).toFixed(2) + "deg) translateZ(0)";
      });
      hero.addEventListener("pointerleave", function () { frame.style.transform = ""; });
    }

    // gentle float on scroll
    var raf = false;
    window.addEventListener("scroll", function () {
      if (raf) return;
      raf = true;
      window.requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, window.innerHeight);
        var img = $(".hero__img", frame);
        if (img) img.style.translate = "0 " + (y * 0.06).toFixed(1) + "px";
        raf = false;
      });
    }, { passive: true });
  }

  /* -------------------------------------------------------------------------
     10. Misc: year, image error safety
     ---------------------------------------------------------------------- */
  function initMisc() {
    var year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    // Photos: if a local copy is unavailable, retry once from the project CDN.
    // Only if that also fails do we fall back to a quiet gradient placeholder.
    $$("img").forEach(function (img) {
      img.addEventListener("error", function () {
        var src = img.getAttribute("src") || "";
        if (!img.dataset.remote && src && src.indexOf("http") !== 0) {
          img.dataset.remote = "1";
          img.src = REMOTE_IMG_BASE + src.split("/").pop();
          return;
        }
        img.style.opacity = "0";
        var media = img.closest(".card__media, .hero__frame, .craft__card");
        if (media) media.style.background = "linear-gradient(140deg,#141419,#0b0b0e)";
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    buildWhatsAppLinks();
    initLoader();
    initReveals();
    initHeader();
    initDrawer();
    initFilters();
    initTilt();
    initHeroParallax();
    initMisc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
