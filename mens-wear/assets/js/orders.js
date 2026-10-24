/* ==========================================================================
   MEN'S WEAR — order ledger
   The shop still takes every order on WhatsApp (that is how the owner works),
   but each order is also written to Supabase so the owner has a list, a sound
   and a notification instead of scrolling WhatsApp history.

   The insert is fire-and-forget: if the network or the database is down the
   WhatsApp message still goes out, exactly like before.
   ========================================================================== */
(function () {
  "use strict";

  function client() {
    return window.__mwSupabase || null;
  }

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
  }

  function save(payload) {
    var db = client();
    if (!db || !payload || !payload.ref) return Promise.resolve(null);

    var you = window.__MW_YOU || {};
    var row = {
      ref: clean(payload.ref, 40),
      items: (payload.items || []).slice(0, 40).map(function (it) {
        return {
          name: clean(it.name, 120),
          size: clean(it.size, 12),
          colour: clean(it.colour, 40),
          qty: Math.max(1, Math.min(50, parseInt(it.qty, 10) || 1)),
          price: Math.max(0, parseInt(it.price, 10) || 0),
        };
      }),
      item_count: (payload.items || []).reduce(function (n, it) {
        return n + (parseInt(it.qty, 10) || 1);
      }, 0),
      total: Math.max(0, parseInt(payload.total, 10) || 0),
      customer_name: clean(you.name, 120),
      phone: clean(you.phone, 24),
      address: "",
      note: "",
      channel: "whatsapp",
      status: "new",
    };

    return db
      .from("orders")
      .insert(row)
      .select("ref")
      .then(function (res) {
        if (res && res.error) return { ok: false, error: res.error.message };
        return { ok: true, ref: row.ref };
      })
      .catch(function (err) {
        return { ok: false, error: err && err.message };
      });
  }

  window.__mwSaveOrder = save;
})();
