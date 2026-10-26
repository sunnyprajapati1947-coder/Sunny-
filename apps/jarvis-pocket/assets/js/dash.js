/* JARVIS — dashboard, diagnostics and privacy controls.
 *
 * Everything on this screen is read from the device at the moment it renders:
 * memory, storage, battery, permissions, model files, the document index and
 * the tool log. Nothing is estimated silently; unknown values say "not
 * reported" instead of showing a made-up number.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var B = window.JarvisLocalBrain;
  var Model = window.JarvisModel;
  var Tools = window.JarvisTools;
  var KB = window.JarvisKB;
  var DB = window.JarvisDB;
  var Memory = window.JarvisMemory;

  var state = { stats: null, perms: null, model: null, diag: null, note: '', busy: '', query: '', hits: null };

  function pill(text, tone) {
    return '<span class="pill ' + (tone || '') + '">' + UI.esc(text) + '</span>';
  }

  function card(title, icon, body, right) {
    return '<section class="card"><div class="card-head"><h2>' + UI.icon(icon) + ' ' + UI.esc(title) + '</h2>' +
      (right || '') + '</div>' + body + '</section>';
  }

  function row(main, side) {
    return '<div class="row"><span class="row-main">' + main + '</span><span class="row-side">' + side + '</span></div>';
  }

  function mb(value) {
    if (value == null) return 'not reported';
    return Math.round(value) + ' MB';
  }

  /* --------------------------------------------------------------- cards */

  function brainCard() {
    var info = state.model;
    var loaded = B && B.isReady();
    var guard = B && B.memCheck ? B.memCheck(false) : { ok: true, advice: '' };
    var files = info ? info.files.filter(function (file) { return file.present && !file.optional; }).length : 0;
    var required = info ? info.files.filter(function (file) { return !file.optional; }).length : 0;
    return card('On-device brain', 'brain',
      '<div class="stack-list">' +
        row('Model', pill('Qwen3.5 0.8B · text', 'ok')) +
        row('Files on phone', pill(files + ' of ' + required, info && info.ready ? 'ok' : 'warn')) +
        row('Engine', pill(loaded ? 'loaded in memory' : 'not loaded', loaded ? 'ok' : '')) +
        row('Memory guard', guard.ok ? pill('ready', 'ok') : pill('needs memory', 'warn')) +
      '</div>' +
      (guard.ok ? '' : '<p class="small" style="color:var(--warn)">' + UI.esc(guard.advice) + '</p>') +
      '<div class="card-actions">' +
        '<a class="btn btn-primary btn-sm" href="#/local">Model manager</a>' +
        (loaded ? '<button class="btn btn-ghost btn-sm" id="dashFree">Unload from memory</button>' : '') +
      '</div>',
      info && info.ready ? pill('model ready', 'ok') : pill('model missing', 'warn'));
  }

  function deviceCard() {
    var s = state.stats;
    if (!s) {
      return card('Phone', 'bolt', '<p class="muted small">' +
        (Tools.nativeReady() ? 'Reading the phone…' : 'Device readings need the installed Android app.') + '</p>');
    }
    return card('Phone', 'bolt',
      '<div class="stack-list">' +
        row('Free memory', pill(mb(s.availMb) + ' of ' + mb(s.totalMb), (s.availMb && s.totalMb && s.availMb / s.totalMb < 0.15) ? 'warn' : 'ok')) +
        row('Free storage', pill(mb(s.freeStorageMb), '')) +
        row('Battery', pill((s.batteryPct == null ? '?' : s.batteryPct) + '%' + (s.charging ? ' · charging' : ''), '')) +
        row('CPU cores', pill(String(s.cores || '?'), '')) +
        row('Android', pill(String(s.android || '?') + ' · SDK ' + String(s.sdk || '?'), '')) +
      '</div>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="dashRefresh">Refresh</button></div>');
  }

  function permissionCard() {
    var p = state.perms;
    if (!p) return card('Permissions', 'shield', '<p class="muted small">' + (Tools.nativeReady() ? 'Reading permissions…' : 'Android permissions are only available in the installed app.') + '</p>');
    if (p.native === false) return card('Permissions', 'shield', '<p class="muted small">Android permissions are only available in the installed app.</p>');
    var labels = { microphone: 'Microphone', calendar: 'Calendar', notifications: 'Notifications' };
    var body = Object.keys(labels).map(function (key) {
      var allowed = !!(p.permissions && p.permissions[key]);
      return row(labels[key], allowed ? pill('allowed', 'ok')
        : '<button class="btn btn-ghost btn-sm" data-grant="' + key + '">Allow</button>');
    }).join('');
    return card('Permissions', 'shield', '<div class="stack-list">' + body + '</div>' +
      '<p class="small muted">Each permission is asked for by the feature that needs it. Nothing is granted silently.</p>');
  }

  function knowledgeCard() {
    var stats = KB.stats();
    var docs = KB.list();
    var hits = (state.hits || []).map(function (hit) {
      return '<div class="row"><span class="row-main"><b>' + UI.esc(hit.title) + '</b>' +
        (hit.part ? ' <span class="muted small">' + UI.esc(hit.part) + '</span>' : '') +
        '<br><span class="small">' + UI.esc(hit.snippet) + '</span></span>' +
        '<span class="row-side">' + pill(String(hit.score), '') + '</span></div>';
    }).join('');
    return card('Local knowledge', 'book',
      '<p class="muted small">' + stats.documents + ' document(s) · ' + stats.passages +
        ' passage(s), indexed locally and ranked with BM25. No embedding service.</p>' +
      '<label class="field"><span>Title</span><input id="kbTitle" type="text" maxlength="80" placeholder="My notes"></label>' +
      '<label class="field"><span>Text</span><textarea id="kbText" rows="4" placeholder="Paste text to index on this phone"></textarea></label>' +
      '<div class="card-actions">' +
        '<button class="btn btn-primary btn-sm" id="kbAdd">Index text</button>' +
        '<input type="file" id="kbFile" accept=".txt,.md,text/plain,text/markdown" hidden>' +
        '<button class="btn btn-ghost btn-sm" id="kbPick">Import file</button>' +
      '</div>' +
      (state.note ? '<p class="small">' + UI.esc(state.note) + '</p>' : '') +
      '<label class="field"><span>Search the index</span><input id="kbQuery" type="search" placeholder="e.g. battery saver"></label>' +
      (hits || '<p class="muted small">' + (docs.length ? 'Type above to search.' : 'No documents yet.') + '</p>') +
      (docs.length ? '<div class="stack-list">' + docs.map(function (doc) {
        return row(UI.esc(doc.title), '<button class="btn btn-ghost btn-sm" data-drop="' +
          encodeURIComponent(doc.title) + '">' + UI.icon('trash') + '</button>');
      }).join('') + '</div>' : ''));
  }

  function historyCard() {
    var rows = Tools.history();
    if (!rows.length) return card('Recent actions', 'clock', '<p class="muted small">No action has run yet on this phone.</p>');
    return card('Recent actions', 'clock', '<div class="stack-list">' + rows.slice(0, 8).map(function (entry) {
      var tone = entry.ok ? (entry.verified ? 'ok' : '') : 'warn';
      return row('<b>' + UI.esc(entry.tool) + '</b><br><span class="small">' + UI.esc(entry.evidence) + '</span>',
        pill(entry.ok ? (entry.verified ? 'verified' : 'unverified') : 'failed', tone));
    }).join('') + '</div>');
  }

  function diagnosticsCard() {
    var d = state.diag ? (state.diag.environment || state.diag) : null;
    var db = DB.stats();
    var body = '<div class="stack-list">' +
      row('Database', pill(db.backend, db.backend === 'sqlite' ? 'ok' : '')) +
      row('Memories', pill(String(db.memories || 0), '')) +
      row('Documents', pill(String(db.documents || 0), '')) +
      row('Projects', pill(String(db.projects || 0), '')) +
      row('WebGPU', pill(d ? (d.webgpu ? 'available' : 'not available') : '…', d && d.webgpu ? 'ok' : '')) +
      row('WASM', pill(d ? (d.wasm ? 'available' : 'missing') : '…', d && d.wasm ? 'ok' : '')) +
      row('Cache storage', pill(d && d.cachedFiles != null ? d.cachedFiles + ' model file(s)' : '…', '')) +
      row('Free space', pill(d && d.quotaMb ? d.quotaMb + ' MB' : '…', '')) +
      '</div>';
    return card('Diagnostics', 'info', body +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="dashDiag">Run engine checks</button></div>' +
      '<p class="small muted">These checks only touch this device: engine capabilities, cache contents and storage quota.</p>');
  }

  function privacyCard() {
    return card('Privacy', 'shield',
      '<p class="small muted">No analytics, no uploads, no cloud model. The only download is the model itself, and only ' +
      'when you tap Download. Memories and documents stay in this app\'s private database; secrets are refused instead of stored.</p>' +
      '<div class="card-actions">' +
        '<button class="btn btn-ghost btn-sm" id="dashClearMemory">Clear memories</button>' +
        '<button class="btn btn-ghost btn-sm" id="dashClearDocs">Clear documents</button>' +
        '<button class="btn btn-ghost btn-sm" id="dashClearHistory">Clear action log</button>' +
      '</div>');
  }

  function screen() {
    return '<section class="screen dash-screen">' +
      '<div class="screen-head"><h1>Dashboard</h1><p>Live readings from this phone. No cloud, no account.</p></div>' +
      brainCard() + deviceCard() + permissionCard() + knowledgeCard() + historyCard() + diagnosticsCard() + privacyCard() +
      '</section>';
  }

  /* -------------------------------------------------------------- loading */

  function refresh() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function loadDevice() {
    if (!Tools.nativeReady()) return;
    Tools.run('device_stats', {}, { confirmed: true }).then(function (result) {
      if (result.ok && result.data) {
        state.stats = result.data;
        refresh();
      }
    });
  }

  function loadPermissions() {
    Tools.permissions().then(function (perms) {
      state.perms = perms;
      refresh();
    });
  }

  function loadModel() {
    var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
    Model.inspect(model, 'wasm').then(function (info) {
      state.model = info;
      refresh();
    });
  }

  function loadDiagnostics() {
    Model.diagnose().then(function (result) {
      state.diag = result;
      refresh();
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- mount */

  function mount() {
    if (!state.perms) loadPermissions();
    if (!state.stats) loadDevice();
    if (!state.model) loadModel();
    if (!state.diag) loadDiagnostics();

    var free = document.getElementById('dashFree');
    if (free) free.addEventListener('click', function () {
      B.release().then(function () {
        UI.toast('Brain unloaded — memory freed', { tone: 'ok' });
        refresh();
      });
    });

    var reRun = document.getElementById('dashRefresh');
    if (reRun) reRun.addEventListener('click', function () {
      state.stats = null;
      loadDevice();
    });

    var diag = document.getElementById('dashDiag');
    if (diag) diag.addEventListener('click', function () {
      state.diag = null;
      loadDiagnostics();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-grant]'), function (button) {
      button.addEventListener('click', function () {
        var name = button.getAttribute('data-grant');
        Tools.requestPermission(name).then(function () {
          UI.toast('Android is asking for ' + name + ' permission', { tone: 'ok' });
          setTimeout(function () { state.perms = null; loadPermissions(); }, 1500);
        }).catch(function (error) { UI.toast(error.message, { tone: 'warn' }); });
      });
    });

    var add = document.getElementById('kbAdd');
    if (add) add.addEventListener('click', function () {
      var title = document.getElementById('kbTitle');
      var text = document.getElementById('kbText');
      var result = KB.add({ title: title ? title.value : '', text: text ? text.value : '', source: 'paste' });
      state.note = result.ok ? ('Indexed ' + result.parts + ' passage(s) from "' + result.title + '".') : result.error;
      if (result.ok && text) text.value = '';
      refresh();
    });

    var pick = document.getElementById('kbPick');
    var file = document.getElementById('kbFile');
    if (pick && file) {
      pick.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var chosen = file.files && file.files[0];
        if (!chosen) return;
        if (chosen.size > 4 * 1024 * 1024) {
          state.note = 'That file is larger than 4 MB. Split it first.';
          refresh();
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result = KB.add({
            title: chosen.name.replace(/\.[^.]+$/, ''),
            text: String(reader.result || ''),
            source: 'file: ' + chosen.name
          });
          state.note = result.ok ? ('Indexed ' + result.parts + ' passage(s) from ' + chosen.name + '.') : result.error;
          refresh();
        };
        reader.readAsText(chosen);
      });
    }

    var query = document.getElementById('kbQuery');
    if (query) {
      query.addEventListener('input', UI.debounce(function () {
        state.query = query.value;
        state.hits = state.query.trim() ? KB.search(state.query, 6) : null;
        refresh();
      }, 220));
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-drop]'), function (button) {
      button.addEventListener('click', function () {
        var title = decodeURIComponent(button.getAttribute('data-drop'));
        KB.remove(title);
        state.note = 'Removed "' + title + '" from the index.';
        state.hits = null;
        refresh();
      });
    });

    var clearMemory = document.getElementById('dashClearMemory');
    if (clearMemory) clearMemory.addEventListener('click', function () {
      if (!window.confirm('Delete every remembered fact on this phone?')) return;
      Memory.clear();
      state.note = 'Memories cleared.';
      refresh();
    });

    var clearDocs = document.getElementById('dashClearDocs');
    if (clearDocs) clearDocs.addEventListener('click', function () {
      if (!window.confirm('Delete every indexed document on this phone?')) return;
      KB.clear();
      state.note = 'Documents cleared.';
      refresh();
    });

    var clearHistory = document.getElementById('dashClearHistory');
    if (clearHistory) clearHistory.addEventListener('click', function () {
      Tools.clearHistory();
      state.note = 'Action log cleared.';
      refresh();
    });
  }

  window.JarvisDash = { screen: screen, mount: mount };
})();
