/* ECC Pocket — app shell, router and screens. */
(function () {
  'use strict';

  var UI = window.ECCUI;
  var Data = window.ECCData;
  var Markdown = window.ECCMarkdown;

  var TYPES = {
    skill: { label: 'Skills', one: 'Skill', icon: 'layers', blurb: 'Reusable capabilities your agent loads on demand — from accessibility audits to K8s patterns.' },
    agent: { label: 'Agents', one: 'Agent', icon: 'bot', blurb: 'Specialist subagents with a focused job, model and toolset.' },
    command: { label: 'Commands', one: 'Command', icon: 'terminal', blurb: 'Slash commands that run a repeatable workflow end to end.' },
    rule: { label: 'Rules', one: 'Rule', icon: 'code', blurb: 'Coding conventions per language plus shared engineering practice.' },
    doc: { label: 'Guides', one: 'Guide', icon: 'book', blurb: 'Install notes, harness guides, policies and deep-dive essays.' }
  };
  var TYPE_ORDER = ['skill', 'agent', 'command', 'rule', 'doc'];
  var TYPE_BADGE = { skill: 'Skill', agent: 'Agent', command: 'Command', rule: 'Rule', doc: 'Guide' };
  var THEME_COLORS = { dark: '#0b0d10', light: '#faf7f3' };
  var TEXT_SIZES = [
    { id: 's', label: 'S', title: 'Small' },
    { id: 'm', label: 'M', title: 'Default' },
    { id: 'l', label: 'L', title: 'Large' },
    { id: 'xl', label: 'XL', title: 'Extra large' }
  ];

  var state = {
    route: null,
    renderToken: 0,
    deferredPrompt: null,
    swReg: null,
    scrollHandler: null,
    manifestError: null
  };

  var boot = document.getElementById('boot');
  var bootSub = document.getElementById('bootSub');
  var shell = document.getElementById('shell');

  /* Utilities ---------------------------------------------------------- */
  function prettify(value) {
    return String(value || '')
      .replace(/[-_/]+/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function typeInfo(type) {
    return TYPES[type] || { label: prettify(type), one: prettify(type), icon: 'file', blurb: '' };
  }

  function itemTitle(entry) {
    return entry.ti || entry.n || entry.id;
  }

  function typeBadge(entry) {
    return TYPE_BADGE[entry.t] || entry.t;
  }

  function rowMeta(entry) {
    var bits = [];
    if (entry.t === 'rule') {
      bits.push(entry.p);
    } else if (entry.t === 'command') {
      bits.push('/' + entry.n);
      bits.push(Data.categoryLabel(entry.c));
    } else {
      bits.push(Data.categoryLabel(entry.c));
    }
    bits.push(UI.plural(entry.r || 1, 'min') + ' read');
    if (entry.f) bits.push(entry.f + ' ref' + (entry.f === 1 ? '' : 's'));
    return bits.filter(Boolean).join(' · ');
  }

  function rowsHtml(items, options) {
    var opts = options || {};
    var query = opts.query || '';
    return items.map(function (entry) {
      var meta = rowMeta(entry);
      return '<a class="row" href="' + UI.idPath(entry.t, entry.id) + '">' +
        '<span class="row-icon">' + UI.icon(typeInfo(entry.t).icon) + '</span>' +
        '<span class="row-body">' +
          '<span class="row-title">' + UI.highlight(itemTitle(entry), query) + '</span>' +
          '<span class="row-meta">' + UI.esc(meta) + '</span>' +
        '</span>' +
        '<span class="row-end">' + UI.icon('chevron-right') + '</span>' +
      '</a>';
    }).join('');
  }

  function emptyState(icon, title, body, actionHtml) {
    return '<div class="empty">' +
      '<span class="empty-icon">' + UI.icon(icon) + '</span>' +
      '<h2>' + UI.esc(title) + '</h2>' +
      '<p>' + UI.esc(body) + '</p>' +
      (actionHtml || '') +
    '</div>';
  }

  function errorState(title, body) {
    return '<div class="empty empty-error">' +
      '<span class="empty-icon">' + UI.icon('alert') + '</span>' +
      '<h2>' + UI.esc(title) + '</h2>' +
      '<p>' + UI.esc(body) + '</p>' +
      '<button class="btn btn-primary" type="button" data-action="retry">' + UI.icon('refresh') + 'Try again</button>' +
    '</div>';
  }

  /* Storage-backed lists ---------------------------------------------- */
  function bookmarkIds() {
    var ids = UI.storeGet('bookmarks', []);
    return Array.isArray(ids) ? ids : [];
  }

  function isBookmarked(id) {
    return bookmarkIds().indexOf(id) > -1;
  }

  function toggleBookmark(id) {
    var ids = bookmarkIds();
    var index = ids.indexOf(id);
    var added = index < 0;
    if (added) ids.unshift(id);
    else ids.splice(index, 1);
    UI.storeSet('bookmarks', ids.slice(0, 200));
    toastBookmark(added);
    return added;
  }

  function toastBookmark(added) {
    UI.toast(added ? 'Saved to bookmarks' : 'Removed from bookmarks', { icon: added ? 'bookmark' : 'check' });
  }

  function recents() {
    var list = UI.storeGet('recent', []);
    if (!Array.isArray(list)) return [];
    return list.filter(function (row) { return row && row.id && Data.itemById(row.id); });
  }

  function addRecent(entry) {
    var list = recents().filter(function (row) { return row.id !== entry.i; });
    list.unshift({ id: entry.i, at: Date.now() });
    UI.storeSet('recent', list.slice(0, 24));
  }

  function recentSearches() {
    var list = UI.storeGet('searches', []);
    return Array.isArray(list) ? list : [];
  }

  function addRecentSearch(query) {
    var q = String(query || '').trim();
    if (!q) return;
    var list = recentSearches().filter(function (value) { return value.toLowerCase() !== q.toLowerCase(); });
    list.unshift(q);
    UI.storeSet('searches', list.slice(0, 8));
  }

  /* Theme & type ------------------------------------------------------- */
  function currentThemePref() {
    return UI.storeGet('theme', 'system');
  }

  function effectiveTheme() {
    var pref = currentThemePref();
    if (pref === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return pref === 'light' ? 'light' : 'dark';
  }

  function applyTheme(pref) {
    var value = pref || currentThemePref();
    UI.storeSet('theme', value);
    var effective = value === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : (value === 'light' ? 'light' : 'dark');
    document.documentElement.dataset.theme = effective;
    var meta = document.getElementById('themeColor');
    if (meta) meta.setAttribute('content', THEME_COLORS[effective]);
    var statusBar = document.getElementById('appleStatusBar');
    if (statusBar) statusBar.setAttribute('content', effective === 'light' ? 'default' : 'black-translucent');
    document.documentElement.style.colorScheme = effective;
    document.querySelectorAll('[data-theme-choice]').forEach(function (btn) {
      var active = btn.getAttribute('data-theme-choice') === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function toggleTheme() {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  function applyTextSize(size) {
    var value = TEXT_SIZES.some(function (row) { return row.id === size; }) ? size : 'm';
    UI.storeSet('textSize', value);
    document.documentElement.dataset.textSize = value;
    document.querySelectorAll('[data-size-choice]').forEach(function (btn) {
      var active = btn.getAttribute('data-size-choice') === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* Router ------------------------------------------------------------- */
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    var qIndex = raw.indexOf('?');
    var path = qIndex < 0 ? raw : raw.slice(0, qIndex);
    var qs = qIndex < 0 ? '' : raw.slice(qIndex + 1);
    path = path.replace(/^\//, '');
    var parts = [];
    try {
      parts = path.split('/').filter(Boolean).map(function (part) { return decodeURIComponent(part); });
    } catch (err) {
      parts = path.split('/').filter(Boolean);
    }
    var params = new URLSearchParams(qs);
    if (!parts.length) return { name: 'home', parts: [], params: params };
    var name = parts[0];
    if (name === 'browse' && parts[1]) return { name: 'browse', type: parts[1], parts: parts, params: params };
    if (name === 'item' && parts[1] && parts[2]) {
      return { name: 'item', type: parts[1], id: parts.slice(2).join('/'), parts: parts, params: params };
    }
    if (name === 'collection' && parts[1]) return { name: 'collection', id: parts[1], parts: parts, params: params };
    if (['search', 'bookmarks', 'install', 'settings', 'about', 'more'].indexOf(name) > -1) {
      return { name: name, parts: parts, params: params };
    }
    return { name: 'notfound', parts: parts, params: params };
  }

  function goBack() {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  }

  function topMeta(route) {
    if (route.name === 'home') return { eyebrow: 'ECC Pocket', title: 'Home', nav: 'home', tab: 'home', docTitle: 'Home' };
    if (route.name === 'browse') {
      var info = typeInfo(route.type);
      return {
        eyebrow: 'Library', title: info.label, nav: route.type,
        tab: ['skill', 'agent', 'command'].indexOf(route.type) > -1 ? route.type : 'more',
        docTitle: info.label
      };
    }
    if (route.name === 'item') {
      var entry = Data.item(route.type, route.id);
      var info2 = typeInfo(route.type);
      return {
        eyebrow: info2.one, title: entry ? itemTitle(entry) : prettify(route.id), nav: route.type,
        tab: ['skill', 'agent', 'command'].indexOf(route.type) > -1 ? route.type : 'more',
        docTitle: entry ? itemTitle(entry) : info2.one
      };
    }
    if (route.name === 'collection') {
      var collection = Data.collection(route.id);
      return { eyebrow: 'Collection', title: collection ? collection.title : 'Collection', nav: 'home', tab: 'home', docTitle: collection ? collection.title : 'Collection' };
    }
    if (route.name === 'search') return { eyebrow: 'Find anything', title: 'Search', nav: 'search', tab: 'more', docTitle: 'Search' };
    if (route.name === 'bookmarks') return { eyebrow: 'Saved on this device', title: 'Bookmarks', nav: 'bookmarks', tab: 'more', docTitle: 'Bookmarks' };
    if (route.name === 'install') return { eyebrow: 'Get started', title: 'Install ECC', nav: 'install', tab: 'more', docTitle: 'Install ECC' };
    if (route.name === 'settings') return { eyebrow: 'Preferences', title: 'Settings', nav: 'settings', tab: 'more', docTitle: 'Settings' };
    if (route.name === 'about') return { eyebrow: 'Colophon', title: 'About', nav: 'about', tab: 'more', docTitle: 'About' };
    if (route.name === 'more') return { eyebrow: 'Explore', title: 'More', nav: 'more', tab: 'more', docTitle: 'More' };
    return { eyebrow: 'Lost', title: 'Not found', nav: '', tab: 'more', docTitle: 'Not found' };
  }

  function setTopbar(meta) {
    document.getElementById('topEyebrow').textContent = meta.eyebrow || '';
    document.getElementById('topTitle').textContent = meta.title || '';
    document.getElementById('topTitle').title = meta.title || '';
    document.getElementById('backBtn').hidden = state.route && state.route.name === 'home';
    document.title = (meta.docTitle || meta.title || 'ECC Pocket') + ' · ECC Pocket';
  }

  function setActiveNav(nav, tab) {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      var active = link.getAttribute('data-nav') === nav;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-tab]').forEach(function (link) {
      var active = link.getAttribute('data-tab') === tab;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function cleanupReader() {
    if (state.scrollHandler) {
      window.removeEventListener('scroll', state.scrollHandler);
      window.removeEventListener('resize', state.scrollHandler);
      state.scrollHandler = null;
    }
  }

  function route() {
    var parsed = parseHash();
    state.route = parsed;
    var token = ++state.renderToken;
    var meta = topMeta(parsed);
    setTopbar(meta);
    setActiveNav(meta.nav, meta.tab);
    cleanupReader();
    UI.closeSheet();
    window.scrollTo({ top: 0, behavior: 'auto' });
    var view = document.getElementById('view');

    if (parsed.name === 'home') return renderHome(token);
    if (parsed.name === 'browse') {
      if (!TYPES[parsed.type]) return notFound(token);
      return renderBrowse(parsed, token);
    }
    if (parsed.name === 'item') {
      if (!TYPES[parsed.type]) return notFound(token);
      return renderReader(parsed, token);
    }
    if (parsed.name === 'collection') return renderCollection(parsed, token);
    if (parsed.name === 'search') return renderSearch(parsed, token);
    if (parsed.name === 'bookmarks') return renderBookmarks(token);
    if (parsed.name === 'install') return renderInstall(token);
    if (parsed.name === 'settings') return renderSettings(token);
    if (parsed.name === 'about') return renderAbout(token);
    if (parsed.name === 'more') return renderMore(token);
    view.innerHTML = '';
    return notFound(token);
  }

  /* Home --------------------------------------------------------------- */
  function renderHome(token) {
    var counts = Data.counts();
    var manifest = Data.manifest;
    var recentsList = recents().slice(0, 4);
    var skills = Data.all('skill');
    var dayIndex = Math.floor(Date.now() / 864e5) % Math.max(1, skills.length);
    var pick = skills[dayIndex];
    var collections = Data.collections();

    var recentHtml = '';
    if (recentsList.length) {
      recentHtml = '<section class="section">' +
        '<div class="section-head"><h2>Continue reading</h2><a class="link" href="#/bookmarks">Bookmarks</a></div>' +
        '<div class="hscroll">' + recentsList.map(function (row) {
          var entry = Data.itemById(row.id);
          if (!entry) return '';
          return '<a class="mini-card" href="' + UI.idPath(entry.t, entry.id) + '">' +
            '<span class="mini-top"><span class="badge badge-tiny">' + UI.esc(typeBadge(entry)) + '</span><span class="mini-time">' + UI.esc(UI.relativeTime(row.at)) + '</span></span>' +
            '<span class="mini-title">' + UI.esc(itemTitle(entry)) + '</span>' +
            '<span class="mini-meta">' + UI.esc(Data.categoryLabel(entry.c)) + '</span>' +
          '</a>';
        }).join('') + '</div></section>';
    }

    var pickHtml = pick ? '<section class="section">' +
      '<div class="section-head"><h2>Skill of the day</h2><span class="section-note">' + UI.esc(new Date().toLocaleDateString(undefined, { weekday: 'long' })) + '</span></div>' +
      '<a class="pick-card" href="' + UI.idPath(pick.t, pick.id) + '">' +
        '<span class="pick-glow" aria-hidden="true"></span>' +
        '<span class="badge">Skill</span>' +
        '<h3>' + UI.esc(itemTitle(pick)) + '</h3>' +
        '<p>' + UI.esc(pick.d || pick.s) + '</p>' +
        '<span class="pick-cta">Read the skill ' + UI.icon('arrow-right') + '</span>' +
      '</a></section>' : '';

    var statCards = TYPE_ORDER.map(function (type) {
      var info = typeInfo(type);
      return '<a class="stat" href="#/browse/' + type + '">' +
        '<span class="stat-icon">' + UI.icon(info.icon) + '</span>' +
        '<span class="stat-num">' + (counts[type] || 0) + '</span>' +
        '<span class="stat-label">' + UI.esc(info.label) + '</span>' +
      '</a>';
    }).join('');

    var collectionHtml = collections.map(function (collection) {
      return '<a class="collection-card" href="#/collection/' + encodeURIComponent(collection.id) + '">' +
        '<span class="collection-icon">' + UI.icon(collection.icon || 'spark') + '</span>' +
        '<span class="collection-title">' + UI.esc(collection.title) + '</span>' +
        '<span class="collection-desc">' + UI.esc(collection.desc) + '</span>' +
        '<span class="collection-count">' + collection.count + ' picks ' + UI.icon('arrow-right') + '</span>' +
      '</a>';
    }).join('');

    var typeGrid = TYPE_ORDER.map(function (type) {
      var info = typeInfo(type);
      var count = counts[type] || 0;
      return '<a class="type-card" href="#/browse/' + type + '">' +
        '<span class="type-icon">' + UI.icon(info.icon) + '</span>' +
        '<span class="type-body"><span class="type-title">' + UI.esc(info.label) + '</span><span class="type-sub">' + count + ' in the pack</span></span>' +
        UI.icon('chevron-right', 'type-arrow') +
      '</a>';
    }).join('');

    var version = manifest && manifest.source ? manifest.source.version : '';
    var commit = manifest && manifest.source ? manifest.source.commitShort : '';

    document.getElementById('view').innerHTML =
      '<section class="hero">' +
        '<div class="hero-aura" aria-hidden="true"></div>' +
        '<div class="hero-inner">' +
          '<span class="hero-badge"><span class="pulse" aria-hidden="true"></span>Built from affaan-m/ECC' + (version ? ' · v' + UI.esc(version) : '') + '</span>' +
          '<h1 class="hero-title">Your agent harness,<br><span class="grad">in your pocket.</span></h1>' +
          '<p class="hero-lede">Every ECC skill, agent, command and rule — searchable, shareable and readable on any phone. Works offline once loaded.</p>' +
          '<a class="hero-search" href="#/search">' +
            UI.icon('search') +
            '<span>Search ' + Data.total() + ' items…</span>' +
            '<kbd>/</kbd>' +
          '</a>' +
          '<div class="hero-actions">' +
            '<a class="btn btn-primary" href="#/browse/skill">Browse skills ' + UI.icon('arrow-right') + '</a>' +
            '<a class="btn" href="#/install">' + UI.icon('download') + 'Install ECC</a>' +
          '</div>' +
        '</div>' +
        '<div class="hero-mark" aria-hidden="true">' +
          '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="rgba(255,255,255,.03)"/><path d="M21 20l12 12-12 12" fill="none" stroke="#e07856" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 44h11" fill="none" stroke="#f5b893" stroke-width="5.5" stroke-linecap="round"/></svg>' +
          '<span class="orbit orbit-1"></span><span class="orbit orbit-2"></span>' +
        '</div>' +
      '</section>' +
      '<div class="stat-grid">' + statCards + '</div>' +
      recentHtml +
      pickHtml +
      '<section class="section">' +
        '<div class="section-head"><h2>Curated paths</h2><span class="section-note">Hand-picked starting points</span></div>' +
        '<div class="collection-grid">' + collectionHtml + '</div>' +
      '</section>' +
      '<section class="section">' +
        '<div class="section-head"><h2>Browse everything</h2><span class="section-note">' + Data.total() + ' items</span></div>' +
        '<div class="type-grid">' + typeGrid + '</div>' +
      '</section>' +
      '<section class="install-banner">' +
        '<div class="install-banner-text">' +
          '<span class="eyebrow">Ready when you are</span>' +
          '<h2>Run ECC where you build.</h2>' +
          '<p>One guided setup installs the plugin, skills and hooks for Claude Code.</p>' +
        '</div>' +
        '<div class="install-banner-actions">' +
          '<div class="cmd cmd-inline"><code>npx ecc-universal@' + UI.esc(version || '2.2.3') + ' setup</code><button class="copy-btn" type="button" data-copy="npx ecc-universal@' + UI.esc(version || '2.2.3') + ' setup" aria-label="Copy install command">' + UI.icon('copy') + '</button></div>' +
          '<a class="btn btn-sm" href="#/install">Full install guide ' + UI.icon('arrow-right') + '</a>' +
        '</div>' +
      '</section>' +
      '<footer class="home-foot">' +
        '<p>Generated ' + UI.esc(Data.generatedDate()) + ' from <a href="https://github.com/affaan-m/ECC" target="_blank" rel="noopener">affaan-m/ECC</a>' + (commit ? ' @ ' + UI.esc(commit) : '') + '.</p>' +
        '<p>ECC is MIT licensed. This reader is an unofficial companion — commands run on your machine, not here.</p>' +
      '</footer>';

    // refresh topbar title when data arrives (e.g. after a retry)
    if (token !== state.renderToken) return;
  }

  /* Browse ------------------------------------------------------------- */
  function renderBrowse(route, token) {
    var type = route.type;
    var info = typeInfo(type);
    var items = Data.all(type).slice();
    var categories = Data.categoriesFor(type);
    var initialCategory = route.params.get('c') || '';
    var initialQuery = route.params.get('q') || '';
    var initialSort = route.params.get('sort') || 'az';

    var chips = '<button class="chip is-active" type="button" data-cat="">All <span class="chip-count">' + items.length + '</span></button>' +
      categories.map(function (cat) {
        return '<button class="chip" type="button" data-cat="' + UI.esc(cat.id) + '">' + UI.esc(cat.label) + ' <span class="chip-count">' + cat.count + '</span></button>';
      }).join('');

    document.getElementById('view').innerHTML =
      '<section class="browse">' +
        '<p class="lede">' + UI.esc(info.blurb) + '</p>' +
        '<div class="search-field">' + UI.icon('search') +
          '<input type="search" id="browseSearch" placeholder="Filter ' + UI.esc(info.label.toLowerCase()) + '…" value="' + UI.esc(initialQuery) + '" autocomplete="off" spellcheck="false" aria-label="Filter ' + UI.esc(info.label) + '">' +
          '<button class="clear-btn" type="button" data-action="clear-search" aria-label="Clear filter" hidden>' + UI.icon('x') + '</button>' +
        '</div>' +
        '<div class="chips-scroll" id="browseChips">' + chips + '</div>' +
        '<div class="list-meta">' +
          '<span id="browseCount">' + items.length + ' items</span>' +
          '<label class="sort-wrap">Sort' +
            '<select id="browseSort" aria-label="Sort items">' +
              '<option value="az"' + (initialSort === 'az' ? ' selected' : '') + '>A–Z</option>' +
              '<option value="za"' + (initialSort === 'za' ? ' selected' : '') + '>Z–A</option>' +
              '<option value="long"' + (initialSort === 'long' ? ' selected' : '') + '>Longest read</option>' +
              '<option value="refs"' + (initialSort === 'refs' ? ' selected' : '') + '>Most references</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div class="rows" id="browseRows"></div>' +
      '</section>';

    if (token !== state.renderToken) return;

    var input = document.getElementById('browseSearch');
    var clearBtn = document.querySelector('[data-action="clear-search"]');
    var sortSelect = document.getElementById('browseSort');
    var chipsWrap = document.getElementById('browseChips');
    var rowsWrap = document.getElementById('browseRows');
    var countNode = document.getElementById('browseCount');
    var activeCat = initialCategory;
    var query = initialQuery;
    var sort = initialSort;

    function syncClear() {
      if (clearBtn) clearBtn.hidden = !input.value;
    }

    function syncUrl() {
      var params = [];
      if (activeCat) params.push('c=' + encodeURIComponent(activeCat));
      if (query.trim()) params.push('q=' + encodeURIComponent(query.trim()));
      if (sort !== 'az') params.push('sort=' + encodeURIComponent(sort));
      var hash = '#/browse/' + type + (params.length ? '?' + params.join('&') : '');
      try { history.replaceState(null, '', hash); } catch (err) { /* ignore */ }
    }

    function draw() {
      var filtered = items.filter(function (entry) {
        if (activeCat) {
          var key = type === 'rule' ? entry.g : entry.c;
          if (key !== activeCat) return false;
        }
        if (query.trim()) {
          var hay = (entry.ti + ' ' + entry.n + ' ' + entry.d + ' ' + entry.p).toLowerCase();
          var tokens = query.toLowerCase().trim().split(/\s+/);
          for (var i = 0; i < tokens.length; i += 1) {
            if (hay.indexOf(tokens[i]) < 0) return false;
          }
        }
        return true;
      });
      filtered.sort(function (a, b) {
        if (sort === 'za') return b.ti.localeCompare(a.ti);
        if (sort === 'long') return (b.r || 0) - (a.r || 0) || a.ti.localeCompare(b.ti);
        if (sort === 'refs') return (b.f || 0) - (a.f || 0) || a.ti.localeCompare(b.ti);
        return a.ti.localeCompare(b.ti);
      });
      countNode.textContent = filtered.length + (filtered.length === 1 ? ' item' : ' items');
      if (!filtered.length) {
        rowsWrap.innerHTML = emptyState('search', 'Nothing matches', 'Try a different word or clear the filters.',
          '<button class="btn" type="button" data-action="reset-filters">' + UI.icon('refresh') + 'Reset filters</button>');
      } else {
        rowsWrap.innerHTML = rowsHtml(filtered, { query: query });
      }
      syncClear();
      syncUrl();
    }

    chipsWrap.querySelectorAll('.chip').forEach(function (btn) {
      btn.classList.toggle('is-active', (btn.getAttribute('data-cat') || '') === activeCat);
    });

    chipsWrap.addEventListener('click', function (event) {
      var chip = event.target.closest('.chip');
      if (!chip) return;
      activeCat = chip.getAttribute('data-cat') || '';
      chipsWrap.querySelectorAll('.chip').forEach(function (btn) { btn.classList.toggle('is-active', btn === chip); });
      draw();
      var active = chipsWrap.querySelector('.chip.is-active');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });

    input.addEventListener('input', UI.debounce(function () {
      query = input.value;
      draw();
    }, 110));

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        input.value = '';
        query = '';
        draw();
        input.blur();
      }
    });

    sortSelect.addEventListener('change', function () {
      sort = sortSelect.value;
      draw();
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      input.value = '';
      query = '';
      draw();
      input.focus();
    });

    draw();
    if (initialQuery) {
      input.focus({ preventScroll: true });
      var end = input.value.length;
      input.setSelectionRange(end, end);
    }
    if (token !== state.renderToken) return;
  }

  /* Reader ------------------------------------------------------------- */
  var currentToc = [];

  function renderReader(route, token) {
    var entry = Data.item(route.type, route.id);
    if (!entry) return notFound(token);
    var info = typeInfo(entry.t);
    var view = document.getElementById('view');
    document.getElementById('topTitle').textContent = itemTitle(entry);
    document.getElementById('topTitle').title = itemTitle(entry);
    document.title = itemTitle(entry) + ' · ECC Pocket';

    view.innerHTML =
      '<article class="reader">' +
        '<div class="read-loading"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-block"></div></div>' +
      '</article>';

    Data.contentFor(entry).then(function (content) {
      if (token !== state.renderToken) return;
      var files = Array.isArray(content.f) ? content.f : [];
      var requestedFile = route.params.get('f') || '';
      var activeFile = null;
      if (requestedFile) {
        for (var i = 0; i < files.length; i += 1) {
          if (files[i][0] === requestedFile) { activeFile = files[i]; break; }
        }
      }
      var markdown = activeFile ? activeFile[2] : content.m;
      var rendered = Markdown.render(markdown, entry);
      var minutes = UI.readMinutes(markdown);
      var bytes = new Blob([markdown]).size;

      var fileTabs = '';
      if (files.length) {
        var tabs = [['', 'Guide']].concat(files.map(function (file) { return [file[0], file[1] || file[0]]; }));
        fileTabs = '<div class="file-tabs" role="tablist" aria-label="Reference files">' +
          tabs.map(function (tab) {
            var active = activeFile ? tab[0] === activeFile[0] : !tab[0];
            var href = UI.idPath(entry.t, entry.id) + (tab[0] ? '?f=' + encodeURIComponent(tab[0]) : '');
            return '<a role="tab" aria-selected="' + (active ? 'true' : 'false') + '" class="file-tab' + (active ? ' is-active' : '') + '" href="' + href + '">' +
              UI.esc(tab[1]) + '</a>';
          }).join('') +
        '</div>';
      }

      var sourcePath = activeFile
        ? (entry.p.slice(0, entry.p.lastIndexOf('/') + 1) + activeFile[0])
        : entry.p;
      var bookmarked = isBookmarked(entry.i);
      var metaBits = [
        '<span>' + UI.icon('clock') + minutes + ' min read</span>',
        '<span>' + UI.icon('file') + UI.formatBytes(bytes) + '</span>'
      ];
      if (files.length) metaBits.push('<span>' + UI.icon('book-open') + files.length + ' reference' + (files.length === 1 ? '' : 's') + '</span>');
      metaBits.push('<span>' + UI.icon('git') + UI.esc(Data.manifest.source.commitShort || 'main') + '</span>');

      document.getElementById('view').innerHTML =
        '<article class="reader" id="reader">' +
          '<div class="read-progress" aria-hidden="true"><span id="readBar"></span></div>' +
          '<header class="read-head">' +
            '<div class="read-badges">' +
              '<a class="badge badge-type" href="#/browse/' + entry.t + '">' + UI.icon(info.icon) + UI.esc(info.one) + '</a>' +
              '<span class="badge">' + UI.esc(Data.categoryLabel(entry.c)) + '</span>' +
              (entry.g && entry.t === 'rule' ? '<span class="badge ghost">' + UI.esc(entry.g) + '</span>' : '') +
            '</div>' +
            '<h1 class="read-title">' + UI.esc(activeFile ? (activeFile[1] || activeFile[0]) : itemTitle(entry)) + '</h1>' +
            (activeFile ? '<p class="read-desc">Reference file from <code>' + UI.esc(entry.p) + '</code></p>' : '<p class="read-desc">' + UI.esc(entry.d || entry.s) + '</p>') +
            '<div class="read-meta">' + metaBits.join('') + '</div>' +
            '<div class="read-actions">' +
              '<button class="btn btn-sm' + (bookmarked ? ' is-saved' : '') + '" type="button" data-action="bookmark" data-id="' + UI.esc(entry.i) + '" aria-pressed="' + (bookmarked ? 'true' : 'false') + '">' + UI.icon('bookmark') + '<span>' + (bookmarked ? 'Saved' : 'Save') + '</span></button>' +
              '<button class="btn btn-sm" type="button" data-action="share" data-id="' + UI.esc(entry.i) + '">' + UI.icon('share') + '<span>Share</span></button>' +
              '<a class="btn btn-sm" href="' + UI.esc(Data.sourceUrl(sourcePath)) + '" target="_blank" rel="noopener">' + UI.icon('git') + '<span>View source</span></a>' +
            '</div>' +
            fileTabs +
          '</header>' +
          '<div class="prose" id="prose">' + rendered.html + '</div>' +
          '<footer class="read-foot">' +
            readPager(entry) +
            '<div class="read-foot-links">' +
              '<a class="link" href="' + UI.esc(Data.sourceUrl(sourcePath)) + '" target="_blank" rel="noopener">' + UI.icon('external') + 'Open on GitHub</a>' +
              '<button class="link" type="button" data-action="back-to-top">' + UI.icon('arrow-up') + 'Back to top</button>' +
            '</div>' +
            '<p class="read-note">Served from the ECC content pack' + (Data.manifest.source.version ? ' · v' + UI.esc(Data.manifest.source.version) : '') + '. Commands and skills run on your machine.</p>' +
          '</footer>' +
        '</article>' +
        (rendered.toc.length ? '<button class="toc-fab" type="button" data-action="toc">' + UI.icon('list') + '<span>On this page</span></button>' : '');

      // persist the toc for the sheet handler
      currentToc = rendered.toc;
      addRecent(entry);
      bindReaderScroll();
      if (route.params.get('a')) {
        var anchor = route.params.get('a');
        requestAnimationFrame(function () { scrollToAnchor(anchor); });
      }
    }).catch(function (error) {
      if (token !== state.renderToken) return;
      document.getElementById('view').innerHTML = errorState(
        'Could not load this item',
        'The content pack did not respond (' + error.message + '). Check your connection and try again — items you already opened stay available offline.'
      );
    });
  }

  function readPager(entry) {
    var list = Data.all(entry.t);
    var index = list.findIndex(function (row) { return row.i === entry.i; });
    var prev = index > 0 ? list[index - 1] : null;
    var next = index > -1 && index < list.length - 1 ? list[index + 1] : null;
    if (!prev && !next) return '';
    return '<nav class="pager" aria-label="More ' + UI.esc(typeInfo(entry.t).label.toLowerCase()) + '">' +
      (prev ? '<a class="pager-card pager-prev" href="' + UI.idPath(prev.t, prev.id) + '"><span class="pager-label">' + UI.icon('arrow-left') + 'Previous</span><span class="pager-title">' + UI.esc(itemTitle(prev)) + '</span></a>' : '<span></span>') +
      (next ? '<a class="pager-card pager-next" href="' + UI.idPath(next.t, next.id) + '"><span class="pager-label">Next' + UI.icon('arrow-right') + '</span><span class="pager-title">' + UI.esc(itemTitle(next)) + '</span></a>' : '<span></span>') +
    '</nav>';
  }

  function bindReaderScroll() {
    var bar = document.getElementById('readBar');
    var article = document.getElementById('reader');
    if (!bar || !article) return;
    var ticking = false;
    function update() {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight + 120;
      var scrolled = Math.max(0, -rect.top + 120);
      var progress = total > 0 ? Math.min(1, scrolled / total) : 1;
      bar.style.transform = 'scaleX(' + progress + ')';
    }
    state.scrollHandler = function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', state.scrollHandler, { passive: true });
    window.addEventListener('resize', state.scrollHandler);
    update();
  }

  function scrollToAnchor(anchor) {
    if (!anchor) return;
    var id = anchor;
    try { id = decodeURIComponent(anchor); } catch (err) { /* keep */ }
    var target = document.getElementById(id) || document.querySelector('[name="' + id.replace(/"/g, '\\"') + '"]');
    if (!target) return;
    if (target.hasAttribute('tabindex') && target.focus) {
      target.focus({ preventScroll: true });
    }
    var top = target.getBoundingClientRect().top + window.pageYOffset - 76;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    target.classList.add('is-flash');
    setTimeout(function () { target.classList.remove('is-flash'); }, 1400);
  }

  /* Collection --------------------------------------------------------- */
  function renderCollection(route, token) {
    var collection = Data.collection(route.id);
    if (!collection) return notFound(token);
    var entries = collection.items.map(function (id) {
      var value = String(id);
      var separator = value.indexOf(':');
      if (separator > 0) return Data.itemById(value);
      return Data.item('skill', value);
    }).filter(Boolean);
    document.getElementById('view').innerHTML =
      '<section class="browse">' +
        '<header class="collection-head">' +
          '<span class="collection-icon large">' + UI.icon(collection.icon || 'spark') + '</span>' +
          '<div><span class="eyebrow">Curated path</span><h2>' + UI.esc(collection.title) + '</h2><p>' + UI.esc(collection.desc) + '</p></div>' +
        '</header>' +
        '<div class="list-meta"><span>' + entries.length + ' hand-picked items</span><a class="link" href="#/browse/skill">All skills ' + UI.icon('arrow-right') + '</a></div>' +
        '<div class="rows">' + rowsHtml(entries) + '</div>' +
      '</section>';
  }

  /* Search ------------------------------------------------------------- */
  function renderSearch(route, token) {
    var initialQuery = route.params.get('q') || '';
    var initialType = route.params.get('t') || '';
    var typeButtons = '<button class="chip' + (!initialType ? ' is-active' : '') + '" type="button" data-search-type="">All</button>' +
      TYPE_ORDER.map(function (type) {
        return '<button class="chip' + (initialType === type ? ' is-active' : '') + '" type="button" data-search-type="' + type + '">' + UI.esc(typeInfo(type).label) + '</button>';
      }).join('');

    document.getElementById('view').innerHTML =
      '<section class="search-page">' +
        '<div class="search-big">' + UI.icon('search') +
          '<input id="searchInput" type="search" value="' + UI.esc(initialQuery) + '" placeholder="Search skills, agents, commands, rules…" autocomplete="off" spellcheck="false" aria-label="Search everything">' +
          '<button class="clear-btn" type="button" data-action="clear-search" aria-label="Clear search" hidden>' + UI.icon('x') + '</button>' +
        '</div>' +
        '<div class="chips-scroll" id="searchTypes">' + typeButtons + '</div>' +
        '<div id="searchResults" class="search-results"></div>' +
      '</section>';

    if (token !== state.renderToken) return;

    var input = document.getElementById('searchInput');
    var clearBtn = document.querySelector('[data-action="clear-search"]');
    var resultsNode = document.getElementById('searchResults');
    var chips = document.getElementById('searchTypes');
    var activeType = initialType;
    var query = initialQuery;

    function syncUrl() {
      var params = [];
      if (query.trim()) params.push('q=' + encodeURIComponent(query.trim()));
      if (activeType) params.push('t=' + encodeURIComponent(activeType));
      var hash = '#/search' + (params.length ? '?' + params.join('&') : '');
      try { history.replaceState(null, '', hash); } catch (err) { /* ignore */ }
    }

    function draw() {
      clearBtn.hidden = !input.value;
      if (!query.trim()) {
        var recent = recentSearches();
        var suggestions = ['security', 'flutter', 'tdd', 'mcp', 'seo', 'agents', 'hooks', 'postgres'];
        resultsNode.innerHTML =
          (recent.length ? '<div class="search-empty-block"><h3>Recent searches</h3><div class="chip-wrap">' +
            recent.map(function (q) { return '<button class="chip" type="button" data-suggestion="' + UI.esc(q) + '">' + UI.icon('clock') + UI.esc(q) + '</button>'; }).join('') + '</div></div>' : '') +
          '<div class="search-empty-block"><h3>Try searching for</h3><div class="chip-wrap">' +
            suggestions.map(function (q) { return '<button class="chip" type="button" data-suggestion="' + UI.esc(q) + '">' + UI.esc(q) + '</button>'; }).join('') + '</div></div>' +
          '<div class="search-empty-block"><h3>Quick links</h3><div class="quick-links">' +
            '<a class="quick-link" href="#/browse/skill">' + UI.icon('layers') + 'All skills</a>' +
            '<a class="quick-link" href="#/bookmarks">' + UI.icon('bookmark') + 'Bookmarks</a>' +
            '<a class="quick-link" href="#/install">' + UI.icon('download') + 'Install ECC</a>' +
            '<a class="quick-link" href="#/about">' + UI.icon('info') + 'About this app</a>' +
          '</div></div>';
        return;
      }
      var results = Data.search(query, { type: activeType || null, limit: 80 });
      if (!results.length) {
        resultsNode.innerHTML = emptyState('search', 'No results for “' + query + '”', 'Try fewer words, a different spelling, or browse a collection instead.',
          '<div class="empty-actions"><a class="btn" href="#/browse/skill">Browse skills</a><a class="btn" href="#/browse/doc">Browse guides</a></div>');
        return;
      }
      var grouped = {};
      results.forEach(function (entry) {
        if (!grouped[entry.t]) grouped[entry.t] = [];
        grouped[entry.t].push(entry);
      });
      var html = '<div class="search-summary">' + results.length + (results.length === 80 ? '+' : '') + ' results for “' + UI.esc(query) + '”</div>';
      TYPE_ORDER.forEach(function (type) {
        if (!grouped[type]) return;
        html += '<div class="result-group"><h3 class="result-head">' + UI.esc(typeInfo(type).label) + ' <span>' + grouped[type].length + '</span></h3>' +
          rowsHtml(grouped[type], { query: query }) + '</div>';
      });
      resultsNode.innerHTML = html;
    }

    function setType(type) {
      activeType = type;
      chips.querySelectorAll('[data-search-type]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-search-type') === type);
      });
      draw();
      syncUrl();
    }

    input.addEventListener('input', UI.debounce(function () {
      query = input.value;
      draw();
      syncUrl();
    }, 130));

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        addRecentSearch(query);
        draw();
      }
      if (event.key === 'Escape') {
        input.value = '';
        query = '';
        draw();
        syncUrl();
      }
    });

    chips.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-search-type]');
      if (!chip) return;
      setType(chip.getAttribute('data-search-type') || '');
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      input.value = '';
      query = '';
      draw();
      syncUrl();
      input.focus();
    });

    resultsNode.addEventListener('click', function (event) {
      var suggestion = event.target.closest('[data-suggestion]');
      if (suggestion) {
        input.value = suggestion.getAttribute('data-suggestion');
        query = input.value;
        addRecentSearch(query);
        draw();
        syncUrl();
        return;
      }
      var link = event.target.closest('a.row');
      if (link && query.trim()) {
        addRecentSearch(query);
      }
    });

    draw();
    syncUrl();
    if (!initialQuery) {
      // don't steal focus on deep links; only on a direct search visit
      input.focus({ preventScroll: true });
    }
  }

  /* Bookmarks ---------------------------------------------------------- */
  function renderBookmarks(token) {
    var ids = bookmarkIds();
    var entries = ids.map(function (id) { return Data.itemById(id); }).filter(Boolean);
    var listHtml = entries.length ? '<div class="rows">' + rowsHtml(entries) + '</div>' : '';
    document.getElementById('view').innerHTML =
      '<section class="browse">' +
        '<p class="lede">Saved on this device. Bookmarks never leave your phone — no account, no sync, no tracking.</p>' +
        (entries.length
          ? '<div class="list-meta"><span>' + entries.length + (entries.length === 1 ? ' bookmark' : ' bookmarks') + '</span><button class="link danger" type="button" data-action="clear-bookmarks">Clear all</button></div>' + listHtml
          : emptyState('bookmark', 'No bookmarks yet', 'Tap the save button on any skill, agent, command or guide to keep it here.',
              '<a class="btn btn-primary" href="#/browse/skill">Browse skills ' + UI.icon('arrow-right') + '</a>')) +
      '</section>';
  }

  /* Install ------------------------------------------------------------ */
  function cmdBlock(code, label) {
    return '<div class="cmd"><div class="cmd-top"><span>' + UI.esc(label) + '</span>' +
      '<button class="copy-btn" type="button" data-copy="' + UI.esc(code) + '" aria-label="Copy command">' + UI.icon('copy') + '<span>Copy</span></button></div>' +
      '<code>' + UI.esc(code) + '</code></div>';
  }

  function renderInstall(token) {
    var version = (Data.manifest.source && Data.manifest.source.version) || '2.2.3';
    var setup = 'npx ecc-universal@' + version + ' setup';
    var guided = 'npx ecc-universal@' + version + ' install --guided';
    var docLink = function (id) {
      return Data.item('doc', id) ? UI.idPath('doc', id) : '#/browse/doc';
    };

    document.getElementById('view').innerHTML =
      '<section class="install">' +
        '<header class="install-hero">' +
          '<span class="install-icon">' + UI.icon('download') + '</span>' +
          '<span class="eyebrow">Setup guide</span>' +
          '<h2>Install ECC once.<br>Use it in every harness.</h2>' +
          '<p>ECC ships a guided installer that adds its skills, agents, commands and hooks to Claude Code, Codex and Kimi Code. The reader you are holding simply documents it — nothing is installed from this page.</p>' +
          '<div class="install-cta">' +
            '<div class="cmd cmd-large"><code>' + UI.esc(setup) + '</code><button class="copy-btn" type="button" data-copy="' + UI.esc(setup) + '" aria-label="Copy setup command">' + UI.icon('copy') + '<span>Copy</span></button></div>' +
            '<span class="install-version">Pinned to ECC v' + UI.esc(version) + '</span>' +
          '</div>' +
        '</header>' +

        '<div class="notice">' + UI.icon('alert') +
          '<div><strong>Pick one path per harness.</strong> Stacking a plugin install on top of a manual install duplicates skills and hooks. If you already have both, reset before reinstalling.</div>' +
        '</div>' +

        '<section class="install-step">' +
          '<span class="step-num">1</span>' +
          '<div class="step-body">' +
            '<h3>Check the prerequisites</h3>' +
            '<p>Node.js 18 or newer, Git on <code>PATH</code>, and Claude Code 2.1+ if you want the Claude plugin.</p>' +
            '<div class="cmd-list">' +
              cmdBlock('node --version', 'Node.js') +
              cmdBlock('git --version', 'Git') +
              cmdBlock('claude --version', 'Claude Code (optional)') +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="install-step">' +
          '<span class="step-num">2</span>' +
          '<div class="step-body">' +
            '<h3>Run the guided setup</h3>' +
            '<p>The wizard inventories existing installs first, then asks for a scope and hook profile. Choose <strong>global user</strong> and <strong>standard hooks</strong> for a typical personal setup.</p>' +
            '<div class="cmd-list">' + cmdBlock(setup, 'npm / npx') + '</div>' +
            '<div class="platform-grid">' +
              cmdBlock('pnpm dlx ecc-universal@' + version + ' setup', 'pnpm') +
              cmdBlock('yarn dlx ecc-universal@' + version + ' setup', 'Yarn 2+') +
              cmdBlock('bunx ecc-universal@' + version + ' setup', 'Bun') +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="install-step">' +
          '<span class="step-num">3</span>' +
          '<div class="step-body">' +
            '<h3>Verify it landed</h3>' +
            '<p>Open a new Claude Code session and list plugins. You should see <code>ecc@ecc</code> enabled.</p>' +
            '<div class="cmd-list">' + cmdBlock('/plugin list', 'Inside Claude Code') + '</div>' +
          '</div>' +
        '</section>' +

        '<section class="install-step">' +
          '<span class="step-num">4</span>' +
          '<div class="step-body">' +
            '<h3>Working across harnesses?</h3>' +
            '<p>The multi-harness wizard preflights every target before the first write.</p>' +
            '<div class="cmd-list">' + cmdBlock(guided, 'Guided multi-harness install') + '</div>' +
            '<div class="cmd-list">' + cmdBlock('npx ecc-universal@' + version + ' install --guided --harness codex --dry-run', 'Dry run for Codex') + '</div>' +
          '</div>' +
        '</section>' +

        '<section class="callout-card">' +
          '<span class="callout-icon">' + UI.icon('phone') + '</span>' +
          '<div>' +
            '<h3>On Android with Termux</h3>' +
            '<p>This reader works in any modern phone browser. If you want to try the npm package on the phone itself, install Node and Git in Termux, then run the setup command. The Claude Code plugin expects a desktop harness — expect rough edges on Termux.</p>' +
            '<div class="cmd-list">' + cmdBlock('pkg update && pkg install nodejs git', 'Termux') + '</div>' +
          '</div>' +
        '</section>' +

        '<section class="info-grid">' +
          '<a class="info-card" href="' + docLink('repo-readme') + '">' + UI.icon('book') + '<span class="info-title">ECC README</span><span class="info-sub">The complete upstream overview</span></a>' +
          '<a class="info-card" href="' + docLink('ANTIGRAVITY-GUIDE') + '">' + UI.icon('cpu') + '<span class="info-title">Harness guides</span><span class="info-sub">Antigravity, Codex, Qwen and more</span></a>' +
          '<a class="info-card" href="' + docLink('repo-troubleshooting') + '">' + UI.icon('alert') + '<span class="info-title">Troubleshooting</span><span class="info-sub">When the install goes sideways</span></a>' +
          '<a class="info-card" href="' + docLink('MIGRATION-1X-TO-2.0') + '">' + UI.icon('refresh') + '<span class="info-title">Migration notes</span><span class="info-sub">Moving from ECC 1.x to 2.x</span></a>' +
        '</section>' +

        '<section class="safety">' +
          '<h3>' + UI.icon('shield') + 'Before you run it</h3>' +
          '<ul>' +
            '<li>Pin the version (as shown above). It is a reproducibility aid, not a security audit.</li>' +
            '<li>Review the source at <a href="https://github.com/affaan-m/ECC" target="_blank" rel="noopener">github.com/affaan-m/ECC</a> and the npm integrity data before executing package code.</li>' +
            '<li>ECC never uploads diagnostics automatically. There is no telemetry in this reader either.</li>' +
            '<li>Install only from the official repo, the <code>ecc-universal</code> npm package, or <code>ecc.tools</code>.</li>' +
          '</ul>' +
        '</section>' +
      '</section>';
  }

  /* Settings ----------------------------------------------------------- */
  function renderSettings(token) {
    var theme = currentThemePref();
    var size = UI.storeGet('textSize', 'm');
    var standalone = isStandalone();
    var manifest = Data.manifest;

    document.getElementById('view').innerHTML =
      '<section class="settings">' +
        '<div class="settings-group">' +
          '<h2>' + UI.icon('sun') + 'Appearance</h2>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Theme</strong><span>Follow the system or pick one.</span></div>' +
            '<div class="segmented" role="group" aria-label="Theme">' +
              ['system', 'dark', 'light'].map(function (value) {
                return '<button type="button" data-theme-choice="' + value + '" class="' + (theme === value ? 'is-active' : '') + '" aria-pressed="' + (theme === value ? 'true' : 'false') + '">' + value.charAt(0).toUpperCase() + value.slice(1) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Reader text size</strong><span>Applies to guides, skills and rules.</span></div>' +
            '<div class="segmented" role="group" aria-label="Text size">' +
              TEXT_SIZES.map(function (option) {
                return '<button type="button" data-size-choice="' + option.id + '" class="' + (size === option.id ? 'is-active' : '') + '" aria-pressed="' + (size === option.id ? 'true' : 'false') + '" title="' + option.title + '">' + option.label + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="settings-group">' +
          '<h2>' + UI.icon('download') + 'Offline</h2>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Saved on this device</strong><span id="storageUsage">Calculating…</span></div>' +
            '<button class="btn btn-sm" type="button" data-action="download-all">' + UI.icon('download') + '<span>Save all · ' + UI.esc(estimatePackSize()) + '</span></button>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Offline cache</strong><span>Pages and chapters you have already opened work without a connection.</span></div>' +
            '<button class="btn btn-sm" type="button" data-action="clear-cache">' + UI.icon('refresh') + '<span>Refresh</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-group">' +
          '<h2>' + UI.icon('phone') + 'App</h2>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Install to home screen</strong><span>' + (standalone ? 'Already installed — running standalone.' : 'Launch full-screen, straight from your home screen.') + '</span></div>' +
            (standalone
              ? '<span class="badge">Installed</span>'
              : '<button class="btn btn-sm btn-primary" type="button" data-action="install-app"' + (state.deferredPrompt ? '' : ' hidden') + '>Install</button>') +
          '</div>' +
          (standalone ? '' : '<p class="setting-hint">On iPhone, open this page in Safari and tap <strong>Share → Add to Home Screen</strong>. On Android Chrome, use <strong>⋮ → Install app</strong>.</p>') +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Version</strong><span>Content pack generated ' + UI.esc(Data.generatedDate()) + ' · ECC v' + UI.esc((manifest.source && manifest.source.version) || '2.2.3') + '</span></div>' +
            '<a class="link" href="#/about">About</a>' +
          '</div>' +
        '</div>' +

        '<div class="settings-group danger-group">' +
          '<h2>' + UI.icon('trash') + 'Your data</h2>' +
          '<div class="setting-row">' +
            '<div class="setting-label"><strong>Clear bookmarks & history</strong><span>Recents, searches and saved items live only in this browser.</span></div>' +
            '<button class="btn btn-sm" type="button" data-action="clear-data">Clear</button>' +
          '</div>' +
          '<p class="setting-hint">No account, no sync, no analytics. Clearing this cannot be undone.</p>' +
        '</div>' +
      '</section>';

    if (token !== state.renderToken) return;

    var usage = document.getElementById('storageUsage');
    if (usage && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (estimate) {
        if (usage) usage.textContent = 'About ' + UI.formatBytes(estimate.usage || 0) + ' used by this site.';
      }).catch(function () { if (usage) usage.textContent = 'Storage details unavailable.'; });
    } else if (usage) {
      usage.textContent = 'Saved for offline reading.';
    }
  }

  /* More --------------------------------------------------------------- */
  function renderMore(token) {
    var items = [
      { href: '#/browse/doc', icon: 'book', title: 'Guides', sub: 'Install notes, harness guides and essays' },
      { href: '#/browse/rule', icon: 'code', title: 'Rules', sub: 'Language-by-language coding conventions' },
      { href: '#/bookmarks', icon: 'bookmark', title: 'Bookmarks', sub: bookmarkIds().length + ' saved on this device' },
      { href: '#/search', icon: 'search', title: 'Search everything', sub: 'Find any skill, agent or command' }
    ];
    var appItems = [
      { href: '#/install', icon: 'download', title: 'Install ECC', sub: 'Guided setup for your harness' },
      { href: '#/settings', icon: 'sliders', title: 'Settings', sub: 'Theme, text size, offline downloads' },
      { href: '#/about', icon: 'info', title: 'About ECC Pocket', sub: 'Data source, licenses, privacy' }
    ];
    var list = function (rows) {
      return '<div class="menu-list">' + rows.map(function (row) {
        return '<a class="menu-row" href="' + row.href + '">' +
          '<span class="row-icon">' + UI.icon(row.icon) + '</span>' +
          '<span class="row-body"><span class="row-title">' + UI.esc(row.title) + '</span><span class="row-meta">' + UI.esc(row.sub) + '</span></span>' +
          '<span class="row-end">' + UI.icon('chevron-right') + '</span>' +
        '</a>';
      }).join('') + '</div>';
    };

    document.getElementById('view').innerHTML =
      '<section class="more">' +
        (state.deferredPrompt ? '<div class="install-prompt-card">' +
          '<span class="install-icon">' + UI.icon('phone') + '</span>' +
          '<div><h2>Keep ECC in your pocket</h2><p>Install the reader for full-screen access and offline reading.</p></div>' +
          '<button class="btn btn-primary btn-sm" type="button" data-action="install-app">Install</button>' +
        '</div>' : '') +
        '<h2 class="group-title">Explore</h2>' + list(items) +
        '<h2 class="group-title">App</h2>' + list(appItems) +
        '<h2 class="group-title">Source</h2>' +
        '<div class="menu-list">' +
          '<a class="menu-row" href="https://github.com/affaan-m/ECC" target="_blank" rel="noopener">' +
            '<span class="row-icon">' + UI.icon('github') + '</span>' +
            '<span class="row-body"><span class="row-title">affaan-m/ECC</span><span class="row-meta">Skills, agents, commands and rules on GitHub</span></span>' +
            '<span class="row-end">' + UI.icon('external') + '</span>' +
          '</a>' +
          '<a class="menu-row" href="https://www.npmjs.com/package/ecc-universal" target="_blank" rel="noopener">' +
            '<span class="row-icon">' + UI.icon('command') + '</span>' +
            '<span class="row-body"><span class="row-title">ecc-universal on npm</span><span class="row-meta">The official installer package</span></span>' +
            '<span class="row-end">' + UI.icon('external') + '</span>' +
          '</a>' +
        '</div>' +
        '<footer class="home-foot"><p>ECC Pocket · content pack ' + UI.esc((Data.manifest.source && Data.manifest.source.commitShort) || '') + ' · MIT</p></footer>' +
      '</section>';
  }

  /* About -------------------------------------------------------------- */
  function renderAbout(token) {
    var manifest = Data.manifest;
    var source = manifest.source || {};
    var counts = Data.counts();
    document.getElementById('view').innerHTML =
      '<section class="about">' +
        '<header class="about-head">' +
          '<span class="brand-mark large" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#11161e"/><path d="M21 20l12 12-12 12" fill="none" stroke="#e07856" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 44h11" fill="none" stroke="#f5b893" stroke-width="5.5" stroke-linecap="round"/></svg></span>' +
          '<h2>ECC Pocket</h2>' +
          '<p class="about-tag">The agent harness OS, in your pocket.</p>' +
          '<p class="about-lede">A small, offline-friendly reader for the ECC repository. Browse every skill, agent, command and rule; search across the whole pack; save favourites and share deep links — without cloning anything.</p>' +
        '</header>' +

        '<div class="about-stats">' +
          '<span><strong>' + (counts.skill || 0) + '</strong>Skills</span>' +
          '<span><strong>' + (counts.agent || 0) + '</strong>Agents</span>' +
          '<span><strong>' + (counts.command || 0) + '</strong>Commands</span>' +
          '<span><strong>' + (counts.rule || 0) + '</strong>Rules</span>' +
          '<span><strong>' + (counts.doc || 0) + '</strong>Guides</span>' +
        '</div>' +

        '<div class="card about-card">' +
          '<h3>' + UI.icon('git') + 'Data source</h3>' +
          '<dl class="kv">' +
            '<div><dt>Repository</dt><dd><a href="https://github.com/affaan-m/ECC" target="_blank" rel="noopener">affaan-m/ECC</a></dd></div>' +
            '<div><dt>Version</dt><dd>' + UI.esc(source.version || '—') + '</dd></div>' +
            '<div><dt>Commit</dt><dd><a href="https://github.com/affaan-m/ECC/commit/' + UI.esc(source.commit || '') + '" target="_blank" rel="noopener"><code>' + UI.esc(source.commitShort || '—') + '</code></a></dd></div>' +
            '<div><dt>Generated</dt><dd>' + UI.esc(Data.generatedDate()) + '</dd></div>' +
            '<div><dt>License</dt><dd>MIT</dd></div>' +
            '<div><dt>Reader</dt><dd>Static HTML, CSS and JavaScript — no backend</dd></div>' +
          '</dl>' +
        '</div>' +

        '<div class="card about-card">' +
          '<h3>' + UI.icon('lock') + 'Privacy</h3>' +
          '<p>No accounts, analytics, cookies or tracking. Bookmarks, recents and preferences are stored in this browser only. The app fetches its content pack from this site and images from GitHub’s raw host; nothing else is requested.</p>' +
        '</div>' +

        '<div class="card about-card">' +
          '<h3>' + UI.icon('file') + 'Credits & licenses</h3>' +
          '<ul class="license-list">' +
            '<li><strong>ECC</strong> — skills, agents, commands and guides by Affaan Mustafa and contributors, MIT licensed. This is an unofficial companion reader, not affiliated with or endorsed by the ECC project.</li>' +
            '<li><strong>marked</strong> — MIT license. <a href="assets/js/vendor/LICENSE-marked.md">License</a></li>' +
            '<li><strong>DOMPurify</strong> — MPL-2.0 OR Apache-2.0. <a href="assets/js/vendor/LICENSE-dompurify.txt">License</a></li>' +
            '<li><strong>Icons & app mark</strong> — drawn for this app. System fonts only, so there are no font files to download.</li>' +
          '</ul>' +
        '</div>' +

        '<div class="callout-card">' +
          '<span class="callout-icon">' + UI.icon('shield') + '</span>' +
          '<div><h3>What this app does not do</h3><p>It does not run agents or execute skills. ECC commands run inside Claude Code, Codex, Kimi or another harness on your machine. Read a skill here, then install ECC where you build.</p></div>' +
        '</div>' +

        '<div class="about-actions">' +
          '<a class="btn btn-primary" href="#/install">' + UI.icon('download') + 'Install ECC</a>' +
          '<a class="btn" href="https://github.com/affaan-m/ECC" target="_blank" rel="noopener">' + UI.icon('github') + 'Open the repo</a>' +
        '</div>' +
      '</section>';
  }

  /* Not found ---------------------------------------------------------- */
  function notFound(token) {
    var view = document.getElementById('view');
    view.innerHTML = '<section class="browse">' + emptyState('alert', 'That page does not exist',
      'The link may be old, or the item is not part of this content pack.',
      '<div class="empty-actions"><a class="btn btn-primary" href="#/">Back home</a><a class="btn" href="#/search">Search</a></div>') + '</section>';
  }

  /* Install prompt & PWA ----------------------------------------------- */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  async function promptInstall() {
    if (!state.deferredPrompt) {
      UI.toast('Use your browser menu → Add to Home screen', { icon: 'phone', duration: 3600 });
      return;
    }
    state.deferredPrompt.prompt();
    try {
      await state.deferredPrompt.userChoice;
    } catch (err) { /* ignore */ }
    state.deferredPrompt = null;
    document.querySelectorAll('[data-action="install-app"]').forEach(function (btn) { btn.hidden = true; });
    if (state.route && state.route.name === 'settings') renderSettings(state.renderToken);
    if (state.route && state.route.name === 'more') renderMore(state.renderToken);
  }

  function registerServiceWorker() {
    if (!navigator.serviceWorker || typeof navigator.serviceWorker.register !== 'function') return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' })
      .then(function (reg) { state.swReg = reg; })
      .catch(function () { /* offline support is optional */ });
  }

  /* Generated content size: used by settings copy ---------------------- */
  function estimatePackSize() {
    var bytes = Data.manifest && Data.manifest.packBytes;
    return bytes ? UI.formatBytes(bytes) : 'the whole pack';
  }

  /* Global events ------------------------------------------------------ */
  function handleCopy(button) {
    var text = button.getAttribute('data-copy');
    if (text == null) {
      var block = button.closest('.code-block');
      var code = block && block.querySelector('code');
      text = code ? code.innerText : '';
    }
    if (!text) return;
    UI.copyAndToast(text, 'Copied');
  }

  function handleClick(event) {
    var copyTarget = event.target.closest('[data-copy], .copy-btn, .code-copy');
    if (copyTarget) {
      event.preventDefault();
      handleCopy(copyTarget);
      return;
    }

    var back = event.target.closest('[data-action="back-to-top"]');
    if (back) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    var toc = event.target.closest('[data-action="toc"]');
    if (toc) {
      event.preventDefault();
      openToc();
      return;
    }

    var tocItem = event.target.closest('.toc-item');
    if (tocItem) {
      event.preventDefault();
      var anchor = tocItem.getAttribute('data-anchor');
      UI.closeSheet();
      setTimeout(function () { scrollToAnchor(anchor); }, 100);
      return;
    }

    var bookmark = event.target.closest('[data-action="bookmark"]');
    if (bookmark) {
      event.preventDefault();
      var id = bookmark.getAttribute('data-id');
      if (!id) return;
      var added = toggleBookmark(id);
      bookmark.classList.toggle('is-saved', added);
      bookmark.setAttribute('aria-pressed', added ? 'true' : 'false');
      var label = bookmark.querySelector('span');
      if (label) label.textContent = added ? 'Saved' : 'Save';
      return;
    }

    var share = event.target.closest('[data-action="share"]');
    if (share) {
      event.preventDefault();
      var shareId = share.getAttribute('data-id');
      var shareEntry = Data.itemById(shareId);
      var payload = {
        title: shareEntry ? itemTitle(shareEntry) + ' · ECC Pocket' : 'ECC Pocket',
        text: shareEntry ? (shareEntry.d || '') : 'The agent harness OS, in your pocket.',
        url: location.href
      };
      UI.share(payload);
      return;
    }

    var themeChoice = event.target.closest('[data-theme-choice]');
    if (themeChoice) {
      applyTheme(themeChoice.getAttribute('data-theme-choice'));
      return;
    }

    var sizeChoice = event.target.closest('[data-size-choice]');
    if (sizeChoice) {
      applyTextSize(sizeChoice.getAttribute('data-size-choice'));
      return;
    }

    var installBtn = event.target.closest('[data-action="install-app"]');
    if (installBtn) {
      event.preventDefault();
      promptInstall();
      return;
    }

    var retry = event.target.closest('[data-action="retry"]');
    if (retry) {
      event.preventDefault();
      route();
      return;
    }

    var resetFilters = event.target.closest('[data-action="reset-filters"]');
    if (resetFilters) {
      event.preventDefault();
      var input = document.getElementById('browseSearch');
      if (input) input.value = '';
      var allChip = document.querySelector('#browseChips .chip');
      if (allChip) allChip.click();
      var sort = document.getElementById('browseSort');
      if (sort) { sort.value = 'az'; sort.dispatchEvent(new Event('change')); }
      if (input) input.dispatchEvent(new Event('input'));
      return;
    }

    var clearBookmarks = event.target.closest('[data-action="clear-bookmarks"]');
    if (clearBookmarks) {
      event.preventDefault();
      if (window.confirm('Remove all bookmarks from this device?')) {
        UI.storeSet('bookmarks', []);
        renderBookmarks(state.renderToken);
        UI.toast('Bookmarks cleared', { icon: 'check' });
      }
      return;
    }

    var clearData = event.target.closest('[data-action="clear-data"]');
    if (clearData) {
      event.preventDefault();
      if (window.confirm('Clear bookmarks, recents and searches on this device?')) {
        UI.storeClearAll();
        applyTheme('system');
        applyTextSize('m');
        renderSettings(state.renderToken);
        UI.toast('Local data cleared', { icon: 'check' });
      }
      return;
    }

    var clearCache = event.target.closest('[data-action="clear-cache"]');
    if (clearCache) {
      event.preventDefault();
      clearOfflineCache(clearCache);
      return;
    }

    var downloadAll = event.target.closest('[data-action="download-all"]');
    if (downloadAll) {
      event.preventDefault();
      downloadEverything(downloadAll);
      return;
    }

    var anchorLink = event.target.closest('a[data-anchor]');
    if (anchorLink) {
      event.preventDefault();
      scrollToAnchor(anchorLink.getAttribute('data-anchor'));
      return;
    }

    var link = event.target.closest('a[href]');
    if (link) {
      var href = link.getAttribute('href');
      if (href && href.charAt(0) === '#' && href.charAt(1) !== '/') {
        event.preventDefault();
        scrollToAnchor(href.slice(1));
        return;
      }
    }

    if (event.target.closest('#sheetBackdrop')) {
      UI.closeSheet();
    }
  }

  function openToc() {
    if (!currentToc || !currentToc.length) {
      UI.toast('No sections in this document', { icon: 'list' });
      return;
    }
    var html = '<div class="toc-list">' + currentToc.map(function (entry) {
      return '<button type="button" class="toc-item toc-level-' + entry.level + '" data-anchor="' + UI.esc(entry.id) + '">' + UI.esc(entry.text) + '</button>';
    }).join('') + '</div>' +
      '<button class="btn btn-sm toc-top" type="button" data-action="back-to-top">' + UI.icon('arrow-up') + 'Back to top</button>';
    UI.openSheet('On this page', html);
  }

  async function clearOfflineCache(button) {
    button.disabled = true;
    try {
      if ('caches' in window) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }
      UI.toast('Offline cache cleared — reloading', { icon: 'refresh' });
      setTimeout(function () { location.reload(); }, 700);
    } catch (err) {
      UI.toast('Could not clear the cache', { icon: 'alert' });
      button.disabled = false;
    }
  }

  async function downloadEverything(button) {
    var label = button.querySelector('span');
    button.disabled = true;
    if (label) label.textContent = 'Saving…';
    try {
      var result = await Data.downloadAll(function (done, total, error) {
        if (label) label.textContent = error ? 'Retrying…' : done + '/' + total;
      });
      if (label) label.textContent = 'Saved';
      UI.toast('All ' + result.chunks + ' chapters saved for offline reading', { icon: 'check', duration: 3200 });
      var usage = document.getElementById('storageUsage');
      if (usage && navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (estimate) {
          if (usage) usage.textContent = 'About ' + UI.formatBytes(estimate.usage || 0) + ' used by this site.';
        });
      }
    } catch (err) {
      UI.toast('Download stopped — check your connection and try again', { icon: 'alert' });
      if (label) label.textContent = 'Save all · ' + estimatePackSize();
      button.disabled = false;
    }
  }

  function initKeyboard() {
    document.addEventListener('keydown', function (event) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
      if (typing) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        location.hash = '#/search';
      }
    });
  }

  function initNetworkEvents() {
    window.addEventListener('offline', function () {
      UI.toast('Offline — chapters you opened still work', { icon: 'wifi-off', duration: 3200 });
    });
    window.addEventListener('online', function () {
      UI.toast('Back online', { icon: 'check' });
    });
  }

  function showBootError(error) {
    if (!boot) return;
    boot.classList.add('has-error');
    if (bootSub) bootSub.textContent = 'The content pack could not be loaded.';
    var wrap = document.createElement('div');
    wrap.className = 'boot-error';
    wrap.innerHTML = '<p>' + UI.esc(error && error.message ? error.message : 'Unknown error') + '</p>' +
      '<p class="boot-hint">If you opened this file directly, serve the folder over HTTP instead — for example <code>npx serve</code> or <code>python3 -m http.server</code>.</p>' +
      '<button class="btn btn-primary" type="button" id="bootRetry">' + UI.icon('refresh') + 'Try again</button>';
    boot.appendChild(wrap);
    var retry = document.getElementById('bootRetry');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
  }

  function hideBoot() {
    if (boot) boot.hidden = true;
    if (shell) shell.hidden = false;
  }

  function renderOfflineNotice() {
    if (!navigator.onLine && !UI.storeGet('seen-offline-hint', false)) {
      UI.storeSet('seen-offline-hint', true);
      setTimeout(function () {
        UI.toast('You are offline — saved pages still open', { icon: 'wifi-off', duration: 3200 });
      }, 900);
    }
  }

  async function init() {
    applyTheme(currentThemePref());
    applyTextSize(UI.storeGet('textSize', 'm'));
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var listener = function () { if (currentThemePref() === 'system') applyTheme('system'); };
      if (mq.addEventListener) mq.addEventListener('change', listener);
      else if (mq.addListener) mq.addListener(listener);
    }

    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('backBtn').addEventListener('click', goBack);
    document.addEventListener('click', handleClick);
    initKeyboard();
    initNetworkEvents();

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      state.deferredPrompt = event;
      document.querySelectorAll('[data-action="install-app"]').forEach(function (btn) { btn.hidden = false; });
    });
    window.addEventListener('appinstalled', function () {
      state.deferredPrompt = null;
      UI.toast('ECC Pocket installed', { icon: 'check' });
    });

    window.addEventListener('hashchange', route);

    try {
      await Data.load();
    } catch (error) {
      state.manifestError = error;
      showBootError(error);
      return;
    }

    hideBoot();
    registerServiceWorker();
    renderOfflineNotice();
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
