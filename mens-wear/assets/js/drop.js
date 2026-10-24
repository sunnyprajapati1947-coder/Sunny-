/* ==========================================================================
   MEN'S WEAR — DROP 01 · hanger stage
   One garment large, the rest on the rail below. The stage rotates itself
   (slow, pausable), accepts swipe / arrows / dots, and keeps FRONT/BACK.
   Data comes from assets/js/drop-data.js (window.__MW_DROP).
   ========================================================================== */
(function () {
  "use strict";

  var AUTO_MS = 4200;          /* how long each piece stays on stage */
  var HOLD_AFTER_TAP = 12000;  /* auto-rotate waits this long after a tap */

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function data() {
    return (window.__MW_DROP || []).filter(Boolean);
  }
  function rupee(n) {
    return "\u20B9" + Number(n).toLocaleString("en-IN");
  }

  var rail = document.getElementById("gzRail");
  if (!rail) return;

  var nameEl = document.getElementById("gzName");
  var metaEl = document.getElementById("gzMeta");
  var availEl = document.getElementById("gzAvail");
  var toggleEl = document.getElementById("gzToggle");
  var stageEl = document.getElementById("gzStage");
  var frameEl = document.getElementById("gzFrame");
  var layerA = document.getElementById("gzStageA");
  var layerB = document.getElementById("gzStageB");
  var dotsEl = document.getElementById("gzDots");
  var indexNo = document.getElementById("gzIndexNo");
  var indexTotal = document.getElementById("gzIndexTotal");
  var prevBtn = document.getElementById("gzPrev");
  var nextBtn = document.getElementById("gzNext");

  var pieces = [];
  var current = 0;
  var face = 0;
  var active = 0;
  var pausedUntil = 0;
  var hovering = false;
  var timer = null;
  var inView = true;

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function imgOf(p) {
    return p.imgs && p.imgs[face] ? p.imgs[face] : (p.imgs && p.imgs[0]) || "";
  }
  function hold(ms) {
    pausedUntil = Date.now() + (ms || HOLD_AFTER_TAP);
  }

  /* ------------------------------------------------------------------ build */
  function build() {
    pieces = data();
    if (!pieces.length) return false;

    var hangs = pieces
      .map(function (p, i) {
        return (
          '<button class="gz-hang" type="button" role="tab" data-gz="' + i + '" aria-selected="' +
          (i === 0 ? "true" : "false") + '" aria-label="' + p.name + '">' +
          '<img src="' + p.imgs[0] + '" alt="' + p.name + '" width="200" height="250" loading="' +
          (i < 4 ? "eager" : "lazy") + '" decoding="async">' +
          "</button>"
        );
      })
      .join("");
    rail.innerHTML = hangs;

    if (dotsEl) {
      dotsEl.innerHTML = pieces
        .map(function (p, i) {
          return '<button type="button" role="tab" data-gz="' + i + '" aria-label="' + p.name +
            '" aria-selected="' + (i === 0 ? "true" : "false") + '"></button>';
        })
        .join("");
    }
    if (indexTotal) indexTotal.textContent = pad(pieces.length);

    return true;
  }

  /* ------------------------------------------------------------------ paint */
  function paint() {
    var p = pieces[current];
    if (!p) return;

    var src = imgOf(p);
    var showing = active === 0 ? layerB : layerA;
    var hiding = active === 0 ? layerA : layerB;

    if (showing && src) {
      showing.src = src;
      showing.alt = p.name + (face === 1 ? " — back" : " — front");
      showing.classList.add("is-on");
    }
    if (hiding) {
      hiding.classList.remove("is-on");
      hiding.setAttribute("aria-hidden", "true");
    }
    if (showing) showing.removeAttribute("aria-hidden");
    active = 1 - active;

    if (nameEl) nameEl.textContent = p.name;
    if (metaEl) metaEl.textContent = "Drop 01 \u00B7 " + rupee(p.price) + " \u00B7 Free alteration";
    if (indexNo) indexNo.textContent = pad(current + 1);
    if (availEl) {
      availEl.setAttribute("href", "#p=" + p.id);
      availEl.setAttribute("data-gz-open", p.id);
    }

    var hasBack = p.imgs && p.imgs.length > 1;
    if (toggleEl) {
      toggleEl.setAttribute("data-single", hasBack ? "0" : "1");
      Array.prototype.forEach.call(toggleEl.querySelectorAll("button[data-face]"), function (b) {
        var isBack = b.getAttribute("data-face") === "back";
        b.disabled = !hasBack;
        var on = hasBack && isBack === (face === 1);
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    var hangs = rail.querySelectorAll(".gz-hang");
    Array.prototype.forEach.call(hangs, function (el, i) {
      var d = Math.abs(i - current) / Math.max(1, pieces.length - 1);
      var scale = i === current ? 1 : 0.6 + 0.22 * (1 - d);
      el.classList.toggle("is-on", i === current);
      el.setAttribute("aria-selected", i === current ? "true" : "false");
      el.style.setProperty("--gz-scale", scale.toFixed(2));
    });

    if (dotsEl) {
      Array.prototype.forEach.call(dotsEl.children, function (b, i) {
        b.classList.toggle("is-on", i === current);
        b.setAttribute("aria-selected", i === current ? "true" : "false");
      });
    }

    /* keep the active hanger visible in the sideways rail on small screens */
    var activeHang = hangs[current];
    if (activeHang && typeof activeHang.scrollIntoView === "function") {
      try {
        activeHang.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      } catch (e) {}
    }

    /* next photo warms up quietly */
    var upcoming = pieces[(current + 1) % pieces.length];
    if (upcoming && upcoming.imgs && upcoming.imgs[0]) {
      var pre = new Image();
      pre.src = upcoming.imgs[0];
    }
  }

  /* --------------------------------------------------------------- controls */
  function go(index, opts) {
    if (!pieces.length) return;
    var n = pieces.length;
    current = ((index % n) + n) % n;
    face = 0;
    if (!opts || !opts.silent) hold();
    paint();
  }
  function step(dir) {
    go(current + dir);
  }

  /* ------------------------------------------------------------- auto-play */
  function canAuto() {
    if (reduceMotion) return false;
    if (document.hidden) return false;
    if (hovering) return false;
    if (!inView) return false;
    if (Date.now() < pausedUntil) return false;
    return pieces.length > 1;
  }
  function startAuto() {
    if (timer) return;
    timer = setInterval(function () {
      if (!canAuto()) return;
      go(current + 1, { silent: true });
    }, AUTO_MS);
  }

  function bind() {
    rail.addEventListener("click", function (e) {
      var b = e.target.closest("[data-gz]");
      if (!b) return;
      go(+b.getAttribute("data-gz"));
    });

    if (dotsEl) {
      dotsEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-gz]");
        if (!b) return;
        go(+b.getAttribute("data-gz"));
      });
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { step(1); });

    if (toggleEl) {
      toggleEl.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-face]");
        if (!b || b.disabled) return;
        face = b.getAttribute("data-face") === "back" ? 1 : 0;
        hold();
        paint();
      });
    }

    /* the whole garment is the "see availability" target */
    if (frameEl) {
      frameEl.addEventListener("click", function () {
        var p = pieces[current];
        if (!p) return;
        var opener = document.querySelector('[data-open="' + p.id + '"]');
        if (opener) opener.click();
      });
    }

    if (availEl) {
      availEl.addEventListener("click", function (e) {
        var id = availEl.getAttribute("data-gz-open");
        var opener = document.querySelector('[data-open="' + id + '"]');
        if (opener) {
          e.preventDefault();
          opener.click();
        }
      });
    }

    /* pause while the visitor is looking at it */
    if (stageEl) {
      stageEl.addEventListener("pointerenter", function () { hovering = true; });
      stageEl.addEventListener("pointerleave", function () { hovering = false; });
      stageEl.addEventListener("focusin", function () { hold(); });
      stageEl.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      });

      /* swipe */
      var sx = 0, sy = 0, tracking = false;
      stageEl.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse") return;
        tracking = true;
        sx = e.clientX;
        sy = e.clientY;
      });
      stageEl.addEventListener("pointerup", function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.clientX - sx;
        var dy = e.clientY - sy;
        if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy)) return;
        step(dx < 0 ? 1 : -1);
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) hovering = false;
    });

    if ("IntersectionObserver" in window && stageEl) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { inView = en.isIntersecting; });
      }, { threshold: 0.25 }).observe(stageEl);
    }
  }

  /* ------------------------------------------------------------------ start */
  var tries = 0;
  function start() {
    if (!data().length && tries < 50) {
      tries++;
      setTimeout(start, 100);
      return;
    }
    if (!build()) return;
    bind();
    paint();
    startAuto();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
