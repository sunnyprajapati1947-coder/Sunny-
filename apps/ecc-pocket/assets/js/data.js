/* ECC Pocket — content pack loader, search and chunk cache. */
(function () {
  'use strict';

  var MAX_CACHED_CHUNKS = 14;

  var state = {
    manifest: null,
    byId: new Map(),
    byType: {},
    collections: new Map(),
    fileMap: {},
    categoryLabels: {},
    chunkCache: new Map(),
    chunkRequests: new Map(),
    searchCache: new Map()
  };

  function normalize(text) {
    var value = String(text == null ? '' : text).toLowerCase();
    if (value.normalize) {
      value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return value;
  }

  function manifestUrl() {
    return new URL('data/manifest.json', document.baseURI).href;
  }

  function chunkUrl(type, index) {
    return new URL('data/chunks/' + type + '-' + index + '.json', document.baseURI).href;
  }

  async function load() {
    var response = await fetch(manifestUrl(), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Manifest request failed (HTTP ' + response.status + ')');
    var manifest = await response.json();
    state.manifest = manifest;
    state.byId = new Map();
    state.byType = {};
    state.collections = new Map();
    state.fileMap = manifest.fileMap || {};
    state.categoryLabels = {};
    (manifest.categories || []).forEach(function (cat) { state.categoryLabels[cat.id] = cat.label; });

    manifest.items.forEach(function (item) {
      item.id = item.id || String(item.i).slice(item.t.length + 1);
      state.byId.set(item.i, item);
      if (!state.byType[item.t]) state.byType[item.t] = [];
      state.byType[item.t].push(item);
    });
    (manifest.collections || []).forEach(function (collection) {
      state.collections.set(collection.id, collection);
    });
    return manifest;
  }

  function item(type, id) {
    return state.byId.get(type + ':' + id) || null;
  }

  function itemById(compositeId) {
    return state.byId.get(compositeId) || null;
  }

  function all(type) {
    return state.byType[type] || [];
  }

  function counts() {
    return state.manifest ? state.manifest.counts : {};
  }

  function total() {
    var sum = 0;
    Object.keys(counts()).forEach(function (key) { sum += counts()[key]; });
    return sum;
  }

  function collection(id) {
    return state.collections.get(id) || null;
  }

  function collections() {
    return Array.from(state.collections.values());
  }

  function categoryLabel(id) {
    return state.categoryLabels[id] || id;
  }

  function categoriesFor(type) {
    var map = new Map();
    all(type).forEach(function (entry) {
      var key = type === 'rule' ? (entry.g || 'Other') : (entry.c || 'Other');
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(function (pair) { return { id: pair[0], label: pair[0], count: pair[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  function evictChunks() {
    while (state.chunkCache.size > MAX_CACHED_CHUNKS) {
      var oldest = state.chunkCache.keys().next().value;
      state.chunkCache.delete(oldest);
    }
  }

  function chunk(type, index) {
    var key = type + '-' + index;
    if (state.chunkCache.has(key)) {
      var cached = state.chunkCache.get(key);
      // refresh LRU position
      state.chunkCache.delete(key);
      state.chunkCache.set(key, cached);
      return Promise.resolve(cached);
    }
    if (state.chunkRequests.has(key)) return state.chunkRequests.get(key);
    var request = fetch(chunkUrl(type, index))
      .then(function (response) {
        if (!response.ok) throw new Error('Content request failed (HTTP ' + response.status + ')');
        return response.json();
      })
      .then(function (payload) {
        state.chunkCache.set(key, payload);
        evictChunks();
        state.chunkRequests.delete(key);
        return payload;
      })
      .catch(function (error) {
        state.chunkRequests.delete(key);
        throw error;
      });
    state.chunkRequests.set(key, request);
    return request;
  }

  function contentFor(entry) {
    if (!entry) return Promise.reject(new Error('Unknown item'));
    return chunk(entry.t, entry.ch).then(function (payload) {
      var key = entry.id || String(entry.i).slice(entry.t.length + 1);
      var content = payload[key];
      if (!content) throw new Error('Missing content for ' + key);
      return content;
    });
  }

  function haystack(entry) {
    if (state.searchCache.has(entry.i)) return state.searchCache.get(entry.i);
    var parts = [
      entry.ti || '', entry.n || '', entry.d || '',
      entry.c || '', entry.g || '', (entry.k || []).join(' ')
    ];
    var text = normalize(parts.join(' \u2022 '));
    state.searchCache.set(entry.i, text);
    return text;
  }

  function scoreEntry(entry, tokens, raw) {
    var title = normalize(entry.ti);
    var name = normalize(entry.n);
    var hay = haystack(entry);
    var score = 0;
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      var tokenScore = 0;
      if (title === raw) tokenScore += 120;
      if (title.indexOf(token) === 0) tokenScore += 70;
      if (new RegExp('(^|[^a-z0-9])' + escapeRegExp(token)).test(title)) tokenScore += 40;
      if (title.indexOf(token) > -1) tokenScore += 26;
      if (name.indexOf(token) > -1) tokenScore += 22;
      if (hay.indexOf(token) === -1) return -1;
      if (normalize(entry.c).indexOf(token) > -1) tokenScore += 10;
      if ((entry.k || []).some(function (tag) { return normalize(tag).indexOf(token) > -1; })) tokenScore += 14;
      score += tokenScore || 6;
    }
    return score;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function search(query, options) {
    var opts = options || {};
    var raw = normalize(query).trim();
    if (!raw) return [];
    var tokens = raw.split(/\s+/).filter(Boolean);
    var pool = opts.type ? all(opts.type) : Array.from(state.byId.values());
    var results = [];
    pool.forEach(function (entry) {
      var score = scoreEntry(entry, tokens, raw);
      if (score >= 0) results.push({ entry: entry, score: score });
    });
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.ti.localeCompare(b.entry.ti);
    });
    var limit = opts.limit || 40;
    return results.slice(0, limit).map(function (row) { return row.entry; });
  }

  function resolveFile(path) {
    return state.fileMap[path] || null;
  }

  function normalizeRepoPath(path) {
    if (!path) return '';
    if (path.charAt(0) === '/') return path.slice(1);
    return path;
  }

  function sourceUrl(path) {
    var commit = state.manifest && state.manifest.source ? state.manifest.source.commit : 'main';
    return 'https://github.com/affaan-m/ECC/blob/' + commit + '/' + normalizeRepoPath(path);
  }

  function rawUrl(path) {
    var commit = state.manifest && state.manifest.source ? state.manifest.source.commit : 'main';
    return 'https://raw.githubusercontent.com/affaan-m/ECC/' + commit + '/' + normalizeRepoPath(path);
  }

  function generatedDate() {
    if (!state.manifest || !state.manifest.generated) return '';
    var date = new Date(state.manifest.generated);
    if (isNaN(date.getTime())) return state.manifest.generated;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async function downloadAll(onProgress) {
    if (!state.manifest) throw new Error('Manifest not loaded');
    var types = Object.keys(state.manifest.chunks || {});
    var total = types.reduce(function (sum, type) { return sum + state.manifest.chunks[type]; }, 0);
    var done = 0;
    for (var i = 0; i < types.length; i += 1) {
      var type = types[i];
      for (var index = 0; index < state.manifest.chunks[type]; index += 1) {
        try {
          var response = await fetch(chunkUrl(type, index), { cache: 'reload' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          // Parse so a corrupt payload is not silently cached.
          await response.clone().json();
        } catch (error) {
          if (onProgress) onProgress(done, total, error);
          throw error;
        }
        done += 1;
        if (onProgress) onProgress(done, total);
      }
    }
    return { chunks: total };
  }

  function storageInfo() {
    if (!state.manifest) return { bytes: 0, chunks: 0 };
    return { chunks: state.manifest.chunks || {} };
  }

  window.ECCData = {
    load: load,
    item: item,
    itemById: itemById,
    all: all,
    counts: counts,
    total: total,
    collection: collection,
    collections: collections,
    categoryLabel: categoryLabel,
    categoriesFor: categoriesFor,
    chunk: chunk,
    contentFor: contentFor,
    search: search,
    resolveFile: resolveFile,
    sourceUrl: sourceUrl,
    rawUrl: rawUrl,
    generatedDate: generatedDate,
    downloadAll: downloadAll,
    storageInfo: storageInfo,
    get manifest() { return state.manifest; },
    get fileMap() { return state.fileMap; }
  };
})();
