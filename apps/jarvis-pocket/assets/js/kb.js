/* JARVIS — local knowledge base.
 *
 * Documents you add (pasted text or a .txt/.md file) are split into passages,
 * stored in the on-device database and ranked with BM25. No embeddings service,
 * no network, no model: search keeps working in airplane mode and costs no RAM.
 */
(function () {
  'use strict';

  var DB = window.JarvisDB;

  var CHUNK = 900;
  var OVERLAP = 140;
  var K1 = 1.5;
  var B = 0.75;

  var STOP = ('a an and are as at be but by for from has have he her his i if in into is it its of on or ' +
    'our she so that the their them then there these they this to was we were what when where which who will ' +
    'with you your').split(/\s+/);

  function tokens(text) {
    return String(text || '').toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F]+/g, ' ')
      .split(/\s+/)
      .filter(function (word) { return word && word.length > 1 && STOP.indexOf(word) === -1; });
  }

  function split(text) {
    var clean = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!clean) return [];
    var parts = [];
    var i = 0;
    while (i < clean.length) {
      var end = Math.min(clean.length, i + CHUNK);
      if (end < clean.length) {
        var slice = clean.slice(i, end);
        var cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
        if (cut > CHUNK * 0.5) end = i + cut + 1;
      }
      parts.push(clean.slice(i, end).trim());
      if (end >= clean.length) break;
      i = Math.max(end - OVERLAP, i + 1);
    }
    return parts.filter(function (part) { return part.length > 20; });
  }

  function rows() {
    return DB.all('docs');
  }

  function add(input) {
    var title = String((input && input.title) || '').trim() || 'Untitled document';
    var text = String((input && input.text) || '');
    if (text.trim().length < 20) {
      return { ok: false, error: 'That text is too short to index (20 characters minimum).' };
    }
    var parts = split(text);
    if (!parts.length) return { ok: false, error: 'Nothing indexable in that text.' };
    parts.forEach(function (part, index) {
      DB.insert('docs', {
        id: DB.uid('d'),
        title: title,
        body: part,
        source: (input && input.source) || 'paste',
        kind: String(index + 1) + '/' + parts.length,
        created: new Date().toISOString()
      });
    });
    return { ok: true, parts: parts.length, title: title, chars: text.length };
  }

  function list() {
    var seen = {};
    return rows().filter(function (row) {
      if (seen[row.title]) return false;
      seen[row.title] = true;
      return true;
    }).map(function (row) {
      var count = rows().filter(function (other) { return other.title === row.title; }).length;
      return { id: row.id, title: row.title, parts: count, created: row.created, source: row.source };
    });
  }

  function remove(title) {
    rows().filter(function (row) { return row.title === title; }).forEach(function (row) {
      if (DB.remove) DB.remove('docs', row.id);
    });
  }

  function clear() {
    if (DB.clear) DB.clear('docs');
  }

  function stats() {
    var all = rows();
    var titles = {};
    all.forEach(function (row) { titles[row.title] = true; });
    return { documents: Object.keys(titles).length, passages: all.length, backend: DB.available ? 'sqlite' : 'localStorage' };
  }

  /* ----------------------------------------------------------------- BM25 */

  function search(query, limit) {
    var q = tokens(query);
    if (!q.length) return [];
    var docs = rows();
    if (!docs.length) return [];
    var count = docs.length;
    var df = {};
    var lengths = [];
    var bag = docs.map(function (row) {
      var list = tokens((row.title || '') + ' ' + (row.body || ''));
      lengths.push(list.length);
      var freq = {};
      list.forEach(function (word) { freq[word] = (freq[word] || 0) + 1; });
      Object.keys(freq).forEach(function (word) { df[word] = (df[word] || 0) + 1; });
      return freq;
    });
    var avg = lengths.reduce(function (sum, n) { return sum + n; }, 0) / Math.max(1, count);
    var scored = [];
    docs.forEach(function (row, index) {
      var score = 0;
      q.forEach(function (term) {
        var f = bag[index][term] || 0;
        if (!f) return;
        var idf = Math.log(1 + (count - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5));
        score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (lengths[index] / avg))));
      });
      if (score > 0) scored.push({ row: row, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, Math.max(1, limit || 5)).map(function (hit) {
      var snippet = String(hit.row.body || '').slice(0, 320);
      return {
        title: hit.row.title,
        part: hit.row.kind || '',
        score: Math.round(hit.score * 100) / 100,
        snippet: snippet,
        text: hit.row.title + ' — ' + snippet
      };
    });
  }

  /* Text for the model's context, capped so it cannot eat the window. */
  function context(query, limit) {
    var hits = search(query, limit || 4);
    if (!hits.length) return '';
    return hits.map(function (hit, index) {
      return '[' + (index + 1) + '] ' + hit.title + (hit.part ? ' (' + hit.part + ')' : '') + '\n' + hit.snippet;
    }).join('\n\n').slice(0, 3200);
  }

  window.JarvisKB = {
    add: add,
    list: list,
    remove: remove,
    clear: clear,
    stats: stats,
    search: search,
    context: context,
    split: split,
    tokens: tokens,
    backend: function () { return DB.available ? 'sqlite' : 'localStorage'; }
  };
})();
