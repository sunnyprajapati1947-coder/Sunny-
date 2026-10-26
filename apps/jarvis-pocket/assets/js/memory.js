/* JARVIS — long-term memory. SQLite on the phone, localStorage elsewhere.
   Anything that looks like a credential is refused, and text that came from a
   document or a web page is stored as an untrusted note (never as an order). */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var DB = window.JarvisDB;
  var MAX = 500;

  var SECRETS = [
    /AIza[0-9A-Za-z_-]{20,}/,
    /sk-[A-Za-z0-9]{16,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /(api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S{8,}/i
  ];

  var migrated = false;

  function looksLikeSecret(text) {
    return SECRETS.some(function (pattern) { return pattern.test(text || ''); });
  }

  function rows() {
    if (!DB) return UI.storeGet('memory', []) || [];
    return DB.all('memory').map(function (row) {
      return {
        id: row.id,
        text: row.text,
        kind: row.kind || 'fact',
        source: row.source || 'user',
        ts: Number(row.created) || Date.now()
      };
    }).sort(function (a, b) { return a.ts - b.ts; });
  }

  function migrate() {
    if (migrated || !DB) return;
    migrated = true;
    var legacy = UI.storeGet('memory', []) || [];
    if (!legacy.length || DB.all('memory').length) return;
    legacy.forEach(function (row) {
      DB.insert('memory', {
        text: row.text,
        kind: 'fact',
        source: 'user',
        created: row.ts || Date.now()
      });
    });
    UI.storeSet('memory.migrated', true);
  }

  function list() {
    migrate();
    return rows();
  }

  function add(text, options) {
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return { ok: false, error: 'Nothing to remember.' };
    if (looksLikeSecret(value)) {
      return { ok: false, error: 'That looks like a password or a key, so I did not store it.' };
    }
    var existing = list().filter(function (row) {
      return row.text.toLowerCase() === value.toLowerCase();
    })[0];
    if (existing) return Object.assign({ ok: true }, existing);
    if (!DB) {
      var fallback = list();
      var entry = { id: UI.uid('mem'), text: value.slice(0, 500), ts: Date.now() };
      fallback.push(entry);
      UI.storeSet('memory', fallback.slice(-MAX));
      return Object.assign({ ok: true }, entry);
    }
    var record = DB.insert('memory', {
      text: value.slice(0, 500),
      kind: (options && options.kind) || 'fact',
      source: (options && options.source) || 'user',
      created: Date.now()
    });
    return {
      ok: true,
      id: record.id,
      text: record.text,
      kind: record.kind,
      ts: Number(record.created)
    };
  }

  function remove(id) {
    if (!DB) {
      UI.storeSet('memory', (UI.storeGet('memory', []) || []).filter(function (row) { return row.id !== id; }));
      return;
    }
    DB.remove('memory', id);
  }

  function clear() {
    if (!DB) UI.storeSet('memory', []);
    else DB.clear('memory');
  }

  function search(query) {
    var needle = String(query || '').toLowerCase().trim();
    if (!needle) return list();
    return list().filter(function (row) {
      return row.text.toLowerCase().indexOf(needle) !== -1;
    });
  }

  window.JarvisMemory = {
    list: list,
    add: add,
    remove: remove,
    clear: clear,
    search: search,
    looksLikeSecret: looksLikeSecret
  };
})();
