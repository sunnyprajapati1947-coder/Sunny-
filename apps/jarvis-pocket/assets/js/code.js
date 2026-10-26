/* JARVIS — in-app coding studio.
 *
 * A real editor and project manager for small web projects: files live in the
 * on-device SQLite database, and "Run" renders the project in a sandboxed
 * iframe (no same-origin, no network, no shell). Nothing here claims to run
 * Python or native code — Android cannot do that without a terminal, and JARVIS
 * does not pretend otherwise.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var DB = window.JarvisDB;

  var state = { project: '', file: '', dirty: false, note: '', tab: 'code' };

  function uid() {
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function projects() {
    return DB.all('projects').slice().sort(function (a, b) {
      return String(b.created || '').localeCompare(String(a.created || ''));
    });
  }

  function filesOf(project) {
    return DB.all('files').filter(function (row) { return String(row.project) === String(project); })
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }

  function starter() {
    return [
      {
        name: 'index.html',
        body: '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <title>My app</title>\n    <link rel="stylesheet" href="style.css">\n  </head>\n  <body>\n    <h1>Hello from JARVIS</h1>\n    <button id="go">Tap me</button>\n    <p id="out"></p>\n    <script src="app.js"><\/script>\n  </body>\n</html>\n'
      },
      { name: 'style.css', body: 'body { font-family: system-ui; background: #0b0d14; color: #e8ecf8; padding: 24px; }\nbutton { padding: 10px 16px; border-radius: 10px; }\n' },
      { name: 'app.js', body: "document.getElementById('go').addEventListener('click', function () {\n  document.getElementById('out').textContent = 'It works on this phone.';\n});\n" }
    ];
  }

  function create(name) {
    var title = String(name || '').trim() || 'Untitled project';
    var id = uid();
    DB.insert('projects', { id: id, name: title, created: new Date().toISOString() });
    starter().forEach(function (file) {
      DB.insert('files', {
        id: uid(),
        project: id,
        name: file.name,
        body: file.body,
        updated: new Date().toISOString()
      });
    });
    return id;
  }

  function removeProject(id) {
    filesOf(id).forEach(function (file) { DB.remove('files', file.id); });
    DB.remove('projects', id);
  }

  function readFile(id) {
    return DB.all('files').filter(function (row) { return String(row.id) === String(id); })[0] || null;
  }

  function writeFile(id, body) {
    DB.update('files', id, { body: body, updated: new Date().toISOString() });
  }

  function newFile(project, name) {
    var clean = String(name || '').trim();
    if (!clean) return { ok: false, error: 'Give the file a name, e.g. app.js' };
    if (!/^[a-zA-Z0-9._-]{1,40}$/.test(clean)) return { ok: false, error: 'Use letters, digits, dot, dash or underscore only.' };
    if (filesOf(project).some(function (file) { return file.name === clean; })) {
      return { ok: false, error: 'That file already exists in this project.' };
    }
    DB.insert('files', { id: uid(), project: project, name: clean, body: '', updated: new Date().toISOString() });
    return { ok: true };
  }

  /* ------------------------------------------------------------- preview */

  /* One self-contained document: html as written, css and js inlined. The
     iframe is sandboxed with scripts only, so it cannot reach the app's data. */
  function buildDocument(project) {
    var files = filesOf(project);
    var html = (files.filter(function (f) { return /\.html?$/i.test(f.name); })[0] || {}).body || '<!doctype html><body></body>';
    var css = files.filter(function (f) { return /\.css$/i.test(f.name); })
      .map(function (f) { return f.body || ''; }).join('\n');
    var js = files.filter(function (f) { return /\.m?js$/i.test(f.name); })
      .map(function (f) { return f.body || ''; }).join('\n;\n');

    var doc = String(html);
    doc = doc.replace(/<link[^>]+href=["'][^"']*\.css["'][^>]*>/gi, '');
    doc = doc.replace(/<script[^>]+src=["'][^"']*\.m?js["'][^>]*>\s*<\/script>/gi, '');
    if (css) {
      doc = /<\/head>/i.test(doc)
        ? doc.replace(/<\/head>/i, '<style>\n' + css + '\n</style>\n</head>')
        : '<style>\n' + css + '\n</style>\n' + doc;
    }
    if (js) {
      doc = /<\/body>/i.test(doc)
        ? doc.replace(/<\/body>/i, '<script>\n' + js + '\n<\/script>\n</body>')
        : doc + '\n<script>\n' + js + '\n<\/script>';
    }
    return doc;
  }

  /* -------------------------------------------------------------- screens */

  function listScreen() {
    var all = projects();
    var rows = all.map(function (project) {
      return '<a class="card card-link" href="#/code/' + encodeURIComponent(project.id) + '">' +
        '<div class="card-head"><h2>' + UI.esc(project.name) + '</h2><span class="row-chev">' + UI.icon('chevron') + '</span></div>' +
        '<p class="muted small">' + filesOf(project.id).length + ' file(s) · ' +
        UI.esc(String(project.created || '').slice(0, 10)) + '</p></a>';
    }).join('');

    return '<section class="screen code-screen">' +
      '<div class="screen-head"><h1>Code</h1><p>Real files, stored on this phone. Run them in a sandbox — no terminal, no shell.</p></div>' +
      '<section class="card"><div class="card-head"><h2>' + UI.icon('plus') + 'New project</h2></div>' +
        '<label class="field"><span>Name</span><input id="codeName" type="text" maxlength="40" placeholder="My first app"></label>' +
        '<div class="card-actions"><button class="btn btn-primary" id="codeCreate">Create project</button></div>' +
        '<p class="small muted">Creates <code>index.html</code>, <code>style.css</code> and <code>app.js</code>. ' +
        'JavaScript/HTML/CSS run in a sandboxed iframe; Python and native code are not available on Android without a terminal.</p>' +
      '</section>' +
      (rows ? '<div class="stack-cards">' + rows + '</div>'
            : '<p class="muted small">No projects yet.</p>') +
      '</section>';
  }

  function editorScreen(projectId) {
    var project = DB.all('projects').filter(function (row) { return String(row.id) === String(projectId); })[0];
    if (!project) {
      return '<section class="screen"><div class="empty-block">' + UI.icon('alert') +
        '<h3>Project not found</h3><a class="btn btn-ghost" href="#/code">Back to Code</a></div></section>';
    }
    var files = filesOf(project.id);
    if (!files.length) {
      newFile(project.id, 'index.html');
      files = filesOf(project.id);
    }
    var current = readFile(state.file) && String(readFile(state.file).project) === String(project.id)
      ? readFile(state.file)
      : files[0];
    var body = current ? (current.body || '') : '';

    return '<section class="screen code-screen">' +
      '<div class="screen-head"><h1>' + UI.esc(project.name) + '</h1>' +
        '<p><a href="#/code">All projects</a></p></div>' +
      '<div class="code-tabs">' + files.map(function (file) {
        return '<button class="chip chip-mono' + (current && file.id === current.id ? ' is-on' : '') +
          '" data-file="' + UI.esc(file.id) + '">' + UI.esc(file.name) + '</button>';
      }).join('') + '</div>' +
      '<section class="card"><div class="card-head"><h2>' + UI.icon('code') + ' ' +
        UI.esc(current ? current.name : 'file') + '</h2><span class="pill">' +
        (state.dirty ? 'unsaved' : 'saved') + '</span></div>' +
        '<textarea id="codeBody" class="code-area" spellcheck="false" rows="16">' + UI.esc(body) + '</textarea>' +
        '<div class="card-actions">' +
          '<button class="btn btn-primary" id="codeSave">Save</button>' +
          '<button class="btn btn-ghost" id="codeRun">Run</button>' +
          '<button class="btn btn-ghost" id="codeNewFile">New file</button>' +
          '<button class="btn btn-ghost" id="codeDelete">Delete project</button>' +
        '</div>' +
        (state.note ? '<p class="small">' + UI.esc(state.note) + '</p>' : '') +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>' + UI.icon('bolt') + 'Preview</h2>' +
        '<span class="pill">sandboxed</span></div>' +
        '<iframe id="codeFrame" class="code-frame" sandbox="allow-scripts allow-modals" title="Project preview"></iframe>' +
        '<p class="small muted">Scripts run, but the page cannot read app data, cookies or the network origin.</p>' +
      '</section>' +
      '</section>';
  }

  function render() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function mountList() {
    var create = document.getElementById('codeCreate');
    if (create) create.addEventListener('click', function () {
      var name = document.getElementById('codeName');
      var id = create_(name ? name.value : '');
      location.hash = '#/code/' + encodeURIComponent(id);
    });
  }

  function create_(name) { return create(name); }

  function mountEditor(projectId) {
    var project = DB.all('projects').filter(function (row) { return String(row.id) === String(projectId); })[0];
    if (!project) return;
    var area = document.getElementById('codeBody');
    var frame = document.getElementById('codeFrame');

    Array.prototype.forEach.call(document.querySelectorAll('[data-file]'), function (button) {
      button.addEventListener('click', function () {
        state.file = button.getAttribute('data-file');
        state.dirty = false;
        state.note = '';
        render();
      });
    });

    if (area) {
      state.file = state.file || filesOf(project.id)[0].id;
      area.addEventListener('input', function () {
        state.dirty = true;
        var pill = document.querySelector('.code-screen .card-head .pill');
        if (pill) pill.textContent = 'unsaved';
      });
    }

    var save = document.getElementById('codeSave');
    if (save) save.addEventListener('click', function () {
      if (!area || !state.file) return;
      writeFile(state.file, area.value);
      state.dirty = false;
      state.note = 'Saved to this phone at ' + new Date().toLocaleTimeString() + '.';
      render();
      UI.toast('Saved', { tone: 'ok' });
    });

    function run() {
      if (!frame) return;
      if (area && state.file) writeFile(state.file, area.value);
      state.dirty = false;
      frame.srcdoc = buildDocument(project.id);
      state.note = 'Preview rebuilt from the saved files.';
      UI.toast('Running in the sandbox', { tone: 'ok' });
    }

    var runBtn = document.getElementById('codeRun');
    if (runBtn) runBtn.addEventListener('click', run);
    if (frame && !frame.srcdoc) frame.srcdoc = buildDocument(project.id);

    var add = document.getElementById('codeNewFile');
    if (add) add.addEventListener('click', function () {
      var name = window.prompt('File name (e.g. app.js)', 'app.js');
      if (!name) return;
      var result = newFile(project.id, name);
      if (!result.ok) {
        state.note = result.error;
        render();
        return;
      }
      state.file = filesOf(project.id).filter(function (file) { return file.name === name.trim(); })[0].id;
      state.note = 'Added ' + name.trim() + '.';
      render();
    });

    var del = document.getElementById('codeDelete');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('Delete "' + project.name + '" and all of its files? This cannot be undone.')) return;
      removeProject(project.id);
      location.hash = '#/code';
    });
  }

  window.JarvisCode = {
    screen: function (projectId) {
      return projectId ? editorScreen(projectId) : listScreen();
    },
    mount: function (projectId) {
      if (projectId) mountEditor(projectId);
      else mountList();
    },
    projects: projects,
    create: create,
    remove: removeProject,
    filesOf: filesOf,
    buildDocument: buildDocument
  };
})();
