/* Jarvis Pocket — small DOM/storage helpers shared by every screen. */
(function () {
  'use strict';

  var JSON_NS = 'jp.';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(JSON_NS + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      localStorage.setItem(JSON_NS + key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function storeRemove(key) {
    try {
      localStorage.removeItem(JSON_NS + key);
    } catch (error) { /* ignore */ }
  }

  function storeKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (key && key.indexOf(JSON_NS) === 0) keys.push(key.slice(JSON_NS.length));
      }
    } catch (error) { /* ignore */ }
    return keys;
  }

  function storeClearAll() {
    storeKeys().forEach(storeRemove);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(0) + ' KB';
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
    return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function readMinutes(text) {
    var words = String(text || '').split(/\s+/).length;
    return Math.max(1, Math.round(words / 210));
  }

  function plural(count, one, many) {
    return count === 1 ? one : (many || one + 's');
  }

  function relativeTime(ts) {
    var diff = Date.now() - Number(ts || 0);
    if (diff < 45000) return 'just now';
    var mins = Math.round(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.round(hours / 24);
    if (days < 7) return days + 'd ago';
    try {
      return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch (error) {
      return days + 'd ago';
    }
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(text, query) {
    var source = esc(text);
    var term = String(query || '').trim();
    if (term.length < 2) return source;
    var parts = term.split(/\s+/).filter(function (part) { return part.length > 1; }).slice(0, 4);
    if (!parts.length) return source;
    var pattern = new RegExp('(' + parts.map(escapeRegExp).join('|') + ')', 'gi');
    return source.replace(pattern, '<mark>$1</mark>');
  }

  function toast(message, opts) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var node = document.createElement('div');
    node.className = 'toast' + (opts && opts.tone ? ' toast-' + opts.tone : '');
    node.setAttribute('role', 'status');
    node.innerHTML = (opts && opts.icon ? icon(opts.icon) : '') + '<span>' + esc(message) + '</span>';
    host.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });
    setTimeout(function () {
      node.classList.remove('is-in');
      setTimeout(function () { node.remove(); }, 260);
    }, (opts && opts.ms) || 2600);
  }

  function copyText(text) {
    var value = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).catch(function () { return legacyCopy(value); });
    }
    return legacyCopy(value);
  }

  function legacyCopy(value) {
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand('copy');
        area.remove();
        ok ? resolve() : reject(new Error('copy blocked'));
      } catch (error) {
        reject(error);
      }
    });
  }

  function copyAndToast(text, label) {
    copyText(text).then(function () {
      toast((label || 'Copied') + ' copied', { icon: 'check', tone: 'ok' });
    }).catch(function () {
      toast('Copy blocked by the browser', { tone: 'warn' });
    });
  }

  function canShare() {
    return !!(navigator.share && window.isSecureContext);
  }

  function share(data) {
    if (canShare()) {
      return navigator.share(data).catch(function () { /* dismissed */ });
    }
    var text = [data.title, data.text, data.url].filter(Boolean).join('\n');
    copyAndToast(text, 'Text');
    return Promise.resolve();
  }

  function sheet(title, content) {
    var host = document.getElementById('sheet');
    if (!host) return;
    host.innerHTML =
      '<div class="sheet-backdrop" data-sheet-close></div>' +
      '<div class="sheet-panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2>' + esc(title) + '</h2>' +
      '<button class="icon-btn" data-sheet-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="sheet-body">' + content + '</div>' +
      '</div>';
    host.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(function () { host.classList.add('is-open'); });
    var focusable = host.querySelector('.sheet-panel');
    if (focusable) focusable.focus();
    return host;
  }

  function closeSheet() {
    var host = document.getElementById('sheet');
    if (!host || host.hidden) return;
    host.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(function () {
      if (!host.classList.contains('is-open')) {
        host.hidden = true;
        host.innerHTML = '';
      }
    }, 220);
  }

  function isSheetOpen() {
    var host = document.getElementById('sheet');
    return !!(host && !host.hidden);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    var host = document.getElementById('sheet');
    if (!host) return;
    var nodes = host.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function download(name, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (error) {
      return false;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  window.JarvisUI = {
    esc: esc,
    icon: icon,
    storeGet: storeGet,
    storeSet: storeSet,
    storeRemove: storeRemove,
    storeKeys: storeKeys,
    storeClearAll: storeClearAll,
    uid: uid,
    debounce: debounce,
    formatBytes: formatBytes,
    readMinutes: readMinutes,
    plural: plural,
    relativeTime: relativeTime,
    slugify: slugify,
    highlight: highlight,
    toast: toast,
    copyText: copyText,
    copyAndToast: copyAndToast,
    share: share,
    canShare: canShare,
    sheet: sheet,
    closeSheet: closeSheet,
    isSheetOpen: isSheetOpen,
    trapFocus: trapFocus,
    download: download,
    clamp: clamp,
    parseJson: parseJson
  };
})();
