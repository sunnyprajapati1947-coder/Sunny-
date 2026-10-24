/* ==========================================================================
   MEN'S WEAR — owner view, inside the shop
   There is no separate admin page any more. If the signed-in account is on the
   owner allow-list, a small "Orders" chip appears in the shop itself; the
   database decides who that is (row-level security), not this file.

   A customer account never sees the chip because the admins table returns
   nothing for it.
   ========================================================================== */
(function () {
  "use strict";

  var db = null;
  var orders = [];
  var seen = {};
  var open = false;
  var chip = null;
  var panel = null;

  function rupee(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.14);
      osc.stop(ctx.currentTime + 0.28);
    } catch (e) {}
  }

  function notify(order) {
    beep();
    if (typeof window.__mwToast === "function") {
      window.__mwToast("New order " + order.ref + " · " + order.item_count + " item(s)");
    }
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("New order " + order.ref, { body: order.item_count + " item(s) · " + rupee(order.total), tag: order.ref });
      }
    } catch (e) {}
  }

  /* --------------------------------------------------------------- markup */
  function build() {
    chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ow__chip";
    chip.hidden = true;
    chip.innerHTML = '<span aria-hidden="true">◈</span> Orders <b class="ow__count">0</b>';
    document.body.appendChild(chip);

    panel = document.createElement("aside");
    panel.className = "ow";
    panel.hidden = true;
    panel.innerHTML =
      '<header class="ow__head">' +
        '<div><b>Orders</b><span>Live — updates without a refresh</span></div>' +
        '<button type="button" class="ow__x" aria-label="Close orders">×</button>' +
      "</header>" +
      '<div class="ow__list" id="owList"></div>' +
      '<p class="ow__foot">Only accounts on the owner list can see this.</p>';
    document.body.appendChild(panel);

    chip.addEventListener("click", toggle);
    panel.querySelector(".ow__x").addEventListener("click", toggle);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) toggle();
    });
  }

  function toggle() {
    open = !open;
    panel.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
    if (open) render();
  }

  function card(o) {
    var items = (o.items || []).map(function (it) {
      return "<li>" + esc(it.name) + " · " + esc(it.size) + " · " + esc(it.colour) +
        " × " + esc(it.qty) + " — " + rupee((it.price || 0) * (it.qty || 1)) + "</li>";
    }).join("");

    var link = o.phone
      ? "https://wa.me/" + String(o.phone).replace(/\D/g, "")
      : "https://wa.me/919608087035?text=" + encodeURIComponent("About order " + o.ref + " — ");

    return (
      '<article class="ow__card" data-ref="' + esc(o.ref) + '">' +
        "<header><b>" + esc(o.ref) + "</b><span>" + when(o.created_at) + "</span></header>" +
        '<p class="ow__who">' + (o.customer_name ? esc(o.customer_name) : "Guest") +
          (o.phone ? " · " + esc(o.phone) : "") + "</p>" +
        '<ul class="ow__items">' + items + "</ul>" +
        '<div class="ow__row"><b>' + rupee(o.total) + "</b>" +
          '<span class="ow__pill ow__pill--' + esc(o.status) + '">' + esc(o.status) + "</span></div>" +
        '<div class="ow__acts">' +
          '<a href="' + link + '" target="_blank" rel="noopener">WhatsApp</a>' +
          ["confirmed", "packed", "delivered"].map(function (s) {
            return '<button type="button" data-set="' + s + '">' + s + "</button>";
          }).join("") +
        "</div>" +
      "</article>"
    );
  }

  function render() {
    var list = panel.querySelector("#owList");
    if (!orders.length) {
      list.innerHTML = '<p class="ow__empty">No orders yet. As soon as a customer taps Order on WhatsApp, it lands here.</p>';
      return;
    }
    list.innerHTML = orders.map(card).join("");
    [].slice.call(list.querySelectorAll("[data-set]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ref = btn.closest(".ow__card").getAttribute("data-ref");
        db.from("orders").update({ status: btn.getAttribute("data-set") }).eq("ref", ref).then(function (res) {
          if (res && res.error) {
            if (typeof window.__mwToast === "function") window.__mwToast("Could not update: " + res.error.message);
            return;
          }
          orders = orders.map(function (o) {
            return o.ref === ref ? Object.assign({}, o, { status: btn.getAttribute("data-set") }) : o;
          });
          render();
        });
      });
    });
  }

  function take(row) {
    if (!row || !row.ref) return;
    if (seen[row.ref]) {
      orders = orders.map(function (o) { return o.ref === row.ref ? row : o; });
    } else {
      seen[row.ref] = 1;
      orders.unshift(row);
      orders = orders.slice(0, 60);
      notify(row);
    }
    var c = panel.querySelector(".ow__count");
    if (c) c.textContent = String(orders.filter(function (o) { return o.status === "new"; }).length);
    if (open) render();
  }

  function load() {
    db.from("orders")
      .select("ref,created_at,customer_name,phone,items,item_count,total,status")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(function (res) {
        if (res && res.error) return;
        orders = res.data || [];
        orders.forEach(function (o) { seen[o.ref] = 1; });
        var c = panel.querySelector(".ow__count");
        if (c) c.textContent = String(orders.filter(function (o) { return o.status === "new"; }).length);
        chip.hidden = false;
        if (open) render();
      });
  }

  function live() {
    try {
      db.channel("orders-in-shop")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, function (payload) {
          if (payload.new && payload.new.ref) take(payload.new);
        })
        .subscribe();
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ boot */
  function start() {
    db = window.__mwSupabase;
    if (!db) return;
    db.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return null;
      return db.from("admins").select("email").limit(1).then(function (ans) {
        if (!ans || ans.error || !(ans.data && ans.data.length)) return null;
        build();
        if ("Notification" in window && Notification.permission === "default") {
          try { Notification.requestPermission(); } catch (e) {}
        }
        live();
        load();
      });
    });
  }

  /* the auth client is created by auth-gate.js; wait for it */
  var tries = 0;
  (function wait() {
    if (window.__mwSupabase) return start();
    if (tries++ > 60) return;
    setTimeout(wait, 250);
  })();
})();
