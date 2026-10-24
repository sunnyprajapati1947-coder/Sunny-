/* ==========================================================================
   MEN'S WEAR — owner panel (/admin/)
   Sign in with your own account, and only an account whose email sits in the
   `admins` table can read orders (row-level security enforces that server
   side — this file cannot widen it).

   A new order arrives by itself: browser notification, a beep, and the row
   slides in at the top of the list. No refresh needed.
   ========================================================================== */
(function () {
  "use strict";

  var SUPABASE_URL = "https://zneqxctfhwehiuzibjnc.supabase.co";
  var SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZXF4Y3RmaHdlaGl1emliam5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MDEzNTYsImV4cCI6MjEwODM3NzM1Nn0.LbGmxwyrbFe4kw2pTn9jJZ910YX9JGGndScxnrKhMAQ";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  var status = $("#adminStatus");
  var gate = $("#adminGate");
  var panel = $("#adminPanel");
  var listEl = $("#adminList");
  var who = $("#adminWho");
  var empty = $("#adminEmpty");

  var db = null;
  var me = null;
  var orders = [];
  var seen = {};

  function note(msg, kind) {
    if (!status) return;
    status.textContent = msg || "";
    status.className = "adm__note" + (kind ? " adm__note--" + kind : "");
  }

  function rupee(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  /* ------------------------------------------------------------------ sound */
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.14);
      osc.stop(ctx.currentTime + 0.28);
    } catch (e) {}
  }

  function notify(order) {
    beep();
    document.title = "NEW ORDER — Men's Wear panel";
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try {
        new Notification("New order " + order.ref, {
          body: order.item_count + " item(s) · " + rupee(order.total),
          tag: order.ref,
        });
      } catch (e) {}
    }
  }

  /* ----------------------------------------------------------------- render */
  function orderCard(o) {
    var items = (o.items || []).map(function (it) {
      return "<li>" + esc(it.name) + " · " + esc(it.size) + " · " + esc(it.colour) +
        " × " + esc(it.qty) + " — " + rupee((it.price || 0) * (it.qty || 1)) + "</li>";
    }).join("");

    var wa = o.phone
      ? "https://wa.me/" + String(o.phone).replace(/\D/g, "")
      : "https://wa.me/919608087035?text=" +
        encodeURIComponent("About order " + o.ref + " — ");

    return (
      '<article class="adm__card" data-ref="' + esc(o.ref) + '">' +
        '<header><b>' + esc(o.ref) + "</b><span>" + stamp(o.created_at) + "</span></header>" +
        '<p class="adm__who">' + (o.customer_name ? esc(o.customer_name) : "Guest") +
          (o.phone ? " · " + esc(o.phone) : " · number not shared yet") + "</p>" +
        '<ul class="adm__items">' + items + "</ul>" +
        '<div class="adm__row"><b class="adm__total">' + rupee(o.total) + "</b>" +
          '<span class="adm__pill adm__pill--' + esc(o.status) + '">' + esc(o.status) + "</span></div>" +
        '<div class="adm__acts">' +
          '<a href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' +
          ['confirmed', 'packed', 'delivered'].map(function (s) {
            return '<button type="button" data-set="' + s + '">' + s + "</button>";
          }).join("") +
        "</div>" +
      "</article>"
    );
  }

  function render() {
    if (!listEl) return;
    if (!orders.length) {
      listEl.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    listEl.innerHTML = orders.map(orderCard).join("");
    $$("[data-set]", listEl).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ref = btn.closest(".adm__card").getAttribute("data-ref");
        setStatus(ref, btn.getAttribute("data-set"));
      });
    });
  }

  function setStatus(ref, next) {
    db.from("orders").update({ status: next }).eq("ref", ref).then(function (res) {
      if (res && res.error) { note("Could not update: " + res.error.message, "bad"); return; }
      orders = orders.map(function (o) { return o.ref === ref ? Object.assign({}, o, { status: next }) : o; });
      render();
      note("Marked " + ref + " as " + next + ".", "ok");
    });
  }

  function take(row) {
    if (!row || !row.ref) return;
    if (seen[row.ref]) {
      orders = orders.map(function (o) { return o.ref === row.ref ? row : o; });
    } else {
      seen[row.ref] = 1;
      orders.unshift(row);
      orders = orders.slice(0, 100);
      notify(row);
    }
    render();
  }

  /* ------------------------------------------------------------------- boot */
  function allowed() {
    return db.from("admins").select("email").limit(1).then(function (res) {
      if (res && res.error) return false;
      return !!(res.data && res.data.length);
    });
  }

  function loadOrders() {
    return db
      .from("orders")
      .select("ref,created_at,customer_name,phone,items,item_count,total,status")
      .order("created_at", { ascending: false })
      .limit(60)
      .then(function (res) {
        if (res && res.error) { note("Could not load orders: " + res.error.message, "bad"); return; }
        orders = res.data || [];
        orders.forEach(function (o) { seen[o.ref] = 1; });
        render();
        note(orders.length ? orders.length + " order(s) loaded." : "No orders yet.", "ok");
      });
  }

  function live() {
    try {
      db.channel("orders-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, function (payload) {
          if (payload.new && payload.new.ref) take(payload.new);
        })
        .subscribe();
    } catch (e) {}
  }

  function enter(session) {
    me = session.user;
    gate.hidden = true;
    panel.hidden = false;
    if (who) who.textContent = me.email || "";
    return allowed().then(function (ok) {
      if (!ok) {
        gate.hidden = false;
        panel.hidden = true;
        note(
          (me.email || "This account") + " is not on the owner allow-list yet. Send this exact email to the developer and it will be added.",
          "bad"
        );
        var btn = $("#adminCopyMail");
        if (btn) btn.addEventListener("click", function () {
          try { navigator.clipboard.writeText(me.email || ""); note("Email copied.", "ok"); } catch (e) {}
        });
        return;
      }
      if ("Notification" in window && Notification.permission === "default") {
        try { Notification.requestPermission(); } catch (e) {}
      }
      live();
      return loadOrders();
    });
  }

  function start() {
    if (!window.supabase || !window.supabase.createClient) {
      note("The security library could not load. Check the connection and reload.", "bad");
      return;
    }
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, flowType: "pkce", storageKey: "mw-admin-auth" },
    });

    var form = $("#adminForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = $("#adminEmail").value.trim();
        var pass = $("#adminPass").value;
        note("Signing in…");
        db.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
          if (res.error) { note(res.error.message, "bad"); return; }
          enter(res.data.session);
        });
      });
    }

    var out = $("#adminOut");
    if (out) {
      out.addEventListener("click", function () {
        db.auth.signOut().then(function () { location.reload(); });
      });
    }

    db.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      if (s) enter(s);
      else note("Sign in to see today's orders.");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
