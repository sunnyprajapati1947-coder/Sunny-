/* ==========================================================================
   MEN'S WEAR — DROP 01 · hanger rail
   Builds the hero rail from window.__MW_DROP (assets/js/drop-data.js).
   Click a piece → it comes forward on the rail, name + price update below,
   "See availability" opens that piece's real detail sheet.
   ========================================================================== */
(function () {
  "use strict";

  var FEATURED = [
    "distressed-tank",
    "baggy-jeans",
    "varsity-cream",
    "oversized-tee",
    "cargo-olive",
    "hoodie-bone",
    "bowling-shirt",
    "cord-overshirt"
  ];

  function data() {
    return (window.__MW_DROP || []).filter(Boolean);
  }
  function byId(id) {
    var list = data();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function rupee(n) { return "\u20B9" + n.toLocaleString("en-IN"); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  var rail, nameEl, metaEl, availEl, toggleEl, pieces = [];
  var current = 0;
  var face = 0;

  function imgOf(p) { return p.imgs[face] || p.imgs[0]; }

  function build() {
    rail = document.getElementById("gzRail");
    if (!rail || !data().length) return;
    nameEl = document.getElementById("gzName");
    metaEl = document.getElementById("gzMeta");
    availEl = document.getElementById("gzAvail");
    toggleEl = document.getElementById("gzToggle");

    pieces = FEATURED.map(byId).filter(Boolean);
    var total = pieces.length;

    rail.innerHTML = pieces.map(function (p, i) {
      // pieces shrink as they move away from the active one — like a real rail
      var d = Math.abs(i - current) / Math.max(1, total - 1);
      var scale = i === current ? 1 : 0.62 + 0.2 * (1 - d);
      return '' +
        '<button type="button" class="gz-hang' + (i === current ? " is-on" : "") + '" role="tab" ' +
        'aria-selected="' + (i === current) + '" data-gz="' + i + '" ' +
        'aria-label="' + esc(p.name) + '" style="--gz-scale:' + scale.toFixed(2) + '">' +
        '<img src="' + p.imgs[0] + '" alt="" width="400" height="500" ' +
        'loading="' + (i < 4 ? "eager" : "lazy") + '" decoding="async">' +
        "</button>";
    }).join("");

    paint();
  }

  function paint() {
    var p = pieces[current];
    if (!p) return;
    var hangers = rail.querySelectorAll(".gz-hang");
    hangers.forEach(function (el, i) {
      var d = Math.abs(i - current) / Math.max(1, pieces.length - 1);
      var scale = i === current ? 1 : 0.62 + 0.2 * (1 - d);
      el.classList.toggle("is-on", i === current);
      el.setAttribute("aria-selected", i === current ? "true" : "false");
      el.style.setProperty("--gz-scale", scale.toFixed(2));
      var im = el.querySelector("img");
      if (im && i === current) im.src = imgOf(p);
    });

    nameEl.textContent = p.name;
    metaEl.textContent = "Drop 01 \u00B7 " + rupee(p.price) + " \u00B7 Free alteration";
    availEl.setAttribute("href", "#p=" + p.id);
    availEl.setAttribute("data-gz-open", p.id);

    var hasBack = p.imgs.length > 1;
    toggleEl.setAttribute("data-single", hasBack ? "0" : "1");
    toggleEl.querySelectorAll("button[data-face]").forEach(function (b) {
      var isBack = b.getAttribute("data-face") === "back";
      b.disabled = !hasBack;
      b.classList.toggle("is-on", hasBack && isBack === (face === 1));
      b.setAttribute("aria-pressed", hasBack && isBack === (face === 1) ? "true" : "false");
    });
  }

  function boot() {
    build();
    if (!rail) return;

    rail.addEventListener("click", function (e) {
      var b = e.target.closest("[data-gz]");
      if (!b) return;
      current = +b.getAttribute("data-gz");
      face = 0;
      paint();
    });

    rail.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      current = Math.min(pieces.length - 1, Math.max(0, current + (e.key === "ArrowRight" ? 1 : -1)));
      face = 0;
      paint();
      var el = rail.querySelectorAll(".gz-hang")[current];
      if (el) el.focus({ preventScroll: true });
    });

    toggleEl.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-face]");
      if (!b || b.disabled) return;
      face = b.getAttribute("data-face") === "back" ? 1 : 0;
      paint();
    });

    availEl.addEventListener("click", function (e) {
      var id = availEl.getAttribute("data-gz-open");
      var opener = document.querySelector('[data-open="' + id + '"]');
      if (opener) {
        e.preventDefault();
        opener.click();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
