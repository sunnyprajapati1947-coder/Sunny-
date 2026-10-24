/* ==========================================================================
   MEN'S WEAR — the luxe layer
   Motion that reads as expensive rather than busy: a thin scroll rail, cards
   that lean towards the pointer, buttons that pull, a headline that assembles
   itself, and an accent that drifts between three tones as you scroll. All of
   it is switched off when the visitor asks for reduced motion.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------------------------ scroll rail */
  function rail() {
    var el = document.createElement("div");
    el.className = "luxe__progress";
    el.innerHTML = '<i></i>';
    document.body.appendChild(el);
    var bar = el.firstChild;
    function paint() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      bar.style.transform = "scaleX(" + p + ")";
    }
    window.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint);
    paint();
  }

  /* -------------------------------------------------- words that assemble */
  function splitHeadlines() {
    var heads = document.querySelectorAll(".h2, .hero__title, .fit__h");
    [].slice.call(heads).forEach(function (h) {
      if (h.getAttribute("data-split")) return;
      h.setAttribute("data-split", "1");
      var walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      var n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var words = node.nodeValue.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        words.forEach(function (w) {
          if (!w.trim()) return frag.appendChild(document.createTextNode(w));
          var span = document.createElement("span");
          span.className = "luxe__word";
          span.textContent = w;
          frag.appendChild(span);
        });
        node.parentNode.replaceChild(frag, node);
      });
    });
  }

  function revealWords() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var words = e.target.querySelectorAll(".luxe__word");
        [].slice.call(words).forEach(function (w, i) {
          w.style.transitionDelay = (i * 45) + "ms";
          w.classList.add("is-in");
        });
        io.unobserve(e.target);
      });
    }, { threshold: 0.25 });
    [].slice.call(document.querySelectorAll("[data-split]")).forEach(function (h) { io.observe(h); });
  }

  /* ------------------------------------------------------------- tilt cards */
  function tilt() {
    if (!fine) return;
    var cards = [].slice.call(document.querySelectorAll(".pcard, .trend__card, .fit__opt"));
    cards.forEach(function (card) {
      if (card.getAttribute("data-tilt")) return;
      card.setAttribute("data-tilt", "1");
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--tx", (y * -4).toFixed(2) + "deg");
        card.style.setProperty("--ty", (x * 5).toFixed(2) + "deg");
        card.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--tx", "0deg");
        card.style.setProperty("--ty", "0deg");
      });
    });
  }

  /* ---------------------------------------------------------- accent drift */
  var ACCENTS = ["#c8f24d", "#d7b46a", "#8fb7a1"];
  function accentDrift() {
    var i = 0;
    function step() {
      i = (i + 1) % ACCENTS.length;
      document.documentElement.style.setProperty("--luxe-accent", ACCENTS[i]);
    }
    step();
    window.setInterval(step, 14000);
  }

  /* -------------------------------------------------------- live dot sweep */
  function markLive() {
    [].slice.call(document.querySelectorAll(".live-dot")).forEach(function (d) {
      d.classList.add("is-on");
    });
  }

  function boot() {
    markLive();
    if (reduce) return;
    rail();
    splitHeadlines();
    revealWords();
    tilt();
    accentDrift();
    /* re-tilt and re-split after the catalogue repaints */
    window.addEventListener("mw:catalogue", function () {
      splitHeadlines();
      tilt();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
