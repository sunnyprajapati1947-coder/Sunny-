/* Jarvis Pocket — long-term memory the assistant can read and write. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var MAX = 200;

  function list() {
    var rows = UI.storeGet('memory', []);
    return Array.isArray(rows) ? rows : [];
  }

  function save(rows) {
    UI.storeSet('memory', rows.slice(-MAX));
  }

  function add(text) {
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return null;
    var rows = list();
    var existing = rows.filter(function (row) {
      return row.text.toLowerCase() === value.toLowerCase();
    })[0];
    if (existing) return existing;
    var entry = { id: UI.uid('mem'), text: value.slice(0, 500), ts: Date.now() };
    rows.push(entry);
    save(rows);
    return entry;
  }

  function remove(id) {
    save(list().filter(function (row) { return row.id !== id; }));
  }

  function clear() {
    save([]);
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
    search: search
  };
})();
