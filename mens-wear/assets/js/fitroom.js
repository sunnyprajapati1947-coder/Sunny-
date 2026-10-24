/* ==========================================================================
   MEN'S WEAR — The Fit Room
   Three taps instead of twenty-six cards: occasion, budget, size. It returns a
   complete look from the real catalogue, prices it honestly, and puts the whole
   thing in one WhatsApp message. No account needed, nothing invented.
   ========================================================================== */
(function () {
  "use strict";

  var CONFIG = window.__MW_CONFIG || {};
  var WA = "https://wa.me/" + (CONFIG.whatsapp || "919608087035");

  var OCCASIONS = [
    { id: "wedding", label: "Wedding", note: "Baraat, reception, the big day", cats: ["wedding"] },
    { id: "sangeet", label: "Sangeet", note: "Cocktail night, dancing", cats: ["wedding", "ethnic"] },
    { id: "office", label: "Office", note: "Interviews, work, meetings", cats: ["formal"] },
    { id: "college", label: "College", note: "Everyday, campus, hangouts", cats: ["street", "casual"] },
    { id: "festival", label: "Festival", note: "Puja, Eid, Diwali, functions", cats: ["ethnic", "wedding"] },
    { id: "everyday", label: "Everyday", note: "Simple, clean, repeat-wear", cats: ["casual", "street"] },
  ];

  var BUDGETS = [
    { id: "u1500", label: "Under ₹1,500", cap: 1500 },
    { id: "b3k", label: "₹1,500 – ₹3,000", cap: 3000 },
    { id: "b5k", label: "₹3,000 – ₹5,000", cap: 5000 },
    { id: "b8k", label: "₹5,000 +", cap: 8000 },
  ];

  var SIZES = ["S", "M", "L", "XL", "XXL"];

  /* accessories complete a look, they do not start one */
  var ACCESSORY = /mojari|safa|kalgi|brooch|turban|stole|dupatta/i;
  var state = { occasion: null, budget: null, size: null, overBudget: false };
  var step = 0;
  var root = null;

  function products() {
    var p = window.__MW_PRODUCTS || {};
    return Object.keys(p).map(function (k) { return p[k]; });
  }
  function rupee(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function img(p) {
    var src = p && p.imgs && p.imgs[0];
    if (!src) return "";
    return /^https?:/.test(src) ? src : window.__MW_BASE + src;
  }

  /* ------------------------------------------------------------------ logic */
  function look() {
    var occ = OCCASIONS.filter(function (o) { return o.id === state.occasion; })[0];
    var bud = BUDGETS.filter(function (b) { return b.id === state.budget; })[0];
    if (!occ || !bud) return [];
    var all = products().filter(function (p) { return !ACCESSORY.test(p.name); });
    var pool = all.filter(function (p) { return occ.cats.indexOf(p.cat) !== -1; });
    if (!pool.length) pool = all.slice();

    var inBudget = pool.filter(function (p) { return p.price <= bud.cap; });
    state.overBudget = false;

    /* if the racks genuinely have nothing at this budget in this category, say
       so and show the closest real piece instead of inventing one */
    if (!inBudget.length) {
      inBudget = pool.slice().sort(function (a, b) { return a.price - b.price; }).slice(0, 1);
      state.overBudget = true;
    }

    /* the hero is the strongest piece the budget allows; the second is the
       best partner that still fits under the same ceiling */
    var hero = inBudget.slice().sort(function (a, b) { return b.price - a.price; })[0];
    var rest = inBudget
      .filter(function (p) { return p !== hero && p.price + hero.price <= bud.cap; })
      .sort(function (a, b) { return b.price - a.price; });

    if (!rest.length) {
      rest = all
        .filter(function (p) { return p !== hero && p.price + hero.price <= bud.cap && p.cat !== hero.cat; })
        .sort(function (a, b) { return a.price - b.price; });
    }

    /* keep the whole look inside the budget, not just each piece */
    var out = hero ? [hero] : [];
    var running = hero ? hero.price : 0;
    rest.forEach(function (p) {
      if (out.length >= 3) return;
      if (running + p.price <= bud.cap) {
        out.push(p);
        running += p.price;
      }
    });
    return out;
  }

  function total(list) {
    return list.reduce(function (n, p) { return n + p.price; }, 0);
  }

  function message(list) {
    var occ = OCCASIONS.filter(function (o) { return o.id === state.occasion; })[0];
    var lines = ["Hi Men's Wear! The Fit Room gave me this look:", ""];
    lines.push("Occasion: " + (occ ? occ.label : "—") + " · Size " + state.size);
    list.forEach(function (p, i) {
      lines.push(i + 1 + ". " + p.name + " — " + rupee(p.price));
    });
    lines.push("");
    lines.push("Total: " + rupee(total(list)));
    lines.push("Please confirm availability, fabric and the final price.");
    return lines.join("\n");
  }

  /* ------------------------------------------------------------------ render */
  function shell() {
    var el = document.createElement("div");
    el.className = "fr";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "The Fit Room");
    el.hidden = true;
    el.innerHTML =
      '<div class="fr__grain" aria-hidden="true"></div>' +
      '<header class="fr__bar">' +
        '<span class="fr__mark">THE FIT ROOM</span>' +
        '<span class="fr__step" id="frStep">01 / 03</span>' +
        '<button type="button" class="fr__close" aria-label="Close the Fit Room">Close</button>' +
      "</header>" +
      '<div class="fr__body" id="frBody"></div>';
    return el;
  }

  function option(label, note, active, idx) {
    return (
      '<button type="button" class="fr__opt' + (active ? " is-on" : "") + '" data-idx="' + idx + '">' +
        '<span class="fr__optno">' + String(idx + 1).padStart(2, "0") + "</span>" +
        '<span class="fr__optlabel">' + esc(label) + "</span>" +
        (note ? '<span class="fr__optnote">' + esc(note) + "</span>" : "") +
      "</button>"
    );
  }

  function paint() {
    var body = root.querySelector("#frBody");
    var stepEl = root.querySelector("#frStep");
    stepEl.textContent = "0" + (step + 1) + " / 03";

    if (step === 0) {
      body.innerHTML =
        '<p class="fr__kicker">Step one</p>' +
        '<h2 class="fr__h">Where are <em>you</em> going?</h2>' +
        '<p class="fr__lead">Tell us the occasion. We will build the look from what is actually on the racks.</p>' +
        '<div class="fr__grid">' +
          OCCASIONS.map(function (o, i) { return option(o.label, o.note, state.occasion === o.id, i); }).join("") +
        "</div>";
      bindOptions(OCCASIONS, "occasion");
    } else if (step === 1) {
      body.innerHTML =
        '<p class="fr__kicker">Step two</p>' +
        '<h2 class="fr__h">What should it <em>cost</em>?</h2>' +
        '<p class="fr__lead">Honest number, no fake MRP. Every price you see is the price in the shop.</p>' +
        '<div class="fr__grid fr__grid--tight">' +
          BUDGETS.map(function (b, i) { return option(b.label, "", state.budget === b.id, i); }).join("") +
        "</div>";
      bindOptions(BUDGETS, "budget");
    } else if (step === 2) {
      body.innerHTML =
        '<p class="fr__kicker">Step three</p>' +
        '<h2 class="fr__h">What is your <em>size</em>?</h2>' +
        '<p class="fr__lead">Alteration is free either way — this just gets us closer on the first try.</p>' +
        '<div class="fr__sizes">' +
          SIZES.map(function (s) { return option(s, "", state.size === s, SIZES.indexOf(s)); }).join("") +
        "</div>" +
        '<button type="button" class="fr__cta" id="frBuild">Build my look</button>';
      [].slice.call(body.querySelectorAll(".fr__sizes .fr__opt")).forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.size = SIZES[+btn.getAttribute("data-idx")];
          paint();
        });
      });
      body.querySelector("#frBuild").addEventListener("click", function () {
        if (!state.size) {
          if (typeof window.__mwToast === "function") window.__mwToast("Pick a size first");
          return;
        }
        step = 3;
        paint();
      });
    } else {
      var list = look();
      var sum = total(list);
      body.innerHTML =
        '<p class="fr__kicker">Your look</p>' +
        '<h2 class="fr__h">Built for <em>' + esc((OCCASIONS.filter(function (o) { return o.id === state.occasion; })[0] || {}).label || "you") + "</em></h2>" +
        '<div class="fr__look">' +
          list.map(function (p, i) {
            return (
              '<article class="fr__piece">' +
                '<div class="fr__pic"><img src="' + img(p) + '" alt="' + esc(p.name) + '" loading="lazy"></div>' +
                '<div class="fr__meta">' +
                  '<span class="fr__pno">' + String(i + 1).padStart(2, "0") + "</span>" +
                  "<h3>" + esc(p.name) + "</h3>" +
                  '<p>' + esc(p.fabric || p.short || "") + "</p>" +
                  "<b>" + rupee(p.price) + "</b>" +
                  '<a class="fr__ask" href="' + WA + "?text=" + encodeURIComponent("Hi Men's Wear! About the " + p.name + " (" + rupee(p.price) + "), size " + state.size + " — is it available?") + '" target="_blank" rel="noopener">Ask about this ↗</a>' +
                "</div>" +
              "</article>"
            );
          }).join("") +
        "</div>" +
        '<div class="fr__foot">' +
          '<div class="fr__sum"><span>Look total</span><b>' + rupee(sum) + "</b></div>" +
          '<a class="fr__cta" href="' + WA + "?text=" + encodeURIComponent(message(list)) + '" target="_blank" rel="noopener">Send this look on WhatsApp</a>' +
          '<button type="button" class="fr__again" id="frAgain">Start again</button>' +
        "</div>" +
        (state.overBudget
          ? '<p class="fr__over">Nothing in this category sits under your budget — this is the closest piece we actually have. The owner will confirm the exact price and any better option on WhatsApp.</p>'
          : "") +
        '<p class="fr__fine">Size ' + esc(state.size) + " · Free alteration · Final price and availability confirmed by the shop.</p>";
      body.querySelector("#frAgain").addEventListener("click", function () {
        step = 0;
        state = { occasion: null, budget: null, size: null, overBudget: false };
        paint();
      });
    }
  }

  function bindOptions(list, key) {
    [].slice.call(root.querySelectorAll(".fr__opt")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[key] = list[+btn.getAttribute("data-idx")].id;
        step += 1;
        paint();
      });
    });
  }

  function open() {
    if (!root) {
      root = shell();
      document.body.appendChild(root);
      root.querySelector(".fr__close").addEventListener("click", close);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !root.hidden) close();
      });
    }
    root.hidden = false;
    document.documentElement.classList.add("fr-lock");
    paint();
    var first = root.querySelector(".fr__opt, .fr__cta");
    if (first) first.focus({ preventScroll: true });
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove("fr-lock");
  }

  function wire() {
    [].slice.call(document.querySelectorAll("[data-fitroom]")).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        open();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.__mwFitRoom = open;
})();
