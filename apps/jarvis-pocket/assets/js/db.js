/* JARVIS — data layer.
 *
 * On the phone the records live in SQLite through the JarvisDb bridge. In a
 * plain browser the same API falls back to localStorage so nothing breaks.
 * Reads are synchronous (the tables are small and mirrored in memory); writes
 * are queued so they never reorder.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var plugin = null;
  try {
    plugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.JarvisDb) || null;
  } catch (error) {
    plugin = null;
  }

  var TABLES = ['memory', 'docs', 'history', 'projects', 'files'];
  var mirror = { memory: [], docs: [], history: [], projects: [], files: [] };
  var kv = {};
  var available = !!plugin;
  var ready = false;
  var chain = Promise.resolve();
  var fallbackKey = 'jp.db.';

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function enqueue(job) {
    chain = chain.then(job).catch(function (error) {
      if (window.console) console.warn('db job failed', error && error.message);
    });
    return chain;
  }

  function query(sql, args) {
    return plugin.query({ sql: sql, args: args || [] }).then(function (res) {
      return (res && res.rows) || [];
    });
  }

  function exec(sql, args) {
    return plugin.exec({ sql: sql, args: args || [] });
  }

  /* ------------------------------------------------------------ local copy */

  function loadFallback() {
    TABLES.forEach(function (table) {
      mirror[table] = UI.storeGet(fallbackKey + table, []) || [];
    });
    kv = UI.storeGet(fallbackKey + 'kv', {}) || {};
  }

  function saveFallback(table) {
    if (table) UI.storeSet(fallbackKey + table, mirror[table]);
    else TABLES.forEach(function (name) { UI.storeSet(fallbackKey + name, mirror[name]); });
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    if (ready) return Promise.resolve(api);
    if (!available) {
      loadFallback();
      ready = true;
      return Promise.resolve(api);
    }
    return Promise.all(TABLES.map(function (table) {
      return query('SELECT * FROM ' + table + ' ORDER BY created ASC').catch(function () { return []; });
    })).then(function (results) {
      TABLES.forEach(function (table, index) {
        mirror[table] = (results[index] || []).map(function (row) {
          var out = Object.assign({}, row);
          if (out.created != null) out.created = Number(out.created) || out.created;
          return out;
        });
      });
      return query('SELECT k, v FROM kv').catch(function () { return []; });
    }).then(function (rows) {
      (rows || []).forEach(function (row) {
        try { kv[row.k] = JSON.parse(row.v); } catch (error) { kv[row.k] = row.v; }
      });
      ready = true;
      return api;
    }).catch(function () {
      available = false;
      loadFallback();
      ready = true;
      return api;
    });
  }

  /* ------------------------------------------------------------------ rows */

  function all(table) {
    return (mirror[table] || []).slice();
  }

  function get(table, id) {
    return (mirror[table] || []).filter(function (row) { return String(row.id) === String(id); })[0] || null;
  }

  function insert(table, row) {
    var record = Object.assign({ id: uid(table.charAt(0)), created: Date.now() }, row);
    mirror[table] = (mirror[table] || []).concat([record]);
    if (available) {
      var keys = Object.keys(record);
      enqueue(function () {
        return exec('INSERT OR REPLACE INTO ' + table + ' (' + keys.join(',') + ') VALUES (' +
          keys.map(function () { return '?'; }).join(',') + ')',
          keys.map(function (key) {
            var value = record[key];
            return value == null ? '' : String(value);
          }));
      });
    } else {
      saveFallback(table);
    }
    return record;
  }

  function update(table, id, patch) {
    var row = get(table, id);
    if (!row) return null;
    Object.keys(patch).forEach(function (key) { row[key] = patch[key]; });
    if (available) {
      var keys = Object.keys(patch);
      enqueue(function () {
        return exec('UPDATE ' + table + ' SET ' + keys.map(function (key) { return key + '=?'; }).join(',') +
          ' WHERE id=?', keys.map(function (key) { return String(patch[key]); }).concat([String(id)]));
      });
    } else {
      saveFallback(table);
    }
    return row;
  }

  function remove(table, id) {
    mirror[table] = (mirror[table] || []).filter(function (row) { return String(row.id) !== String(id); });
    if (available) {
      enqueue(function () { return exec('DELETE FROM ' + table + ' WHERE id=?', [String(id)]); });
    } else {
      saveFallback(table);
    }
  }

  function clear(table) {
    mirror[table] = [];
    if (available) {
      enqueue(function () { return exec('DELETE FROM ' + table, []); });
    } else {
      saveFallback(table);
    }
  }

  /* -------------------------------------------------------------------- kv */

  function kget(key, fallback) {
    return Object.prototype.hasOwnProperty.call(kv, key) ? kv[key] : fallback;
  }

  function kset(key, value) {
    kv[key] = value;
    if (available) {
      enqueue(function () {
        return exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [key, JSON.stringify(value)]);
      });
    } else {
      UI.storeSet(fallbackKey + 'kv', kv);
    }
    return value;
  }

  function kremove(key) {
    delete kv[key];
    if (available) {
      enqueue(function () { return exec('DELETE FROM kv WHERE k=?', [key]); });
    } else {
      UI.storeSet(fallbackKey + 'kv', kv);
    }
  }

  function stats() {
    return {
      backend: available ? 'sqlite' : 'localStorage',
      memories: (mirror.memory || []).length,
      documents: (mirror.docs || []).length,
      history: (mirror.history || []).length,
      projects: (mirror.projects || []).length,
      kv: Object.keys(kv).length
    };
  }

  var api = {
    available: available,
    init: init,
    all: all,
    get: get,
    insert: insert,
    update: update,
    remove: remove,
    clear: clear,
    get: get,
    kget: kget,
    kset: kset,
    kremove: kremove,
    stats: stats,
    uid: uid,
    whenReady: function () { return chain; }
  };

  window.JarvisDB = api;
})();
