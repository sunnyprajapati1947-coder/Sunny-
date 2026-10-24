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


  /* --------------------------------------------------- live catalogue editing
     Writing here is what makes the shop update itself: the row lands in
     Supabase, every open shop hears it over realtime, and the card repaints. */
  var ACCESSORY = /mojari|safa|kalgi|brooch|turban|dupatta|stole/i;

  function row(p, id, off) {
    var price = off
      ? '<span class="ow__priceoff">' + rupee(p.price) + "</span>"
      : '<label class="ow__price">₹<input type="number" min="0" step="50" value="' + (p.price || 0) +
        '" aria-label="Price for ' + esc(p.name) + '"></label>';
    var acts = off
      ? '<button type="button" data-show>Show in shop</button>'
      : '<button type="button" data-save>Save</button><button type="button" data-hide>Hide</button>';
    var tag = p.kind === "accessory" || ACCESSORY.test(p.name || "") ? " · accessory, never on the shop floor" : "";
    return (
      '<div class="ow__edit' + (off ? " is-hidden" : "") + '" data-id="' + esc(id) + '">' +
        '<div class="ow__editname"><b>' + esc(p.name) + "</b><span>" + esc(p.cat || "drop") + tag + "</span></div>" +
        price +
        '<div class="ow__editacts">' + acts + "</div>" +
      "</div>"
    );
  }

  function paintShop() {
    var box = panel.querySelector("#owShop");
    if (!box) return;
    var list = window.__MW_PRODUCTS || {};
    var off = window.__MW_HIDDEN || {};
    var ids = Object.keys(list);
    if (!ids.length && !Object.keys(off).length) {
      box.innerHTML = '<p class="ow__empty">The catalogue is still loading.</p>';
      return;
    }
    var html = ids.map(function (id) { return row(list[id], id, false); }).join("");
    var offIds = Object.keys(off);
    if (offIds.length) {
      html += '<p class="ow__grouptitle">Hidden from the shop</p>' +
        offIds.map(function (id) { return row(off[id], id, true); }).join("");
    }
    box.innerHTML = html;

    function send(id, patch, msg, done) {
      var base = (window.__MW_PRODUCTS || {})[id] || (window.__MW_HIDDEN || {})[id] || {};
      db.from("products").upsert({
        id: id,
        name: base.name,
        cat: base.cat,
        price: patch.price == null ? base.price : patch.price,
        imgs: base.imgs,
        cols: base.cols,
        sizes: base.sizes,
        short: base.short,
        descr: base.desc,
        fabric: base.fabric,
        fit: base.fit,
        occasion: base.occasion,
        care: base.care,
        kind: base.kind || "clothing",
        badge: base.badge,
        hidden: !!patch.hidden,
      }, { onConflict: "id" }).then(function (res) {
        if (res && res.error) {
          if (typeof window.__mwToast === "function") window.__mwToast("Could not save: " + res.error.message);
          return;
        }
        if (typeof window.__mwToast === "function") window.__mwToast(msg);
        if (window.__mwLiveCatalogue) window.__mwLiveCatalogue.reload();
        if (done) done();
      });
    }

    [].slice.call(box.querySelectorAll(".ow__edit")).forEach(function (el) {
      var id = el.getAttribute("data-id");
      var input = el.querySelector("input");
      var save = el.querySelector("[data-save]");
      if (save) save.addEventListener("click", function () {
        var price = Math.max(0, parseInt(input.value, 10) || 0);
        el.classList.add("is-busy");
        send(id, { price: price }, "Saved — the shop updates itself", function () { el.classList.remove("is-busy"); });
      });
      var hide = el.querySelector("[data-hide]");
      if (hide) hide.addEventListener("click", function () {
        send(id, { hidden: true }, "Hidden from the shop");
      });
      var show = el.querySelector("[data-show]");
      if (show) show.addEventListener("click", function () {
        send(id, { hidden: false }, "Back in the shop");
      });
    });
  }

  /* the panel repaints itself whenever the live catalogue changes */
  document.addEventListener("mw:catalogue", function () {
    var box = panel && panel.querySelector("#owShop");
    if (box && !box.hidden) paintShop();
  });

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
        '<div><b>Owner</b><span>Orders · live shop edits</span></div>' +
        '<button type="button" class="ow__x" aria-label="Close panel">×</button>' +
      "</header>" +
      '<div class="ow__tabs" role="tablist">' +
        '<button type="button" class="ow__tab is-on" data-tab="orders" role="tab">Orders <b class="ow__count">0</b></button>' +
        '<button type="button" class="ow__tab" data-tab="shop" role="tab">Shop</button>' +
      "</div>" +
      '<div class="ow__list" id="owList"></div>' +
      '<div class="ow__list ow__shop" id="owShop" hidden></div>' +
      '<p class="ow__foot">Only accounts on the owner list can see this.</p>';
    document.body.appendChild(panel);

    chip.addEventListener("click", toggle);
    panel.querySelector(".ow__x").addEventListener("click", toggle);
    [].slice.call(panel.querySelectorAll("[data-tab]")).forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-tab");
        [].slice.call(panel.querySelectorAll("[data-tab]")).forEach(function (t) {
          t.classList.toggle("is-on", t === tab);
        });
        panel.querySelector("#owList").hidden = name !== "orders";
        panel.querySelector("#owShop").hidden = name !== "shop";
        if (name === "shop") paintShop();
      });
    });
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
