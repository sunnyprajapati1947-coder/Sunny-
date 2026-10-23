/* ==========================================================================
   MEN'S WEAR — the door
   A one-time fit profile: name, WhatsApp number, usual size.
   Stored on the phone only (localStorage). No password, no email, no server.
   window.__MW_YOU is read by shop.js so WhatsApp messages leave addressed.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "mw:you";
  var SKIP = "mw:skip";
  var WEEK = 7 * 864e5;

  function readYou() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeYou(v) {
    try {
      if (v) localStorage.setItem(KEY, JSON.stringify(v));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }
  function skippedRecently() {
    try {
      return Date.now() - (+localStorage.getItem(SKIP) || 0) < WEEK;
    } catch (e) {
      return false;
    }
  }
  function markSkip() {
    try { localStorage.setItem(SKIP, String(Date.now())); } catch (e) {}
  }

  var you = readYou();
  window.__MW_YOU = you;

  var gate = document.getElementById("enter");
  var form = document.getElementById("enterForm");
  var nameIn = document.getElementById("enterName");
  var phoneIn = document.getElementById("enterPhone");
  var sizes = document.getElementById("enterSizes");
  var err = document.getElementById("enterErr");
  var goBtn = document.getElementById("enterGo");
  var skipBtn = document.getElementById("enterSkip");
  var closeBtn = document.getElementById("enterClose");
  var youBtn = document.getElementById("youBtn");
  var initialsEl = document.getElementById("youInitials");

  var picked = you && you.size ? you.size : "";

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "MW";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function syncChip() {
    if (!youBtn) return;
    if (you && you.name) {
      youBtn.hidden = false;
      youBtn.setAttribute("aria-label", "Fit profile — " + you.name);
      if (initialsEl) initialsEl.textContent = initials(you.name);
    } else {
      youBtn.hidden = true;
    }
  }

  function paintSizes() {
    if (!sizes) return;
    Array.prototype.forEach.call(sizes.querySelectorAll("button"), function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-size") === picked);
      b.setAttribute("aria-pressed", b.getAttribute("data-size") === picked ? "true" : "false");
    });
  }

  function fill() {
    if (nameIn) nameIn.value = (you && you.name) || "";
    if (phoneIn) phoneIn.value = (you && you.phone) || "";
    picked = (you && you.size) || "";
    paintSizes();
  }

  function open(mode) {
    if (!gate) return;
    fill();
    if (err) err.hidden = true;
    if (goBtn) goBtn.firstChild.nodeValue = mode === "edit" ? "Save my profile " : "Enter the drop ";
    gate.hidden = false;
    document.body.classList.add("is-gated");
    requestAnimationFrame(function () {
      gate.classList.add("is-on");
    });
    window.setTimeout(function () {
      if (nameIn && !nameIn.value && window.innerWidth > 720) nameIn.focus();
    }, 420);
  }

  function close(remember) {
    if (!gate) return;
    gate.classList.remove("is-on");
    document.body.classList.remove("is-gated");
    window.setTimeout(function () { gate.hidden = true; }, 320);
    if (remember) markSkip();
  }

  function cleanPhone(v) {
    var digits = String(v || "").replace(/\D/g, "");
    if (digits.length > 10 && digits.slice(0, 2) === "91") digits = digits.slice(-10);
    return digits.length === 10 ? digits : "";
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (nameIn ? nameIn.value : "").trim().replace(/\s+/g, " ");
      if (name.length < 2) {
        if (err) err.hidden = false;
        if (nameIn) nameIn.focus();
        return;
      }
      var phone = cleanPhone(phoneIn ? phoneIn.value : "");
      you = { name: name.slice(0, 40), phone: phone, size: picked || "", at: Date.now() };
      writeYou(you);
      window.__MW_YOU = you;
      syncChip();
      close(false);
      if (typeof window.__mwToast === "function") {
        window.__mwToast("Welcome, " + you.name.split(" ")[0] + " — the drop is open");
      }
      try {
        window.dispatchEvent(new CustomEvent("mw:you", { detail: you }));
      } catch (err2) {}
    });
  }

  if (sizes) {
    sizes.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-size]");
      if (!b) return;
      picked = b.getAttribute("data-size");
      paintSizes();
    });
  }

  if (skipBtn) skipBtn.addEventListener("click", function () { close(true); });
  if (closeBtn) closeBtn.addEventListener("click", function () { close(true); });
  if (gate) {
    gate.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close(true);
    });
  }
  if (youBtn) {
    youBtn.addEventListener("click", function () { open("edit"); });
  }

  syncChip();

  /* first visit: the door. Returning visitor: straight in. */
  if (!you && !skippedRecently()) {
    window.setTimeout(function () { open("first"); }, 650);
  }
})();
