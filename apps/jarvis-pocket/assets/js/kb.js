/* JARVIS — local knowledge base.
 *
 * Documents are split into passages and ranked with BM25, computed on the
 * phone. No embeddings service, no cloud vector store: the index is rebuilt
 * from the local rows whenever it is stale.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var DB = window.JarvisDB;

  var CHUNK = 800;
  var OVERLAP = 120;
  var STOP = ('the a an and or but if then of to in on at for with from by is are was were be been being this that these those it its as not no yes ' +
    'i you he she we they me my your our their do does did have has had can could should would will just about into over under than so such').split(' ');

  var stop = {};
  STOP.forEach(function (word) { stop[word] = true; });

  function tokenize(text) {
    var raw = String(text || '').toLowerCase().match(/[\u0900-\u097F]+|[a-z0-9][a-z0-9'_-]*/g) || [];
    var out = [];
    raw.forEach(function (word) {
      if (word.length < 2) return;
      if (stop[word]) return;
      out.push(word);
    });
    return out;
  }

  function chunks(text) {
    var clean = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) return [];
    if (clean.length <= CHUNK) return [clean];
    var parts = [];
    var start = 0;
    while (start < clean.length) {
      var end = Math.min(clean.length, start + CHUNK);
      if (end < clean.length) {
        var cut = clean.lastIndexOf('\n', end);
        if (cut > start + CHUNK * 0.5) end = cut;
      }
      parts.push(clean.slice(start, end).trim());
      if (end >= clean.length) break;
      start = Math.max(end - OVERLAP, start + 1);
    }
    return parts.filter(Boolean);
  }

  function documents() {
    if (!DB) return [];
    return DB.all('docs');
  }

  function add(options) {
    var title = String((options && options.title) || 'Untitled document').trim().slice(0, 120);
    var text = String((options && options.text) || '');
    if (!text.trim()) return { ok: false, error: 'The document is empty.' };
    if (!DB) return { ok: false, error: 'Document storage did not load.' };
    var parts = chunks(text);
    var created = Date.now();
    var ids = parts.map(function (part, index) {
      var row = DB.insert('docs', {
        title: title + (parts.length > 1 ? ' · part ' + (index + 1) : ''),
        body: part,
        source: (options && options.source) || 'paste',
        created: created + index
      });
      return row.id;
    });
    stale = true;
    return { ok: true, id: ids[0], parts: parts.length, chars: text.length };
  }

  function remove(id) {
    if (!DB) return false;
    DB.remove('docs', id);
    stale = true;
    return true;
  }

  function clear() {
    if (!DB) return;
    DB.clear('docs');
    stale = true;
  }

  /* --------------------------------------------------------------- ranking */

  var index = null;
  var stale = true;

  function build() {
    var rows = documents();
    var postings = {};
    var lengths = [];
    var docs = rows.map(function (row, position) {
      var tokens = tokenize(row.body);
      var counts = {};
      tokens.forEach(function (token) { counts[token] = (counts[token] || 0) + 1; });
      Object.keys(counts).forEach(function (token) {
        if (!postings[token]) postings[token] = [];
        postings[token].push({ pos: position, tf: counts[token] });
      });
      lengths.push(tokens.length);
      return { row: row, position: position, length: tokens.length };
    });
    var avg = lengths.length ? lengths.reduce(function (a, b) { return a + b; }, 0) / lengths.length : 0;
    index = { docs: docs, postings: postings, avg: avg || 1, total: docs.length };
    stale = false;
    return index;
  }

  function ensure() {
    if (!index || stale) build();
    return index;
  }

  function search(query, limit) {
    var idx = ensure();
    if (!idx.docs.length) return [];
    var terms = tokenize(query);
    if (!terms.length) return [];
    var k1 = 1.4;
    var b = 0.72;
    var scores = {};
    terms.forEach(function (term) {
      var rows = idx.postings[term];
      if (!rows) return;
      var idf = Math.log(1 + (idx.total - rows.length + 0.5) / (rows.length + 0.5));
      rows.forEach(function (row) {
        var doc = idx.docs[row.pos];
        var norm = row.tf + k1 * (1 - b + b * (doc.length / idx.avg));
        var score = idf * ((row.tf * (k1 + 1)) / (norm || 1));
        scores[row.pos] = (scores[row.pos] || 0) + score;
      });
    });
    return Object.keys(scores).map(function (pos) {
      var doc = idx.docs[Number(pos)];
      return { score: Math.round(scores[pos] * 100) / 100, title: doc.row.title, text: doc.row.body, id: doc.row.id };
    }).sort(function (a, b2) { return b2.score - a.score; }).slice(0, limit || 5);
  }

  function context(query, limit) {
    var hits = search(query, limit || 3);
    if (!hits.length) return '';
    return hits.map(function (hit, i) {
      return '[' + (i + 1) + '] ' + hit.title + '\n' + hit.text.slice(0, 700);
    }).join('\n\n');
  }

  function stats() {
    var rows = documents();
    var chars = rows.reduce(function (sum, row) { return sum + String(row.body || '').length; }, 0);
    return { documents: rows.length, chars: chars, backend: DB ? DB.stats().backend : 'none' };
  }

  window.JarvisKB = {
    add: add,
    remove: remove,
    clear: clear,
    list: documents,
    search: search,
    context: context,
    stats: stats,
    tokenize: tokenize,
    chunks: chunks
  };
})();
