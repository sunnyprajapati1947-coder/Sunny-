/* Jarvis Pocket — knowledge pack: manifest index, chunk loader, search. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var TYPE_IDS = ['skill', 'agent', 'command', 'rule', 'prompt', 'workflow', 'doc'];

  var state = {
    manifest: null,
    items: [],
    byId: Object.create(null),
    chunkOf: Object.create(null),
    byPack: Object.create(null),
    pathMap: Object.create(null),
    chunks: Object.create(null),
    loading: null,
    savedAll: false
  };

  function normalize(path) {
    return String(path || '').replace(/^\.\//, '').replace(/\\/g, '/').toLowerCase();
  }

  function load() {
    if (state.manifest) return Promise.resolve(state.manifest);
    if (state.loading) return state.loading;
    state.loading = fetch('data/manifest.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('manifest ' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        state.manifest = manifest;
        state.items = manifest.items || [];
        state.items.forEach(function (item, index) {
          item._i = index;
          state.byId[item.i] = item;
          state.chunkOf[item.i] = item.c;
          var packId = manifest.packs[item.p] && manifest.packs[item.p].id;
          if (!state.byPack[packId]) state.byPack[packId] = [];
          state.byPack[packId].push(item);
          state.pathMap[item.p + ':' + normalize(item.f)] = item.i;
        });
        state.savedAll = UI.storeGet('offline.savedAll', false);
        return manifest;
      })
      .catch(function (error) {
        state.loading = null;
        throw error;
      });
    return state.loading;
  }

  function types() {
    return state.manifest ? state.manifest.types : {};
  }

  function packs() {
    return state.manifest ? state.manifest.packs : [];
  }

  function packOf(item) {
    if (!item || !state.manifest) return null;
    return state.manifest.packs[item.p] || null;
  }

  function typeOf(item) {
    return TYPE_IDS[item.y] || 'doc';
  }

  function getItem(id) {
    return state.byId[id] || null;
  }

  function itemsForPack(packId) {
    return state.byPack[packId] || [];
  }

  function chunkFor(index) {
    if (state.chunks[index]) return Promise.resolve(state.chunks[index]);
    var meta = state.manifest && state.manifest.chunks[index];
    if (!meta) return Promise.reject(new Error('missing chunk ' + index));
    return fetch('data/' + meta.f).then(function (response) {
      if (!response.ok) throw new Error('chunk ' + response.status);
      return response.json();
    }).then(function (payload) {
      state.chunks[index] = (payload && payload.items) || {};
      return state.chunks[index];
    });
  }

  function loadBody(id) {
    var item = getItem(id);
    if (!item) return Promise.reject(new Error('unknown item'));
    return chunkFor(item.c).then(function (chunk) {
      var payload = chunk[id];
      if (!payload) throw new Error('item missing from chunk');
      return { markdown: payload.m || '', truncated: !!payload.x, item: item };
    });
  }

  function tokenize(query) {
    return String(query || '').toLowerCase().split(/[^a-z0-9+.#]+/).filter(function (token) {
      return token.length > 1;
    }).slice(0, 8);
  }

  function scoreItem(item, tokens, full) {
    var title = item.t.toLowerCase();
    var keywords = (item.k || '').toLowerCase();
    var desc = (item.d || '').toLowerCase();
    var tags = (item.g || []).join(' ').toLowerCase();
    var pack = (packOf(item) ? packOf(item).name : '').toLowerCase();
    var score = 0;
    var matched = 0;
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      var hit = 0;
      if (title.indexOf(token) !== -1) hit += title.indexOf(token) === 0 ? 12 : 9;
      if (keywords.indexOf(token) !== -1) hit += 4;
      if (tags.indexOf(token) !== -1) hit += 4;
      if (desc.indexOf(token) !== -1) hit += 2;
      if (pack.indexOf(token) !== -1) hit += 1;
      if (!hit && full) {
        var body = full[item._i];
        if (body && body.indexOf(token) !== -1) hit += 1;
      }
      if (hit) matched += 1;
      score += hit;
    }
    if (!matched) return 0;
    if (matched < tokens.length) score *= matched / tokens.length;
    score += Math.min(3, Math.log(1 + (item.d || '').length) / 3);
    return score;
  }

  function search(query, opts) {
    var options = opts || {};
    var tokens = tokenize(query);
    if (!tokens.length) return [];
    var pool = state.items;
    if (options.pack) {
      var packId = typeof options.pack === 'string' ? options.pack : options.pack.id;
      pool = itemsForPack(packId);
    }
    var results = [];
    for (var i = 0; i < pool.length; i += 1) {
      var item = pool[i];
      if (options.type && typeOf(item) !== options.type) continue;
      var score = scoreItem(item, tokens, options.full);
      if (score > 0) results.push({ item: item, score: score });
    }
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.t || '').localeCompare(b.item.t || '');
    });
    var limit = options.limit || 40;
    return results.slice(0, limit).map(function (row) {
      return row.item;
    });
  }

  function searchScored(query, limit) {
    var tokens = tokenize(query);
    var out = [];
    if (!tokens.length) return out;
    for (var i = 0; i < state.items.length; i += 1) {
      var score = scoreItem(state.items[i], tokens);
      if (score > 0) out.push({ item: state.items[i], score: score });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 6);
  }

  function related(item, limit) {
    var words = String(item.k || '').split(/\s+/).filter(function (word) { return word.length > 3; }).slice(0, 5);
    if (!words.length) return [];
    var out = [];
    var pool = itemsForPack(packOf(item) && packOf(item).id);
    for (var i = 0; i < pool.length; i += 1) {
      var candidate = pool[i];
      if (candidate.i === item.i) continue;
      var haystack = (candidate.t + ' ' + candidate.k + ' ' + (candidate.g || []).join(' ')).toLowerCase();
      var score = 0;
      for (var w = 0; w < words.length; w += 1) {
        if (haystack.indexOf(words[w]) !== -1) score += 1;
      }
      if (score >= 2) out.push({ item: candidate, score: score });
      if (out.length > 80) break;
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 5).map(function (row) { return row.item; });
  }

  function bodyText(id) {
    var item = getItem(id);
    if (!item) return Promise.resolve('');
    return chunkFor(item.c).then(function (chunk) {
      return (chunk[id] && chunk[id].m) || '';
    });
  }

  function contextFor(query, limit) {
    var hits = searchScored(query, limit || 4);
    if (!hits.length) return Promise.resolve('');
    var tasks = hits.map(function (hit) {
      return bodyText(hit.item.i).then(function (text) {
        return { item: hit.item, text: text };
      }).catch(function () {
        return { item: hit.item, text: '' };
      });
    });
    return Promise.all(tasks).then(function (rows) {
      var parts = [];
      rows.forEach(function (row) {
        if (!row.text) return;
        var pack = packOf(row.item);
        var snippet = row.text.replace(/\s+/g, ' ').slice(0, 1100);
        parts.push(
          '### ' + row.item.t + '\n' +
          'type: ' + typeOf(row.item) + ' · pack: ' + (pack ? pack.name : '') + ' · id: ' + row.item.i + '\n' +
          snippet
        );
      });
      return parts.join('\n\n---\n\n');
    });
  }

  function resolvePath(packIndex, path) {
    var key = packIndex + ':' + normalize(path);
    if (state.pathMap[key]) return state.pathMap[key];
    var stripped = normalize(path).replace(/^\/+/, '');
    key = packIndex + ':' + stripped;
    return state.pathMap[key] || null;
  }

  function sourceUrl(item) {
    var pack = packOf(item);
    if (!pack || !pack.repo) return '';
    var ref = pack.sha || 'HEAD';
    return 'https://github.com/' + pack.repo + '/blob/' + ref + '/' + encodeURI(item.f);
  }

  function saveAll(onProgress) {
    var total = state.manifest.chunks.length;
    var done = 0;
    var failed = 0;
    var chain = Promise.resolve();
    state.manifest.chunks.forEach(function (meta, index) {
      chain = chain.then(function () {
        return chunkFor(index).then(function () {
          done += 1;
        }).catch(function () {
          failed += 1;
          done += 1;
        }).then(function () {
          if (onProgress) onProgress(done, total);
        });
      });
    });
    return chain.then(function () {
      state.savedAll = failed === 0;
      UI.storeSet('offline.savedAll', state.savedAll);
      return { total: total, failed: failed };
    });
  }

  function stats() {
    var manifest = state.manifest;
    if (!manifest) return { items: 0, packs: 0, bytes: 0, byType: {} };
    var byType = {};
    state.items.forEach(function (item) {
      var type = typeOf(item);
      byType[type] = (byType[type] || 0) + 1;
    });
    return {
      items: state.items.length,
      packs: manifest.packs.length,
      bytes: manifest.stats ? manifest.stats.bytes : 0,
      byType: byType,
      built: manifest.built
    };
  }

  function collections() {
    return (state.manifest && state.manifest.collections) || [];
  }

  window.JarvisPack = {
    load: load,
    types: types,
    packs: packs,
    packOf: packOf,
    typeOf: typeOf,
    getItem: getItem,
    itemsForPack: itemsForPack,
    loadBody: loadBody,
    bodyText: bodyText,
    search: search,
    searchScored: searchScored,
    related: related,
    contextFor: contextFor,
    resolvePath: resolvePath,
    sourceUrl: sourceUrl,
    saveAll: saveAll,
    stats: stats,
    collections: collections,
    isSavedAll: function () { return state.savedAll; },
    loaded: function () { return !!state.manifest; }
  };
})();
