/* Jarvis Pocket — markdown rendering, sanitising, links, table of contents. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;

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
    var index = String(path || '').lastIndexOf('/');
    return index >= 0 ? path.slice(0, index + 1) : '';
  }

  function normalizePath(target, basePath) {
    var value = String(target || '').split('#')[0].split('?')[0];
    if (!value) return '';
    if (value.charAt(0) === '/') value = value.slice(1);
    try {
      var url = new URL(value, 'https://pack.local/' + dirOf(basePath));
      return decodeURIComponent(url.pathname.replace(/^\//, ''));
    } catch (error) {
      return value;
    }
  }

  function rewriteLink(anchor, item) {
    var href = anchor.getAttribute('href') || '';
    if (!href) return;
    if (href.charAt(0) === '#') {
      anchor.dataset.anchor = href.slice(1);
      return;
    }
    if (/^(mailto:|tel:|sms:)/i.test(href)) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (/^https?:/i.test(href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer nofollow';
      }
      return;
    }
    var hashAt = href.indexOf('#');
    var path = hashAt >= 0 ? href.slice(0, hashAt) : href;
    var anchorId = hashAt >= 0 ? href.slice(hashAt + 1) : '';
    var resolved = normalizePath(path, item.f || '');
    var hit = resolved ? Pack.resolvePath(item.p, resolved) : null;
    if (hit) {
      anchor.setAttribute('href', '#/item/' + encodeURIComponent(hit));
      anchor.classList.add('is-internal');
      return;
    }
    var absolute = Pack.sourceUrl(item);
    if (absolute) {
      var base = absolute.slice(0, absolute.indexOf('/blob/') + 6);
      var repoPath = dirOf(item.f) + path;
      try {
        var normal = new URL(repoPath, 'https://repo.local/').pathname.replace(/^\//, '');
        anchor.setAttribute('href', base + normal + (anchorId ? '#' + anchorId : ''));
      } catch (error) { /* keep original */ }
    }
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.classList.add('is-external');
  }

  function rewriteImage(image, item) {
    var src = image.getAttribute('src') || '';
    if (!/^(https?:|data:image\/)/i.test(src)) {
      var pack = Pack.packOf(item);
      if (pack && pack.sha) {
        var path = normalizePath(src, item.f || '');
        image.setAttribute('src', 'https://raw.githubusercontent.com/' + pack.repo + '/' + pack.sha + '/' + path);
      }
    }
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    image.setAttribute('referrerpolicy', 'no-referrer');
    image.classList.add('md-img');
    image.addEventListener('error', function () {
      image.classList.add('is-broken');
      if (!image.getAttribute('alt')) image.setAttribute('alt', 'Image could not load');
    });
  }

  function wrapCode(pre) {
    if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('code-block')) return;
    var code = pre.querySelector('code');
    var language = '';
    if (code && code.className) {
      var match = String(code.className).match(/language-([\w+#.-]+)/);
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
    button.addEventListener('click', function () {
      UI.copyAndToast(code ? code.innerText : pre.innerText, 'Code');
    });
    head.appendChild(label);
    head.appendChild(button);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(head);
    wrapper.appendChild(pre);
  }

  function slugHeading(text, used) {
    var base = UI.slugify(text) || 'section';
    var slug = base;
    var i = 2;
    while (used[slug]) {
      slug = base + '-' + i;
      i += 1;
    }
    used[slug] = true;
    return slug;
  }

  function decorate(container, item) {
    var used = Object.create(null);
    var headings = container.querySelectorAll('h1, h2, h3');
    Array.prototype.forEach.call(headings, function (heading) {
      var text = heading.textContent || '';
      heading.id = slugHeading(text, used);
      heading.dataset.heading = text;
    });
    if (item) {
      Array.prototype.forEach.call(container.querySelectorAll('a[href]'), function (anchor) {
        rewriteLink(anchor, item);
      });
      Array.prototype.forEach.call(container.querySelectorAll('img'), function (image) {
        rewriteImage(image, item);
      });
    }
    Array.prototype.forEach.call(container.querySelectorAll('pre'), wrapCode);
    Array.prototype.forEach.call(container.querySelectorAll('table'), function (table) {
      var wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
    Array.prototype.forEach.call(container.querySelectorAll('input[type="checkbox"]'), function (box) {
      box.disabled = true;
    });
  }

  function sanitize(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel', 'id', 'data-anchor', 'loading', 'decoding', 'referrerpolicy', 'colspan', 'rowspan'],
        ADD_TAGS: ['details', 'summary'],
        FORBID_TAGS: ['style', 'form', 'input', 'button'],
        ALLOW_DATA_ATTR: true
      });
    }
    return html;
  }

  function render(markdown, item) {
    var html = '';
    try {
      html = window.marked ? window.marked.parse(String(markdown || '')) : String(markdown || '');
    } catch (error) {
      html = '<p>' + UI.esc(markdown) + '</p>';
    }
    var host = document.createElement('div');
    host.innerHTML = sanitize(html);
    if (item) decorate(host, item);
    return host.innerHTML;
  }

  function renderInto(element, markdown, item) {
    element.innerHTML = render(markdown, item);
    return element;
  }

  function toc(markdown) {
    var lines = String(markdown || '').split('\n');
    var out = [];
    var fenced = false;
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      var match = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (match) {
        out.push({ level: match[1].length, text: match[2].replace(/[*_`]/g, '').trim() });
      }
      if (out.length >= 40) break;
    }
    return out;
  }

  /* Compact inline markdown for chat bubbles and list snippets. */
  function inline(text) {
    return String(text || '')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  window.JarvisMarkdown = {
    render: render,
    renderInto: renderInto,
    toc: toc,
    inline: inline,
    sanitize: sanitize
  };
})();
