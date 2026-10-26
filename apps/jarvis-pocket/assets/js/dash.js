/* JARVIS — dashboard: brain, phone, permissions, knowledge base, tool history,
   diagnostics and the privacy switches. Every number shown is read live. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var B = window.JarvisLocalBrain;
  var Model = window.JarvisModel;
  var Tools = window.JarvisTools;
  var KB = window.JarvisKB;
  var DB = window.JarvisDB;
  var Memory = window.JarvisMemory;

  var state = {
    stats: null,
    perms: null,
    model: null,
    history: Tools.recent(),
    kbStats: KB.stats(),
    note: '',
    query: '',
    hits: null,
    busy: ''
  };

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

  function deviceCard() {
    var s = state.stats;
    if (!s) {
      return card('Phone', 'bolt', '<p class="muted small">' +
        (window.JarvisNative && window.JarvisNative.available
          ? 'Reading the phone…'
          : 'Device readings need the installed Android app. In the browser this panel stays empty on purpose.') + '</p>');
    }
    return card('Phone', 'bolt',
      '<div class="stack-list">' +
      row('Memory free', pill((s.availRamMb || 0) + ' of ' + (s.totalRamMb || 0) + ' MB', s.lowMemory ? 'warn' : 'ok')) +
      row('Storage free', pill((s.freeStorageMb || 0) + ' of ' + (s.totalStorageMb || 0) + ' MB', (s.freeStorageMb || 0) > 2000 ? 'ok' : 'warn')) +
      row('Battery', pill((s.batteryPct != null ? s.batteryPct : '?') + '%' + (s.charging ? ' charging' : ''), '')) +
      row('CPU cores', pill(String(s.cores || '?'), '')) +
      row('Android', pill(String(s.android || '?') + ' · SDK ' + String(s.sdk || '?'), '')) +
      '</div>' +
      (s.lowMemory ? '<p class="small" style="color:var(--warn)">The phone is low on memory. Free the model before loading it again.</p>' : ''));
  }

  function brainCard() {
    var info = state.model;
    var loaded = B && B.isReady();
    var body = '<div class="stack-list">' +
      row('Model', pill('Qwen3.5 0.8B', 'ok')) +
      row('Files on phone', pill(info ? (info.files.filter(function (f) { return f.present; }).length + ' of ' + info.files.length) : '?', info && info.ready ? 'ok' : 'warn')) +
      row('Engine', pill(loaded ? 'loaded in memory' : 'not loaded', loaded ? 'ok' : '')) +
      '</div>' +
      '<div class="card-actions"><a class="btn btn-primary btn-sm" href="#/local">Model manager</a>' +
      '<button class="btn btn-ghost btn-sm" id="dashFree">Free memory</button></div>';
    return card('On-device brain', 'brain', body, loaded ? pill('ready', 'ok') : pill('idle', 'warn'));
  }

  function permissionCard() {
    var p = state.perms;
    if (!p) {
      return card('Permissions', 'shield', '<p class="muted small">' +
        (window.JarvisNative && window.JarvisNative.available ? 'Reading permissions…' : 'Permissions are managed by Android inside the installed app.') + '</p>');
    }
    if (p.native === false) {
      return card('Permissions', 'shield', '<p class="muted small">Android permissions are only available in the installed app.</p>');
    }
    var rows = [
      ['microphone', 'Microphone (voice input)', !!p.microphone],
      ['notifications', 'Notifications', !!p.notifications],
      ['calendar', 'Calendar read and write', !!p.calendar],
      ['installs', 'Install app updates', !!p.installs],
      ['exactAlarms', 'Exact alarms', !!p.exactAlarms]
    ].map(function (entry) {
      return row(UI.esc(entry[1]), (entry[2] ? pill('allowed', 'ok')
        : '<button class="btn btn-ghost btn-sm" data-grant="' + entry[0] + '">Allow</button>'));
    }).join('');
    return card('Permissions', 'shield', '<div class="stack-list">' + rows + '</div>' +
      '<p class="muted small">JARVIS asks only for what a feature needs. Nothing is granted silently.</p>');
  }

  function knowledgeCard() {
    var stats = state.kbStats || { documents: 0, chars: 0 };
    var hits = state.hits;
    return card('Local knowledge', 'book',
      '<p class="muted small">' + stats.documents + ' passages indexed · ' + Math.round(stats.chars / 1000) + 'k characters · ' +
      'stored in ' + UI.esc(stats.backend || 'local') + '</p>' +
      '<label class="field"><span>Add a document</span><input id="kbTitle" type="text" placeholder="Title" maxlength="120"></label>' +
      '<label class="field"><span>Text</span><textarea id="kbText" rows="4" placeholder="Paste notes, a README, a chapter — JARVIS will search it offline."></textarea></label>' +
      '<div class="card-actions"><button class="btn btn-primary btn-sm" id="kbSave">Index it</button>' +
      '<input type="file" id="kbFile" accept=".txt,.md,.markdown,.json,.csv,text/*" hidden>' +
      '<button class="btn btn-ghost btn-sm" id="kbPick">Import a text file</button></div>' +
      '<label class="field"><span>Search the knowledge base</span>' +
      '<input id="kbQuery" type="text" placeholder="What do you want to find?" value="' + UI.esc(state.query) + '"></label>' +
      (hits ? '<div class="stack-list">' + (hits.length
        ? hits.map(function (hit) { return row(UI.esc(hit.title), pill(hit.score.toFixed ? hit.score.toFixed(2) : String(hit.score), '')); }).join('')
        : '<p class="muted small">No passage matches that query.</p>') + '</div>' : '') +
      (state.note ? '<p class="muted small">' + UI.esc(state.note) + '</p>' : ''));
  }

  function historyCard() {
    var rows = state.history || [];
    return card('Recent tool calls', 'clock', rows.length
      ? '<div class="stack-list">' + rows.slice(0, 10).map(function (entry) {
        return row(UI.esc(entry.name) + ' · ' + UI.esc(String(entry.text || '').slice(0, 90)),
          pill(entry.verified ? 'verified' : (entry.ok ? 'unverified' : 'failed'), entry.verified ? 'ok' : (entry.ok ? 'warn' : 'warn')));
      }).join('') + '</div>'
      : '<p class="muted small">No tool has run yet. Ask JARVIS for the battery level or to open an app.</p>');
  }

  function storageCard() {
    var stats = DB ? DB.stats() : { backend: 'none', memories: 0, documents: 0 };
    var env = (state.diag && state.diag.environment) || {};
    return card('Storage and diagnostics', 'info',
      '<div class="stack-list">' +
      row('Database', pill(stats.backend, stats.backend === 'sqlite' ? 'ok' : 'warn')) +
      row('Memories', pill(String(stats.memories), '')) +
      row('Documents', pill(String(stats.documents), '')) +
      row('Cache storage', pill((env.usageMb || 0) + ' used of ' + (env.quotaMb || 0) + ' MB', '')) +
      row('WebGPU', pill(env.webgpu ? 'available' : 'no', env.webgpu ? 'ok' : '')) +
      '</div>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="dashDiag">Run diagnostics</button>' +
      '<button class="btn btn-ghost btn-sm" id="dashClearMemory">Clear memories</button>' +
      '<button class="btn btn-ghost btn-sm" id="dashClearDocs">Clear documents</button></div>');
  }

  function screen() {
    return '<section class="screen dash-screen">' +
      '<div class="screen-head"><h1>Dashboard</h1><p>Everything here is read from this phone right now. No cloud, no account.</p></div>' +
      brainCard() + deviceCard() + permissionCard() + knowledgeCard() + historyCard() + storageCard() +
      '<section class="card"><div class="card-head"><h2>' + UI.icon('shield') + 'Privacy</h2></div>' +
      '<p class="small muted">No analytics and no uploads. Model files are the only thing downloaded, and only when you ' +
      'tap Download. Secrets are refused by the memory guard instead of being stored.</p></section>' +
      '</section>';
  }

  function refresh() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function loadDevice() {
    if (state.stats || !window.JarvisNative || !window.JarvisNative.available) return;
    Tools.run('device_stats').then(function (result) {
      if (result.ok) {
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

  function mount() {
    if (!state.perms) loadPermissions();
    if (!state.stats) loadDevice();
    if (!state.model) {
      var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
      Model.inspect(model, 'wasm').then(function (info) {
        state.model = info;
        refresh();
      });
    }

    var free = document.getElementById('dashFree');
    if (free) free.addEventListener('click', function () {
      B.release().then(function () { UI.toast('Model memory freed', { tone: 'ok' }); refresh(); });
    });

    var grant = document.querySelectorAll('[data-grant]');
    Array.prototype.forEach.call(grant, function (button) {
      button.addEventListener('click', function () {
        Tools.requestPermission(button.getAttribute('data-grant')).then(function () {
          UI.toast('Android shows the permission dialog', { tone: 'ok' });
          setTimeout(loadPermissions, 1200);
        });
      });
    });

    var save = document.getElementById('kbSave');
    if (save) save.addEventListener('click', function () {
      var title = document.getElementById('kbTitle');
      var text = document.getElementById('kbText');
      var result = KB.add({ title: title ? title.value : '', text: text ? text.value : '', source: 'paste' });
      if (!result.ok) {
        state.note = result.error;
      } else {
        state.note = 'Indexed ' + result.parts + ' passage(s) from ' + result.chars + ' characters.';
        state.kbStats = KB.stats();
        if (window.JarvisDB) window.JarvisDB.reload && window.JarvisDB.reload();
      }
      refresh();
    });

    var pick = document.getElementById('kbPick');
    var file = document.getElementById('kbFile');
    if (pick && file) {
      pick.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var chosen = file.files && file.files[0];
        if (!chosen) return;
        if (chosen.size > 2 * 1024 * 1024) {
          state.note = 'That file is larger than 2 MB. Split it first.';
          refresh();
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result = KB.add({ title: chosen.name.replace(/\.[^.]+$/, ''), text: String(reader.result || ''), source: 'file: ' + chosen.name });
          state.note = result.ok ? 'Indexed ' + result.parts + ' passage(s) from ' + chosen.name : result.error;
          state.kbStats = KB.stats();
          refresh();
        };
        reader.readAsText(chosen);
      });
    }

    var query = document.getElementById('kbQuery');
    if (query) {
      var run = function () {
        state.query = query.value;
        state.hits = state.query.trim() ? KB.search(state.query, 5) : null;
        var host = query.closest('.card');
        if (host) {
          var results = host.querySelector('.stack-list:last-of-type');
          if (results) {
            results.innerHTML = (state.hits || []).map(function (hit) {
              return row(UI.esc(hit.title), pill(String(hit.score), ''));
            }).join('') || '<p class="muted small">No passage matches that query.</p>';
          }
        }
      };
      query.addEventListener('input', UI.debounce(run, 220));
    }

    var diag = document.getElementById('dashDiag');
    if (diag) diag.addEventListener('click', function () {
      var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
      diag.disabled = true;
      Model.diagnose(model).then(function (result) {
        state.diag = result;
        diag.disabled = false;
        UI.toast('Diagnostics finished', { tone: 'ok' });
        refresh();
      }).catch(function () { diag.disabled = false; });
    });

    var clearMemory = document.getElementById('dashClearMemory');
    if (clearMemory) clearMemory.addEventListener('click', function () {
      Memory.clear();
      state.note = 'Memories cleared.';
      refresh();
    });

    var clearDocs = document.getElementById('dashClearDocs');
    if (clearDocs) clearDocs.addEventListener('click', function () {
      KB.clear();
      state.kbStats = KB.stats();
      state.note = 'Documents cleared.';
      refresh();
    });
  }

  window.JarvisDash = { screen: screen, mount: mount };
})();
