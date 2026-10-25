/* Jarvis Pocket — library, search, pack, reader and saved screens. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;
  var MD = window.JarvisMarkdown;

  var TYPE_ORDER = ['skill', 'agent', 'command', 'rule', 'prompt', 'workflow', 'doc'];
  var listState = { pack: '', type: '', query: '', limit: 24 };

  function typeLabel(type) {
    var map = Pack.types();
    return map[type] || type;
  }

  function savedIds() {
    var rows = UI.storeGet('saved', []);
    return Array.isArray(rows) ? rows : [];
  }

  function isSaved(id) {
    return savedIds().indexOf(id) !== -1;
  }

  function toggleSaved(id) {
    var rows = savedIds();
    var index = rows.indexOf(id);
    if (index === -1) rows.unshift(id);
    else rows.splice(index, 1);
    UI.storeSet('saved', rows.slice(0, 400));
    return index === -1;
  }

  function typeBadge(item) {
    var type = Pack.typeOf(item);
    return '<span class="badge badge-' + type + '">' + UI.esc(typeLabel(type)) + '</span>';
  }

  function packName(item) {
    var pack = Pack.packOf(item);
    return pack ? pack.name : '';
  }

  function itemRow(item, query) {
    return '<a class="item-row" href="#/item/' + encodeURIComponent(item.i) + '">' +
      '<span class="item-main">' +
        '<span class="item-title">' + UI.highlight(item.t, query) + '</span>' +
        '<span class="item-desc">' + UI.highlight((item.d || '').slice(0, 130), query) + '</span>' +
        '<span class="item-meta">' + typeBadge(item) + '<span class="pack-dot">' + UI.esc(packName(item)) + '</span></span>' +
      '</span>' +
      '<span class="row-chev">' + UI.icon('chevron') + '</span>' +
    '</a>';
  }

  function emptyResults(message, hint) {
    return '<div class="empty-block">' + UI.icon('search') +
      '<h3>' + UI.esc(message) + '</h3>' +
      '<p>' + UI.esc(hint || 'Try a shorter query or another pack.') + '</p></div>';
  }

  /* ------------------------------------------------------------- library */

  function libraryScreen() {
    var stats = Pack.stats();
    var packs = Pack.packs();
    var collections = Pack.collections();
    var counts = stats.byType || {};

    var typeChips = '<button class="chip' + (listState.type === '' ? ' is-on' : '') + '" data-type="">All</button>' +
      TYPE_ORDER.filter(function (type) { return counts[type]; }).map(function (type) {
        return '<button class="chip chip-type chip-' + type + (listState.type === type ? ' is-on' : '') + '" data-type="' + type + '">' +
          UI.esc(typeLabel(type)) + '<em>' + counts[type] + '</em></button>';
      }).join('');

    var packChips = packs.map(function (pack) {
      return '<button class="pack-chip' + (listState.pack === pack.id ? ' is-on' : '') + '" data-pack="' + pack.id + '">' +
        '<span>' + UI.esc(pack.name) + '</span><em>' + pack.count + '</em></button>';
    }).join('');

    var collectionCards = collections.slice(0, 6).map(function (collection) {
      return '<a class="collection-card" href="#/collection/' + encodeURIComponent(collection.id) + '">' +
        '<strong>' + UI.esc(collection.title) + '</strong>' +
        '<span>' + UI.esc(collection.blurb) + '</span>' +
        '<em>' + collection.items.length + ' picks' + UI.icon('chevron') + '</em>' +
      '</a>';
    }).join('');

    return '' +
      '<section class="screen library-screen">' +
        '<div class="screen-head">' +
          '<h1>Library</h1>' +
          '<p>' + stats.items + ' items from ' + stats.packs + ' open-source agent repos</p>' +
        '</div>' +
        '<a class="searchbar" href="#/search">' + UI.icon('search') +
          '<span>Search skills, agents, commands…</span><kbd>/</kbd></a>' +
        '<div class="chip-scroll" id="typeChips">' + typeChips + '</div>' +
        '<div class="chip-scroll pack-scroll" id="packChips">' +
          '<button class="pack-chip' + (listState.pack === '' ? ' is-on' : '') + '" data-pack="">All packs</button>' + packChips +
        '</div>' +
        (collections.length ? '<section class="section"><div class="section-head"><h2>Curated paths</h2>' +
          '<span class="muted">hand-picked</span></div><div class="collection-grid">' + collectionCards + '</div></section>' : '') +
        '<section class="section">' +
          '<div class="section-head"><h2 id="listTitle">' + listTitle() + '</h2>' +
            '<span class="muted" id="listCount"></span></div>' +
          '<div class="list" id="resultList"></div>' +
          '<button class="btn btn-ghost btn-block" id="loadMore" hidden>Load more</button>' +
        '</section>' +
      '</section>';
  }

  function listTitle() {
    var parts = [];
    if (listState.pack) {
      var pack = Pack.packs().filter(function (row) { return row.id === listState.pack; })[0];
      if (pack) parts.push(pack.name);
    }
    if (listState.type) parts.push(typeLabel(listState.type));
    return parts.length ? parts.join(' · ') : 'Browse everything';
  }

  function filteredItems() {
    var pool = listState.pack ? Pack.itemsForPack(listState.pack) : null;
    var rows = pool ? pool.slice() : [];
    if (!pool) {
      Pack.packs().forEach(function (pack) {
        Pack.itemsForPack(pack.id).forEach(function (item) { rows.push(item); });
      });
    }
    if (listState.type) {
      rows = rows.filter(function (item) { return Pack.typeOf(item) === listState.type; });
    }
    if (listState.query) {
      var ids = Pack.search(listState.query, { pack: listState.pack || null, type: listState.type || null, limit: 400 })
        .map(function (item) { return item.i; });
      var order = Object.create(null);
      ids.forEach(function (id, index) { order[id] = index; });
      rows = rows.filter(function (item) { return ids.indexOf(item.i) !== -1; });
      rows.sort(function (a, b) { return order[a.i] - order[b.i]; });
    } else {
      rows.sort(function (a, b) { return (a.t || '').localeCompare(b.t || ''); });
    }
    return rows;
  }

  function paintList() {
    var list = document.getElementById('resultList');
    var more = document.getElementById('loadMore');
    var count = document.getElementById('listCount');
    var title = document.getElementById('listTitle');
    if (!list) return;
    var rows = filteredItems();
    if (title) title.textContent = listTitle();
    if (count) count.textContent = rows.length + ' items';
    if (!rows.length) {
      list.innerHTML = emptyResults('Nothing found', listState.query ? 'Shorten the query or change the pack.' : 'Try another filter.');
      if (more) more.hidden = true;
      return;
    }
    list.innerHTML = rows.slice(0, listState.limit).map(function (item) {
      return itemRow(item, listState.query);
    }).join('');
    if (more) more.hidden = rows.length <= listState.limit;
  }

  function mountLibrary() {
    var list = document.getElementById('resultList');
    if (!list) return;
    listState.limit = 24;
    paintList();

    var typeHost = document.getElementById('typeChips');
    if (typeHost) {
      typeHost.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-type]');
        if (!chip) return;
        listState.type = chip.getAttribute('data-type');
        listState.limit = 24;
        Array.prototype.forEach.call(typeHost.querySelectorAll('.chip'), function (node) {
          node.classList.toggle('is-on', node === chip);
        });
        paintList();
      });
    }

    var packHost = document.getElementById('packChips');
    if (packHost) {
      packHost.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-pack]');
        if (!chip) return;
        listState.pack = chip.getAttribute('data-pack');
        listState.limit = 24;
        Array.prototype.forEach.call(packHost.querySelectorAll('.pack-chip'), function (node) {
          node.classList.toggle('is-on', node === chip);
        });
        paintList();
        var section = document.getElementById('listTitle');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    var more = document.getElementById('loadMore');
    if (more) {
      more.addEventListener('click', function () {
        listState.limit += 24;
        paintList();
      });
    }
  }

  /* -------------------------------------------------------------- search */

  function searchScreen(params) {
    var query = (params && params.q) || '';
    listState.query = query;
    return '' +
      '<section class="screen search-screen">' +
        '<form class="searchbar is-input" id="searchForm" role="search">' +
          UI.icon('search') +
          '<input id="searchInput" type="search" placeholder="Search ' + Pack.stats().items + ' items…" value="' + UI.esc(query) + '" autocomplete="off" enterkeyhint="search">' +
          '<button type="button" class="icon-btn" id="clearSearch" aria-label="Clear">' + UI.icon('x') + '</button>' +
        '</form>' +
        '<div class="chip-scroll" id="searchChips">' +
          '<button class="chip is-on" data-type="">All</button>' +
          TYPE_ORDER.map(function (type) {
            return '<button class="chip chip-type chip-' + type + '" data-type="' + type + '">' + UI.esc(typeLabel(type)) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="list" id="searchResults"></div>' +
      '</section>';
  }

  function runSearch(query, type) {
    var host = document.getElementById('searchResults');
    if (!host) return;
    listState.query = query;
    listState.type = type || '';
    listState.limit = 24;
    if (!query.trim()) {
      var recent = UI.storeGet('search.recent', []);
      host.innerHTML = recent.length
        ? '<div class="recent-block"><h3>Recent</h3><div class="chips-wrap">' + recent.map(function (term) {
          return '<button class="chip" data-recent="' + UI.esc(term) + '">' + UI.icon('clock') + UI.esc(term) + '</button>';
        }).join('') + '</div></div>'
        : emptyResults('Search the whole pack', 'Try "voice", "memory", "trading" or "SEO".');
      return;
    }
    var hits = Pack.search(query, { type: type || null, limit: 60 });
    if (!hits.length) {
      host.innerHTML = emptyResults('No match for "' + query + '"', 'Check the spelling or use a shorter keyword.');
      return;
    }
    host.innerHTML = '<p class="muted list-count">' + hits.length + ' results</p>' + hits.map(function (item) {
      return itemRow(item, query);
    }).join('');
  }

  function mountSearch(params) {
    var form = document.getElementById('searchForm');
    var input = document.getElementById('searchInput');
    var chips = document.getElementById('searchChips');
    if (!form || !input) return;
    runSearch(input.value, '');
    input.focus();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch(input.value, listState.type);
      rememberSearch(input.value);
    });
    var debounced = UI.debounce(function () {
      runSearch(input.value, listState.type);
    }, 220);
    input.addEventListener('input', debounced);
    var clear = document.getElementById('clearSearch');
    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        runSearch('', listState.type);
        input.focus();
      });
    }
    if (chips) {
      chips.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-type]');
        if (!chip) return;
        Array.prototype.forEach.call(chips.querySelectorAll('.chip'), function (node) {
          node.classList.toggle('is-on', node === chip);
        });
        runSearch(input.value, chip.getAttribute('data-type'));
      });
    }
    var host = document.getElementById('searchResults');
    if (host) {
      host.addEventListener('click', function (event) {
        var recent = event.target.closest('[data-recent]');
        if (!recent) return;
        input.value = recent.getAttribute('data-recent');
        runSearch(input.value, listState.type);
      });
    }
  }

  function rememberSearch(term) {
    var value = String(term || '').trim();
    if (value.length < 2) return;
    var recent = UI.storeGet('search.recent', []);
    recent = recent.filter(function (row) { return row !== value; });
    recent.unshift(value);
    UI.storeSet('search.recent', recent.slice(0, 8));
  }

  /* ---------------------------------------------------------------- pack */

  function packScreen(packId) {
    var pack = Pack.packs().filter(function (row) { return row.id === packId; })[0];
    if (!pack) return notFound('Pack not found');
    var items = Pack.itemsForPack(pack.id).slice().sort(function (a, b) { return (a.t || '').localeCompare(b.t || ''); });
    var counts = {};
    items.forEach(function (item) { counts[Pack.typeOf(item)] = (counts[Pack.typeOf(item)] || 0) + 1; });

    return '' +
      '<section class="screen pack-screen">' +
        '<a class="back-link" href="#/library">' + UI.icon('arrow-left') + 'Library</a>' +
        '<header class="pack-head">' +
          '<h1>' + UI.esc(pack.name) + '</h1>' +
          '<p>' + UI.esc(pack.desc || 'Open-source agent pack.') + '</p>' +
          '<div class="pack-facts">' +
            (pack.stars ? '<span>' + UI.icon('star') + pack.stars.toLocaleString() + '</span>' : '') +
            (pack.license ? '<span>' + UI.icon('shield') + UI.esc(pack.license) + '</span>' : '') +
            (pack.lang ? '<span>' + UI.icon('code') + UI.esc(pack.lang) + '</span>' : '') +
            '<span>' + UI.icon('book') + items.length + ' items</span>' +
          '</div>' +
          '<div class="pack-actions">' +
            '<button class="btn btn-primary" data-pack-ask="' + pack.id + '">' + UI.icon('spark') + 'Ask Jarvis</button>' +
            (pack.url ? '<a class="btn btn-ghost" href="' + UI.esc(pack.url) + '" target="_blank" rel="noopener noreferrer">' + UI.icon('external') + 'GitHub</a>' : '') +
          '</div>' +
        '</header>' +
        '<div class="chips-wrap">' + TYPE_ORDER.filter(function (type) { return counts[type]; }).map(function (type) {
          return '<span class="chip chip-static chip-' + type + '">' + typeLabel(type) + ' ' + counts[type] + '</span>';
        }).join('') + '</div>' +
        '<div class="list">' + items.slice(0, 40).map(function (item) { return itemRow(item, ''); }).join('') + '</div>' +
        (items.length > 40 ? '<p class="muted center">Showing first 40 of ' + items.length + ' — use search for the rest.</p>' : '') +
      '</section>';
  }

  function mountPack(packId) {
    var ask = document.querySelector('[data-pack-ask]');
    if (ask) {
      ask.addEventListener('click', function () {
        var pack = Pack.packs().filter(function (row) { return row.id === packId; })[0];
        if (!pack) return;
        window.JarvisChat.askAboutText('Repo "' + pack.name + '" (' + pack.repo + ') explain its structure and the most useful skills — how do I use it from the phone?');
      });
    }
  }

  /* -------------------------------------------------------------- reader */

  function notFound(message) {
    return '<section class="screen"><div class="empty-block">' + UI.icon('alert') +
      '<h3>' + UI.esc(message) + '</h3><a class="btn btn-ghost" href="#/library">Back to library</a></div></section>';
  }

  function itemScreen(itemId) {
    var item = Pack.getItem(itemId);
    if (!item) return notFound('Item not found');
    var pack = Pack.packOf(item);
    var saved = isSaved(item.i);
    return '' +
      '<section class="screen reader-screen">' +
        '<a class="back-link" href="#/pack/' + (pack ? pack.id : '') + '">' + UI.icon('arrow-left') + UI.esc(pack ? pack.name : 'Library') + '</a>' +
        '<header class="reader-head">' +
          '<div class="reader-tags">' + typeBadge(item) + (pack ? '<span class="pack-dot">' + UI.esc(pack.name) + '</span>' : '') + '</div>' +
          '<h1>' + UI.esc(item.t) + '</h1>' +
          (item.d ? '<p class="reader-desc">' + UI.esc(item.d) + '</p>' : '') +
          '<div class="reader-actions">' +
            '<button class="icon-btn' + (saved ? ' is-on' : '') + '" data-item-save="' + item.i + '" aria-label="Save">' + UI.icon(saved ? 'bookmark-filled' : 'bookmark') + '</button>' +
            '<button class="icon-btn" data-item-toc aria-label="Contents">' + UI.icon('list') + '</button>' +
            '<button class="icon-btn" data-item-copy aria-label="Copy markdown">' + UI.icon('copy') + '</button>' +
            '<button class="icon-btn" data-item-share aria-label="Share">' + UI.icon('share') + '</button>' +
            '<button class="icon-btn" data-item-speak aria-label="Read aloud">' + UI.icon('volume') + '</button>' +
          '</div>' +
        '</header>' +
        '<article class="prose" id="itemBody"><div class="skeleton-lines"><span></span><span></span><span></span></div></article>' +
        '<div class="reader-foot">' +
          '<button class="btn btn-primary btn-block" data-item-ask="' + item.i + '">' + UI.icon('spark') + 'Ask Jarvis about this</button>' +
          (pack && pack.url ? '<a class="btn btn-ghost btn-block" href="' + UI.esc(Pack.sourceUrl(item)) + '" target="_blank" rel="noopener noreferrer">' + UI.icon('external') + 'View source on GitHub</a>' : '') +
          '<p class="muted center small">' + UI.esc(item.f) + (pack && pack.sha ? ' · ' + pack.sha : '') + '</p>' +
        '</div>' +
        '<section class="section" id="relatedSection"></section>' +
      '</section>';
  }

  function mountItem(itemId) {
    var item = Pack.getItem(itemId);
    var body = document.getElementById('itemBody');
    if (!item || !body) return;
    var markdown = '';

    Pack.loadBody(item.i).then(function (payload) {
      markdown = payload.markdown;
      body.innerHTML = MD.render(markdown, item);
      var headings = body.querySelectorAll('h1, h2, h3');
      if (headings.length) body.querySelector('h1, h2, h3').classList.add('is-first');
      var truncNote = payload.truncated
        ? '<p class="muted small center">Long file — first part shown. <a href="' + UI.esc(Pack.sourceUrl(item)) + '" target="_blank" rel="noopener noreferrer">Full file on GitHub</a></p>'
        : '';
      if (truncNote) body.insertAdjacentHTML('beforeend', truncNote);

      var related = Pack.related(item, 4);
      var relatedHost = document.getElementById('relatedSection');
      if (relatedHost && related.length) {
        relatedHost.innerHTML = '<div class="section-head"><h2>Related</h2></div><div class="list">' +
          related.map(function (row) { return itemRow(row, ''); }).join('') + '</div>';
      }

      Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (anchor) {
        if (anchor.dataset.anchor) {
          anchor.addEventListener('click', function (event) {
            var target = document.getElementById(anchor.dataset.anchor);
            if (target) {
              event.preventDefault();
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        }
      });
    }).catch(function () {
      body.innerHTML = '<p class="muted">Content did not load. Check the internet connection and reload.</p>';
    });

    var saveButton = document.querySelector('[data-item-save]');
    if (saveButton) {
      saveButton.addEventListener('click', function () {
        var nowSaved = toggleSaved(item.i);
        saveButton.classList.toggle('is-on', nowSaved);
        saveButton.innerHTML = UI.icon(nowSaved ? 'bookmark-filled' : 'bookmark');
        UI.toast(nowSaved ? 'Saved to your shelf' : 'Removed from shelf', { icon: 'bookmark', tone: 'ok' });
      });
    }

    var tocButton = document.querySelector('[data-item-toc]');
    if (tocButton) {
      tocButton.addEventListener('click', function () {
        var list = MD.toc(markdown);
        if (!list.length) {
          UI.toast('This document has no headings', { tone: 'warn' });
          return;
        }
        var host = UI.sheet('On this page', '<div class="toc-list">' + list.map(function (heading, index) {
          return '<button class="toc-row level-' + heading.level + '" data-toc="' + index + '">' + UI.esc(heading.text) + '</button>';
        }).join('') + '</div>');
        if (host) {
          host.addEventListener('click', function (event) {
            var row = event.target.closest('[data-toc]');
            if (!row) return;
            var target = document.querySelectorAll('#itemBody h1, #itemBody h2, #itemBody h3')[Number(row.getAttribute('data-toc'))];
            UI.closeSheet();
            if (target) {
              setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 180);
            }
          });
        }
      });
    }

    var copyButton = document.querySelector('[data-item-copy]');
    if (copyButton) {
      copyButton.addEventListener('click', function () {
        if (!markdown) {
          UI.toast('Loading content…');
          return;
        }
        UI.copyText(markdown).then(function () {
          UI.toast('Markdown copied', { icon: 'check', tone: 'ok' });
        });
      });
    }

    var shareButton = document.querySelector('[data-item-share]');
    if (shareButton) {
      shareButton.addEventListener('click', function () {
        UI.share({
          title: item.t,
          text: (item.d || item.t) + '\n\nJarvis Pocket · ' + (Pack.packOf(item) ? Pack.packOf(item).name : ''),
          url: location.origin + location.pathname + '#/item/' + encodeURIComponent(item.i)
        });
      });
    }

    var speakButton = document.querySelector('[data-item-speak]');
    if (speakButton) {
      speakButton.addEventListener('click', function () {
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.JarvisVoice.stopSpeaking();
          UI.toast('Stopped');
          return;
        }
        window.JarvisVoice.speak(markdown || item.d || item.t, { voiceURI: UI.storeGet('voice.uri', '') });
      });
    }

    var askButton = document.querySelector('[data-item-ask]');
    if (askButton) {
      askButton.addEventListener('click', function () {
        window.JarvisChat.askAbout(item.i);
      });
    }
  }

  /* ---------------------------------------------------------------- saved */

  function savedScreen() {
    var ids = savedIds();
    return '' +
      '<section class="screen">' +
        '<div class="screen-head"><h1>Your shelf</h1><p>' + ids.length + ' saved ' + UI.plural(ids.length, 'item') + ' · stored on this device</p></div>' +
        (ids.length
          ? '<div class="list">' + ids.map(function (id) {
            var item = Pack.getItem(id);
            return item ? itemRow(item, '') : '';
          }).filter(Boolean).join('') + '</div>'
          : '<div class="empty-block">' + UI.icon('bookmark') + '<h3>Nothing saved yet</h3><p>Tap the bookmark icon in a reader — it will show up here.</p><a class="btn btn-ghost" href="#/library">Browse library</a></div>') +
      '</section>';
  }

  function collectionScreen(collectionId) {
    var collection = Pack.collections().filter(function (row) { return row.id === collectionId; })[0];
    if (!collection) return notFound('Path not found');
    var items = collection.items.map(function (id) { return Pack.getItem(id); }).filter(Boolean);
    return '' +
      '<section class="screen">' +
        '<a class="back-link" href="#/library">' + UI.icon('arrow-left') + 'Library</a>' +
        '<div class="screen-head"><h1>' + UI.esc(collection.title) + '</h1><p>' + UI.esc(collection.blurb) + '</p></div>' +
        '<div class="list">' + items.map(function (item) { return itemRow(item, ''); }).join('') + '</div>' +
        '<button class="btn btn-primary btn-block" data-collection-ask="' + collection.id + '">' + UI.icon('spark') + 'Ask Jarvis for a study plan</button>' +
      '</section>';
  }

  function mountCollection(collectionId) {
    var button = document.querySelector('[data-collection-ask]');
    if (!button) return;
    button.addEventListener('click', function () {
      var collection = Pack.collections().filter(function (row) { return row.id === collectionId; })[0];
      if (!collection) return;
      window.JarvisChat.askAboutText('Give me a 5-step learning plan for "' + collection.title + '" using only these library items: ' +
        collection.items.slice(0, 8).map(function (id) {
          var item = Pack.getItem(id);
          return item ? item.t + ' (' + id + ')' : '';
        }).filter(Boolean).join(', '));
    });
  }

  window.JarvisLibrary = {
    libraryScreen: libraryScreen,
    mountLibrary: mountLibrary,
    searchScreen: searchScreen,
    mountSearch: mountSearch,
    packScreen: packScreen,
    mountPack: mountPack,
    itemScreen: itemScreen,
    mountItem: mountItem,
    savedScreen: savedScreen,
    collectionScreen: collectionScreen,
    mountCollection: mountCollection,
    toggleSaved: toggleSaved,
    isSaved: isSaved,
    resetFilters: function () {
      listState.pack = '';
      listState.type = '';
      listState.query = '';
      listState.limit = 24;
    }
  };
})();
