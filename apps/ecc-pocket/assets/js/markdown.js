/* ECC Pocket — markdown rendering, link resolution, TOC and code blocks. */
(function () {
  'use strict';

  var UI = window.ECCUI;
  var Data = window.ECCData;
  var current = null;

  if (window.marked && window.marked.setOptions) {
    window.marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: false,
      mangle: false,
      smartypants: false
    });
  }

  function dirOf(path) {
    if (!path) return '';
    var idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(0, idx + 1) : '';
  }

  function normalizePath(target, basePath) {
    var value = String(target || '').split('#')[0].split('?')[0];
    if (!value) return '';
    if (value.charAt(0) === '/') value = value.slice(1);
    try {
      var url = new URL(value, 'https://ecc.local/' + dirOf(basePath));
      return decodeURIComponent(url.pathname.replace(/^\//, ''));
    } catch (err) {
      return value;
    }
  }

  function splitHash(href) {
    var idx = href.indexOf('#');
    if (idx < 0) return { path: href, anchor: '' };
    return { path: href.slice(0, idx), anchor: decodeURIComponent(href.slice(idx + 1)) };
  }

  function rewriteLink(anchor, entry) {
    var href = anchor.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') {
      if (href.length > 1) anchor.dataset.anchor = href.slice(1);
      return;
    }
    if (/^(mailto:|tel:|sms:)/i.test(href)) return;
    if (/^[a-z]+:/i.test(href)) {
      if (/^https?:/i.test(href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer nofollow';
      }
      return;
    }
    // relative repository path
    var split = splitHash(href);
    var path = normalizePath(split.path, entry.path || entry.p || '');
    if (!path) return;
    var hit = Data.resolveFile(path);
    if (hit) {
      var type = hit[0];
      var id = hit[1];
      var file = hit[2];
      var route = UI.idPath(type, id);
      var params = [];
      if (file) params.push('f=' + encodeURIComponent(file));
      if (split.anchor) params.push('a=' + encodeURIComponent(split.anchor));
      anchor.setAttribute('href', route + (params.length ? '?' + params.join('&') : ''));
      anchor.classList.add('is-internal');
      return;
    }
    anchor.setAttribute('href', Data.sourceUrl(path) + (split.anchor ? '#' + split.anchor : ''));
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.classList.add('is-external');
  }

  function rewriteImage(img, entry) {
    var src = img.getAttribute('src') || '';
    if (!/^(https?:|data:image\/)/i.test(src)) {
      var path = normalizePath(src, entry.path || entry.p || '');
      if (path) img.setAttribute('src', Data.rawUrl(path));
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.classList.add('md-img');
    img.addEventListener('error', function () {
      img.classList.add('is-broken');
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'Image could not be loaded');
    });
  }

  function wrapCode(pre) {
    if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('code-block')) return;
    var code = pre.querySelector('code');
    var language = '';
    if (code && code.className) {
      var match = code.className.match(/language-([\w+#.-]+)/);
      if (match) language = match[1];
    }
    var wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    var head = document.createElement('div');
    head.className = 'code-head';
    var label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = language || 'code';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.setAttribute('aria-label', 'Copy code');
    button.innerHTML = UI.icon('copy') + '<span>Copy</span>';
    head.appendChild(label);
    head.appendChild(button);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(head);
    wrapper.appendChild(pre);
    pre.setAttribute('tabindex', '0');
  }

  function wrapTable(table) {
    if (table.parentNode && table.parentNode.classList && table.parentNode.classList.contains('table-wrap')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  function uniqueId(base, used) {
    var slug = UI.slugify(base) || 'section';
    if (!used.has(slug)) {
      used.set(slug, 1);
      return slug;
    }
    var count = used.get(slug);
    used.set(slug, count + 1);
    return slug + '-' + count;
  }

  function render(markdown, entry) {
    current = entry;
    var source = String(markdown || '');
    var html;
    try {
      html = window.marked ? window.marked.parse(source) : '<p>' + UI.esc(source) + '</p>';
    } catch (err) {
      html = '<p>' + UI.esc(source) + '</p>';
    }
    var clean = html;
    if (window.DOMPurify) {
      clean = window.DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy', 'align'],
        FORBID_ATTR: ['style'],
        ALLOW_DATA_ATTR: false
      });
    }

    var template = document.createElement('template');
    template.innerHTML = clean;
    var root = template.content;

    var used = new Map();
    var toc = [];
    root.querySelectorAll('h1, h2, h3, h4').forEach(function (heading) {
      if (!heading.id) heading.id = uniqueId(heading.textContent, used);
      heading.classList.add('md-heading');
      if (heading.tagName === 'H2' || heading.tagName === 'H3') {
        toc.push({
          id: heading.id,
          text: heading.textContent.replace(/\s+/g, ' ').trim(),
          level: heading.tagName === 'H2' ? 2 : 3
        });
      }
    });

    root.querySelectorAll('a[href]').forEach(function (anchor) { rewriteLink(anchor, entry); });
    root.querySelectorAll('img').forEach(function (img) { rewriteImage(img, entry); });
    root.querySelectorAll('pre').forEach(wrapCode);
    root.querySelectorAll('table').forEach(wrapTable);
    root.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
      box.disabled = true;
      box.setAttribute('aria-hidden', 'true');
    });
    root.querySelectorAll('details').forEach(function (details) {
      details.classList.add('md-details');
    });

    return {
      html: template.innerHTML,
      toc: toc.slice(0, 160)
    };
  }

  function plain(markdown) {
    var text = String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_|~-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }

  window.ECCMarkdown = {
    render: render,
    plain: plain,
    get entry() { return current; }
  };
})();
