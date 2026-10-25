/* ECC Pocket — small shared helpers (no dependencies). */
(function () {
  'use strict';

  var PREFIX = 'eccpocket.';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function storeRemove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (err) { /* ignore */ }
  }

  function storeKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (key && key.indexOf(PREFIX) === 0) keys.push(key.slice(PREFIX.length));
      }
    } catch (err) { /* ignore */ }
    return keys;
  }

  function storeClearAll() {
    storeKeys().forEach(storeRemove);
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
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function readMinutes(text) {
    if (!text) return 1;
    var words = String(text).trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 220));
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  function highlight(text, query) {
    var src = String(text == null ? '' : text);
    var q = String(query || '').trim();
    if (!q) return esc(src);
    var idx = src.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return esc(src);
    return esc(src.slice(0, idx)) + '<mark>' + esc(src.slice(idx, idx + q.length)) + '</mark>' + esc(src.slice(idx + q.length));
  }

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function idPath(type, id) {
    return '#/item/' + encodeURIComponent(type) + '/' +
      String(id).split('/').map(encodeURIComponent).join('/');
  }

  function relativeTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return Math.round(diff / 60e3) + 'm ago';
    if (diff < 86400e3) return Math.round(diff / 3600e3) + 'h ago';
    if (diff < 7 * 86400e3) return Math.round(diff / 86400e3) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* Toast -------------------------------------------------------------- */
  var toastTimer = null;
  function toast(message, opts) {
    var node = document.getElementById('toast');
    if (!node) return;
    var options = opts || {};
    node.innerHTML = (options.icon ? icon(options.icon) : '') + '<span>' + esc(message) + '</span>' +
      (options.action ? '<button class="toast-action" type="button">' + esc(options.action.label) + '</button>' : '');
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    if (options.action && options.action.onClick) {
      var btn = node.querySelector('.toast-action');
      btn.addEventListener('click', function () {
        node.classList.remove('is-visible');
        options.action.onClick();
      }, { once: true });
    }
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, options.duration || 2400);
  }

  /* Clipboard ---------------------------------------------------------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (err) {
      return false;
    }
  }

  function copyAndToast(text, label) {
    return copyText(text).then(function (ok) {
      toast(ok ? (label || 'Copied to clipboard') : 'Copy failed — select the text manually', { icon: ok ? 'check' : 'alert' });
      return ok;
    });
  }

  function share(data) {
    if (navigator.share) {
      return navigator.share(data).then(function () { return true; }).catch(function () { return false; });
    }
    return copyText(data.url || location.href).then(function (ok) {
      toast(ok ? 'Link copied — paste it anywhere' : 'Could not copy the link', { icon: ok ? 'check' : 'alert' });
      return false;
    });
  }

  /* Bottom sheet ------------------------------------------------------- */
  var lastFocused = null;
  var sheetOpen = false;

  function openSheet(title, content) {
    var sheet = document.getElementById('sheet');
    var backdrop = document.getElementById('sheetBackdrop');
    var body = document.getElementById('sheetBody');
    var titleNode = document.getElementById('sheetTitle');
    if (!sheet || !backdrop || !body) return;
    lastFocused = document.activeElement;
    titleNode.textContent = title || '';
    body.innerHTML = '';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content) {
      body.appendChild(content);
    }
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(function () {
      backdrop.classList.add('is-open');
      sheet.classList.add('is-open');
      var focusable = sheet.querySelector('button, a, input, [tabindex]');
      if (focusable) focusable.focus({ preventScroll: true });
    });
    document.body.classList.add('sheet-open');
    sheetOpen = true;
  }

  function closeSheet() {
    var sheet = document.getElementById('sheet');
    var backdrop = document.getElementById('sheetBackdrop');
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    sheetOpen = false;
    setTimeout(function () {
      if (!sheetOpen) {
        sheet.hidden = true;
        backdrop.hidden = true;
      }
    }, 220);
    if (lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
  }

  function isSheetOpen() { return sheetOpen; }

  function trapFocus(event) {
    if (!sheetOpen || event.key !== 'Tab') return;
    var sheet = document.getElementById('sheet');
    var nodes = sheet.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

  function initSheet() {
    var backdrop = document.getElementById('sheetBackdrop');
    var close = document.getElementById('sheetClose');
    if (backdrop) backdrop.addEventListener('click', closeSheet);
    if (close) close.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && sheetOpen) {
        event.preventDefault();
        closeSheet();
      }
      trapFocus(event);
    });
  }

  function initToasts() {
    var node = document.getElementById('toast');
    if (!node) return;
    node.addEventListener('click', function (event) {
      if (event.target.closest('.toast-action')) return;
      node.classList.remove('is-visible');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSheet();
    initToasts();
  });

  window.ECCUI = {
    esc: esc,
    icon: icon,
    storeGet: storeGet,
    storeSet: storeSet,
    storeRemove: storeRemove,
    storeClearAll: storeClearAll,
    debounce: debounce,
    formatBytes: formatBytes,
    readMinutes: readMinutes,
    plural: plural,
    highlight: highlight,
    slugify: slugify,
    idPath: idPath,
    relativeTime: relativeTime,
    toast: toast,
    copyText: copyText,
    copyAndToast: copyAndToast,
    share: share,
    openSheet: openSheet,
    closeSheet: closeSheet,
    isSheetOpen: isSheetOpen
  };
})();
