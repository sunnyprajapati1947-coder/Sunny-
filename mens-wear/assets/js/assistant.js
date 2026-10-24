/* ==========================================================================
   MEN'S WEAR — store assistant
   A grounded helper, not a fortune teller: every answer comes from the shop's
   own catalogue and its own rules, so it can never invent a price, a size or
   an offer. If something is genuinely unknown (rent, a piece not in the drop)
   it says so and hands the customer to the owner on WhatsApp.

   It understands Hinglish questions ("shaadi ke liye kya hai", "sasta dikhao")
   but always answers in English, like the rest of the site.
   ========================================================================== */
(function () {
  "use strict";

  var CONFIG = window.__MW_CONFIG || {};
  var WA = "https://wa.me/" + (CONFIG.whatsapp || "919608087035");

  /* --------------------------------------------------------------- knowledge */
  var FACTS = {
    delivery:
      "Free delivery inside Nawada, and store pickup any time the shop is open. Outside Nawada we send by courier — the exact charge is confirmed on WhatsApp before you pay.",
    exchange:
      "Size exchange is available — bring the piece back with the tag on and we swap the size. Confirm the window on WhatsApp when you order.",
    alteration: "Alteration is free on every piece we sell — the fit is on us.",
    payment: "UPI, card and cash are all accepted. Nothing is charged online.",
    hours: "The shop is open 10 AM – 9 PM, every day.",
    store: "Sudama Nagar, Nawada, Bihar 805110 — right on the main market road.",
    rent: "Rent is not something we can promise yet — please ask on WhatsApp and the owner will tell you straight.",
    groom:
      "For grooms we do sherwani, jodhpuri and indo-western, with alteration included. The groom package price depends on the piece and the work — the owner confirms it on WhatsApp.",
    order:
      "Tap any piece, choose size and colour, add it to the bag, then tap Order on WhatsApp. Your message reaches the shop with the full order and a reference number.",
    reviews:
      "We do not publish reviews we have not earned, so there are no star ratings here yet. Real customer photos go up as they come in.",
    offers:
      "No invented discounts. Whatever offer is running, the owner tells you on WhatsApp — the price on the card is the price.",
  };

  /* Hinglish and shorthand the customers actually type */
  var SYNONYMS = {
    shaadi: "wedding", shadi: "wedding", byah: "wedding", baraat: "wedding",
    sagai: "wedding", reception: "wedding", sangeet: "wedding",
    sasta: "cheap", sasti: "cheap", budget: "cheap", kam: "cheap", paisa: "cheap",
    kapda: "cloth", kapde: "cloth", dress: "cloth", wada: "cloth",
    kitna: "price", kitne: "price", rate: "price", daam: "price", rupees: "price",
    size: "size", naap: "size", fitting: "fit", fit: "fit",
    delivery: "delivery", pahunch: "delivery", courier: "delivery", kitnedin: "delivery",
    badal: "exchange", exchange: "exchange", return: "exchange", wapas: "exchange",
    silai: "alteration", alteration: "alteration", chhota: "alteration",
    dhulai: "care", wash: "care", kapde: "cloth",
    dukan: "store", shop: "store", kahan: "store", address: "store", location: "store",
    time: "hours", khula: "hours", band: "hours",
    kiraya: "rent", rent: "rent", kiraye: "rent",
    dulha: "groom", groom: "groom",
    sherwani: "sherwani", suit: "suit", kurta: "kurta", jeans: "jeans",
    shirt: "shirt", tshirt: "tee", t_shirt: "tee", hoodie: "hoodie",
    jacket: "jacket", cargo: "cargo", varsity: "varsity",
  };

  var STOP = ("is there any a the of for me my i you can could please tell what which how much do does have has " +
    "ka ki ke kya hai hain mujhe mera batao bata do kar karna chahiye koi or aur and with show dikhao de").split(" ");

  function products() {
    return window.__MW_PRODUCTS || {};
  }
  function list() {
    var p = products();
    return Object.keys(p).map(function (k) { return p[k]; });
  }
  function rupee(n) {
    return "\u20B9" + Number(n).toLocaleString("en-IN");
  }

  function tokens(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(function (w) { return SYNONYMS[w] || w; })
      .filter(function (w) { return w.length > 2 && STOP.indexOf(w) === -1; });
  }

  /* ------------------------------------------------------------ small search */
  function scoreProduct(p, words) {
    var hay = tokens(
      [p.name, p.short, p.desc, p.fabric, p.occasion, p.cat, p.fit, (p.cols || []).map(function (c) { return c.name; }).join(" ")]
        .join(" ")
    );
    var score = 0;
    words.forEach(function (w) {
      if (p.name && p.name.toLowerCase().indexOf(w) !== -1) score += 6;
      if (hay.indexOf(w) !== -1) score += 3;
      else if (hay.some(function (h) { return h.indexOf(w) === 0 || w.indexOf(h) === 0; })) score += 1;
    });
    return score;
  }

  function find(text, limit) {
    var words = tokens(text);
    if (!words.length) return [];
    return list()
      .map(function (p) { return { p: p, s: scoreProduct(p, words) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, limit || 3)
      .map(function (r) { return r.p; });
  }

  function cheapest(n) {
    return list().slice().sort(function (a, b) { return a.price - b.price; }).slice(0, n || 3);
  }

  function card(p) {
    var sizes = (p.sizes || []).join(" · ");
    return (
      '<a class="ai-card" href="' + WA + '?text=' +
        encodeURIComponent("Hi Men's Wear! I want to ask about the " + p.name + " (" + rupee(p.price) + ").") +
        '" target="_blank" rel="noopener">' +
        "<b>" + esc(p.name) + "</b>" +
        '<span class="ai-card__price">' + rupee(p.price) + "</span>" +
        '<span class="ai-card__meta">' + esc(p.fabric || "") + (sizes ? " · " + esc(sizes) : "") + "</span>" +
        '<span class="ai-card__cta">Ask about this on WhatsApp ↗</span>' +
      "</a>"
    );
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ------------------------------------------------------------------ replies */
  function reply(text) {
    var q = String(text || "").toLowerCase();
    var words = tokens(text);
    var has = function (re) { return re.test(q); };

    if (has(/^(hi|hello|hey|namaste|hii|salam)\b/) || !words.length) {
      return {
        html:
          "<p>Hello! I'm the shop assistant for Men's Wear, Sudama Nagar. Ask me about a piece, a price, sizes, delivery or alteration — I answer from what the shop actually has.</p>",
        chips: ["Under ₹1,500", "Wedding picks", "Sizes & fit", "Delivery", "Talk to the owner"],
      };
    }

    if (has(/rent|kiraya|kiraye/)) return { html: "<p>" + FACTS.rent + "</p>", wa: "Can I rent a sherwani or suit?" };
    if (has(/groom|dulha|wedding package|package/))
      return { html: "<p>" + FACTS.groom + "</p>", picks: find("wedding sherwani jodhpuri", 3), wa: "Groom package price?" };
    if (has(/deliver|pahunch|courier|ship/)) return { html: "<p>" + FACTS.delivery + "</p>", wa: "Delivery charge and time?" };
    if (has(/exchange|return|wapas|badal/)) return { html: "<p>" + FACTS.exchange + "</p>", wa: "Size exchange policy?" };
    if (has(/alter|silai|fitting|stitch/)) return { html: "<p>" + FACTS.alteration + "</p>", wa: "Alteration — how long does it take?" };
    if (has(/\bpay|\bupi\b|card|cash|cod|online/)) return { html: "<p>" + FACTS.payment + "</p>", wa: "Which payment options work?" };
    if (has(/open|hours|timing|band|khul/)) return { html: "<p>" + FACTS.hours + "</p><p>" + FACTS.store + "</p>", wa: "Is the shop open now?" };
    if (has(/where|address|location|store|shop|dukan|kahan|map/)) return { html: "<p>" + FACTS.store + "</p><p>" + FACTS.hours + "</p>", wa: "Send me the shop location" };
    if (has(/review|rating|photo of customer|trust/)) return { html: "<p>" + FACTS.reviews + "</p>", wa: "Any customer photos?" };
    if (has(/discount|offer|sale|mrp/))
      return { html: "<p>" + FACTS.offers + "</p>", picks: cheapest(3), wa: "Any offer running today?" };
    if (has(/how.*order|order kaise|place.*order|buy|kharidna/))
      return { html: "<p>" + FACTS.order + "</p>", picks: cheapest(3), wa: "I want to place an order" };

    if (has(/cheap|budget|under|sasta|low price|kam paisa/)) {
      var cap = (q.match(/(\d{3,5})/) || [])[1];
      var budget = cap ? parseInt(cap, 10) : 1500;
      var picks = list()
        .filter(function (p) { return p.price <= budget; })
        .sort(function (a, b) { return a.price - b.price; })
        .slice(0, 3);
      if (picks.length) {
        return {
          html: "<p>Inside " + rupee(budget) + " the shop has these — all original fabric, free alteration included:</p>",
          picks: picks,
          wa: "What do you have under " + rupee(budget) + "?",
        };
      }
      return {
        html: "<p>Nothing in the drop sits under " + rupee(budget) + " right now. Cheapest piece is " + rupee(cheapest(1)[0].price) + ".</p>",
        picks: cheapest(2),
        wa: "Anything under " + rupee(budget) + "?",
      };
    }

    var hits = find(text, 3);
    if (hits.length) {
      return {
        html:
          "<p>Here's what matches in the current drop — tap a card to ask the owner about that exact piece:</p>",
        picks: hits,
        wa: "I want to ask about " + hits[0].name,
      };
    }

    return {
      html:
        "<p>I don't have that in the catalogue, and I won't guess — the shop's stock changes weekly. Send the question to the owner and you'll get a straight answer:</p>",
      wa: String(text).slice(0, 160),
    };
  }

  /* ------------------------------------------------------------------- render */
  function build() {
    var wrap = document.createElement("div");
    wrap.className = "ai";
    wrap.innerHTML =
      '<button class="ai__fab" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="aiPanel">' +
        '<span class="ai__fabicon" aria-hidden="true">✦</span>' +
        '<span class="ai__fabtext">Ask the shop</span>' +
      "</button>" +
      '<section class="ai__panel" id="aiPanel" role="dialog" aria-modal="false" aria-label="Shop assistant" hidden>' +
        '<header class="ai__head">' +
          "<div><b>Shop assistant</b><span>Answers from this shop's own catalogue</span></div>" +
          '<button class="ai__close" type="button" aria-label="Close assistant">×</button>' +
        "</header>" +
        '<div class="ai__log" id="aiLog" aria-live="polite"></div>' +
        '<div class="ai__chips" id="aiChips"></div>' +
        '<form class="ai__form" id="aiForm">' +
          '<input id="aiInput" type="text" autocomplete="off" placeholder="Ask about a piece, price, size, delivery…" aria-label="Your question">' +
          '<button type="submit" aria-label="Send">→</button>' +
        "</form>" +
        '<p class="ai__foot">Assistant for this shop only · For anything it cannot confirm, WhatsApp the owner.</p>' +
      "</section>";
    return wrap;
  }

  function mount() {
    if (!list().length) return;
    var root = build();
    document.body.appendChild(root);

    var fab = root.querySelector(".ai__fab");
    var panel = root.querySelector(".ai__panel");
    var log = root.querySelector("#aiLog");
    var chips = root.querySelector("#aiChips");
    var form = root.querySelector("#aiForm");
    var input = root.querySelector("#aiInput");
    var opened = false;

    function waLink(label, text) {
      return (
        '<a class="ai__wa" href="' + WA + "?text=" + encodeURIComponent(text || "Hi Men's Wear! I have a question.") +
        '" target="_blank" rel="noopener">' + esc(label || "Ask the owner on WhatsApp") + " ↗</a>"
      );
    }

    function push(html, mine) {
      var el = document.createElement("div");
      el.className = "ai__msg" + (mine ? " ai__msg--me" : " ai__msg--bot");
      el.innerHTML = html;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    }

    function setChips(items) {
      chips.innerHTML = "";
      (items || []).forEach(function (label) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ai__chip";
        b.textContent = label;
        b.addEventListener("click", function () { ask(label); });
        chips.appendChild(b);
      });
    }

    function ask(text) {
      push(esc(text), true);
      var r = reply(text);
      var html = r.html;
      if (r.picks && r.picks.length) {
        html += '<div class="ai__cards">' + r.picks.map(card).join("") + "</div>";
      }
      html += '<div class="ai__actions">' + waLink("Talk to the owner", r.wa || text) + "</div>";
      window.setTimeout(function () {
        push(html, false);
        setChips(r.chips || ["Under ₹1,500", "Wedding picks", "Delivery", "Talk to the owner"]);
      }, 260);
    }

    function open() {
      opened = true;
      panel.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      if (!log.childElementCount) {
        var r = reply("hello");
        push(r.html, false);
        setChips(r.chips);
      }
      window.setTimeout(function () { input.focus({ preventScroll: true }); }, 60);
    }

    function close() {
      opened = false;
      panel.hidden = true;
      fab.setAttribute("aria-expanded", "false");
      fab.focus({ preventScroll: true });
    }

    fab.addEventListener("click", function () { opened ? close() : open(); });
    root.querySelector(".ai__close").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && opened) close();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      input.value = "";
      ask(v);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
