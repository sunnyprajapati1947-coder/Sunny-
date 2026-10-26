/* JARVIS — verified tool layer.
 *
 * The model may ask for an action; it may not perform one. Each tool declares
 * its arguments, whether a human must confirm it, and what a real result looks
 * like. Every call returns { ok, verified, evidence } and "ok" is only true
 * when the phone actually did the thing. Anything Android cannot verify is
 * reported as unverified instead of being dressed up as success.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var DB = window.JarvisDB;
  var N = null;

  function nativePlugins() {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    return { tools: plugins.JarvisTools || null, native: plugins.JarvisNative || null };
  }

  function call(name, args) {
    var plugins = nativePlugins();
    if (!plugins.tools) {
      return Promise.reject(new Error('Android tools are only available inside the installed app.'));
    }
    if (typeof plugins.tools[name] !== 'function') {
      return Promise.reject(new Error('this build does not expose ' + name));
    }
    return Promise.resolve(plugins.tools[name](args || {}));
  }

  function callNative(name, args) {
    var plugins = nativePlugins();
    if (!plugins.native || typeof plugins.native[name] !== 'function') {
      return Promise.reject(new Error('that action needs the installed app'));
    }
    return Promise.resolve(plugins.native[name](args || {}));
  }

  /* --------------------------------------------------------------- confirm */

  function confirmSheet(title, body, danger) {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'confirm-host';
      host.innerHTML = '<div class="confirm-back" data-cancel="1"></div>' +
        '<div class="confirm-panel" role="dialog" aria-modal="true" aria-label="' + UI.esc(title) + '">' +
        '<h2>' + UI.esc(title) + '</h2>' +
        '<p>' + UI.esc(body) + '</p>' +
        '<div class="confirm-actions">' +
        '<button class="btn btn-ghost" data-cancel="1">Cancel</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-allow="1">Allow</button>' +
        '</div></div>';
      document.body.appendChild(host);
      function done(value) {
        host.remove();
        resolve(value);
      }
      host.addEventListener('click', function (event) {
        if (event.target.closest('[data-allow]')) done(true);
        else if (event.target.closest('[data-cancel]')) done(false);
      });
    });
  }

  var styleInjected = false;

  function ensureStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var style = document.createElement('style');
    style.textContent = [
      '.confirm-host{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px}',
      '.confirm-back{position:absolute;inset:0;background:rgba(4,6,12,.72);backdrop-filter:blur(3px)}',
      '.confirm-panel{position:relative;width:100%;max-width:420px;background:var(--card,#111624);',
      'border:1px solid var(--line,#28304a);border-radius:18px;padding:20px;color:var(--text,#eef2ff);',
      'box-shadow:0 24px 60px rgba(0,0,0,.55)}',
      '.confirm-panel h2{font-size:18px;margin:0 0 8px}',
      '.confirm-panel p{margin:0 0 16px;color:var(--muted,#a9b3c9);line-height:1.5;white-space:pre-wrap}',
      '.confirm-actions{display:flex;gap:10px;justify-content:flex-end}'
    ].join('');
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------ definitions */

  var TOOLS = [
    {
      name: 'device_stats',
      summary: 'Battery, RAM, free storage and uptime of this phone.',
      args: {},
      run: function () {
        return call('deviceStats').then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: data.availRamMb + ' MB RAM free of ' + data.totalRamMb + ' MB, ' +
              data.freeStorageMb + ' MB storage free, battery ' + data.batteryPct + '%, ' +
              data.cores + ' cores',
            data: data
          };
        });
      }
    },
    {
      name: 'list_apps',
      summary: 'List the apps installed on this phone.',
      args: { query: 'text' },
      run: function (args) {
        return call('listApps', { query: args.query || '' }).then(function (data) {
          var apps = (data.apps || []).map(function (row) { return row.label; });
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: apps.length ? apps.slice(0, 20).join(', ') : 'no matching app',
            data: data
          };
        });
      }
    },
    {
      name: 'open_app',
      summary: 'Open an installed app by name.',
      args: { app: 'text' },
      confirm: true,
      run: function (args) {
        return call('launchApp', { label: args.app || '' }).then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: data.ok ? 'asked Android to open ' + (args.app || data.package) : 'could not open ' + (args.app || ''),
            data: data
          };
        });
      }
    },
    {
      name: 'write_note',
      summary: 'Save a note inside JARVIS storage and read it back.',
      args: { name: 'text', text: 'text' },
      run: function (args) {
        return call('writeNote', { name: args.name || '', text: args.text || '' }).then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: data.ok ? 'note ' + data.name + ' saved (' + data.bytes + ' bytes, checksum verified)' : 'the note was not written',
            data: data
          };
        });
      }
    },
    {
      name: 'list_notes',
      summary: 'List the notes saved in this app.',
      args: {},
      run: function () {
        return call('listNotes').then(function (data) {
          var names = (data.notes || []).map(function (row) { return row.name; });
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: names.length ? names.join(', ') : 'no notes yet',
            data: data
          };
        });
      }
    },
    {
      name: 'read_note',
      summary: 'Read one saved note.',
      args: { name: 'text' },
      run: function (args) {
        return call('readNote', { name: args.name || '' }).then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.ok ? 'the note was read from app storage' : (data.evidence || ''),
            text: data.ok ? String(data.text || '').slice(0, 800) : 'no such note',
            data: { name: data.name, bytes: data.bytes }
          };
        });
      }
    },
    {
      name: 'add_calendar_event',
      summary: 'Create a calendar event and confirm it exists.',
      args: { title: 'text', minutes: 'number' },
      confirm: true,
      run: function (args) {
        var start = Date.now() + Math.max(1, Number(args.minutes) || 30) * 60000;
        return call('addCalendarEvent', {
          title: args.title || 'JARVIS event',
          start: start,
          minutes: Number(args.length) || 30
        }).then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: data.ok ? 'event "' + data.title + '" is in the calendar (id ' + data.id + ')' : 'the calendar refused the event',
            data: data
          };
        });
      }
    },
    {
      name: 'set_reminder',
      summary: 'Open the clock with a reminder set.',
      args: { text: 'text', minutes: 'number' },
      confirm: true,
      run: function (args) {
        return call('setReminder', { text: args.text || 'Reminder', minutes: Number(args.minutes) || 10 })
          .then(function (data) {
            return {
              ok: !!data.ok,
              verified: !!data.verified,
              evidence: data.evidence || '',
              text: data.ok ? 'the clock was opened with the alarm — confirm it there' : 'no clock app accepted the alarm',
              data: data
            };
          });
      }
    },
    {
      name: 'media_control',
      summary: 'Play, pause or skip the music that is playing.',
      args: { action: 'text' },
      run: function (args) {
        var action = ['playpause', 'next', 'previous', 'stop'].indexOf(args.action) >= 0 ? args.action : 'playpause';
        return call('mediaControl', { action: action }).then(function (data) {
          return {
            ok: !!data.ok,
            verified: !!data.verified,
            evidence: data.evidence || '',
            text: 'music is ' + (data.playing ? 'playing' : 'not playing') + ' after the ' + action + ' key',
            data: data
          };
        });
      }
    },
    {
      name: 'notify',
      summary: 'Post a notification on this phone.',
      args: { title: 'text', body: 'text' },
      run: function (args) {
        return callNative('notify', { title: args.title || 'JARVIS', body: args.body || '' }).then(function () {
          return { ok: true, verified: false, text: 'notification posted (Android does not report back whether it was shown)', evidence: 'the notification call returned without an error' };
        });
      }
    },
    {
      name: 'share_text',
      summary: 'Send text to another app through the Android share sheet.',
      args: { text: 'text' },
      confirm: true,
      run: function (args) {
        return callNative('share', { text: args.text || '' }).then(function () {
          return { ok: true, verified: false, text: 'the share sheet was opened', evidence: 'Android opened the chooser; the other app decides what happens next' };
        });
      }
    },
    {
      name: 'open_url',
      summary: 'Open a web link in the browser.',
      args: { url: 'text' },
      confirm: true,
      run: function (args) {
        var url = String(args.url || '').trim();
        if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(url)) {
          return Promise.resolve({ ok: false, verified: true, text: 'only https links can be opened', evidence: 'the link failed validation' });
        }
        return callNative('openUrl', { url: url }).then(function () {
          return { ok: true, verified: false, text: 'the browser was asked to open the link', evidence: 'the intent was dispatched to the browser' };
        });
      }
    },
    {
      name: 'search_knowledge',
      summary: 'Search the documents and notes stored on this phone.',
      args: { query: 'text' },
      run: function (args) {
        if (!window.JarvisKB) return Promise.resolve({ ok: false, verified: true, text: 'the knowledge base did not load', evidence: '' });
        var hits = window.JarvisKB.search(args.query || '', 4);
        return Promise.resolve({
          ok: true,
          verified: true,
          text: hits.length ? hits.map(function (hit) { return hit.title + ': ' + String(hit.text).slice(0, 160); }).join('\n') : 'nothing in the local documents matches',
          evidence: hits.length + ' passages scored in the local index',
          data: { hits: hits }
        });
      }
    },
    {
      name: 'remember',
      summary: 'Store a durable fact about the owner.',
      args: { text: 'text' },
      run: function (args) {
        var entry = window.JarvisMemory.add(args.text || '');
        return Promise.resolve(entry.ok === false
          ? { ok: false, verified: true, text: entry.error, evidence: 'the memory guard refused the text' }
          : { ok: true, verified: true, text: 'remembered: ' + entry.text, evidence: 'the row was written to the local database' });
      }
    },
    {
      name: 'phone_capabilities',
      summary: 'What this phone allows JARVIS to do right now.',
      args: {},
      run: function () {
        return permissions().then(function (state) {
          var lines = Object.keys(state).filter(function (key) { return typeof state[key] === 'boolean'; })
            .map(function (key) { return key + ': ' + (state[key] ? 'allowed' : 'not allowed'); });
          return {
            ok: true,
            verified: true,
            text: lines.join(', '),
            evidence: 'read from the Android permission manager',
            data: state
          };
        });
      }
    }
  ];

  function map() {
    var out = {};
    TOOLS.forEach(function (tool) { out[tool.name] = tool; });
    return out;
  }

  function list() {
    return TOOLS.map(function (tool) {
      return { name: tool.name, summary: tool.summary, args: tool.args, confirm: !!tool.confirm };
    });
  }

  function get(name) {
    return map()[String(name || '').toLowerCase()] || null;
  }

  function validate(name, args) {
    var tool = get(name);
    if (!tool) return { ok: false, error: 'unknown tool: ' + name };
    var input = args && typeof args === 'object' ? args : {};
    var clean = {};
    var schema = tool.args || {};
    var keys = Object.keys(schema);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = input[key];
      if (value == null || value === '') {
        return { ok: false, error: tool.name + ' needs "' + key + '"' };
      }
      var text = String(value).replace(/\s+/g, ' ').trim();
      if (text.length > 2000) text = text.slice(0, 2000);
      clean[key] = schema[key] === 'number' ? Number(text) || 0 : text;
    }
    Object.keys(input).forEach(function (key) {
      if (!(key in clean) && schema[key] === undefined) return;
    });
    return { ok: true, args: clean, tool: tool };
  }

  function permissions() {
    var plugins = nativePlugins();
    if (!plugins.tools) {
      return Promise.resolve({ native: false });
    }
    return call('permissions').then(function (data) {
      return Object.assign({ native: true }, (data && data.permissions) || {});
    }).catch(function () {
      return { native: false, error: 'permission state unavailable' };
    });
  }

  function requestPermission(name) {
    return call('requestPermission', { name: name }).then(function (data) {
      return (data && data.permissions) || {};
    });
  }

  var history = [];

  function remember(entry) {
    history.unshift(entry);
    history = history.slice(0, 40);
    if (DB) {
      try {
        DB.insert('history', {
          kind: 'tool',
          title: entry.name,
          body: (entry.text || '').slice(0, 400),
          created: Date.now()
        });
      } catch (error) { /* history is best effort */ }
    }
  }

  function run(name, args, options) {
    options = options || {};
    var checked = validate(name, args);
    if (!checked.ok) {
      return Promise.resolve({ ok: false, verified: true, text: checked.error, evidence: 'arguments failed validation', tool: name });
    }
    var tool = checked.tool;
    var finish = function (result) {
      var row = {
        name: tool.name,
        ok: !!result.ok,
        verified: !!result.verified,
        text: result.text || '',
        evidence: result.evidence || '',
        at: Date.now()
      };
      remember(row);
      return Object.assign({ tool: tool.name }, result);
    };

    var gate = Promise.resolve(true);
    if (tool.confirm && !options.confirmed) {
      ensureStyle();
      gate = confirmSheet('Allow ' + tool.name.replace(/_/g, ' ') + '?',
        (tool.summary || '') + '\n\n' + Object.keys(checked.args).map(function (key) {
          return key + ': ' + checked.args[key];
        }).join('\n'),
        tool.name === 'open_url' || tool.name === 'share_text');
    }

    return gate.then(function (allowed) {
      if (!allowed) {
        return finish({ ok: false, verified: true, text: 'the owner declined this action', evidence: 'no Android call was made' });
      }
      return tool.run(checked.args).then(finish).catch(function (error) {
        return finish({
          ok: false,
          verified: true,
          text: String((error && error.message) || error).slice(0, 240),
          evidence: 'the native call failed'
        });
      });
    });
  }

  function recent() {
    if (history.length) return history.slice();
    if (!DB) return [];
    return DB.all('history').filter(function (row) { return row.kind === 'tool'; })
      .sort(function (a, b) { return Number(b.created) - Number(a.created); })
      .slice(0, 20)
      .map(function (row) {
        return { name: row.title, text: row.body, at: Number(row.created), ok: true, verified: true };
      });
  }

  function promptLines() {
    return TOOLS.map(function (tool) {
      var args = Object.keys(tool.args || {});
      return tool.name + (args.length ? ' {' + args.join(', ') + '}' : '') + ' — ' + tool.summary;
    }).join('\n');
  }

  /* A deterministic router for the small set of commands that must never
     depend on the model guessing correctly. */
  function routeCommand(text) {
    var raw = String(text || '').trim();
    var lower = raw.toLowerCase();
    if (!lower) return null;
    var rules = [
      { re: /^(check|what('| i)?s|show|tell me)?\s*(my |the )?battery( level| status| percentage)?\??$/, tool: 'device_stats', args: {} },
      { re: /^(how much|show|check)?\s*(ram|memory|storage|space)( is)?( free| left| available)?\??$/, tool: 'device_stats', args: {} },
      { re: /^(list|show)( me)?( my)? apps$/, tool: 'list_apps', args: {} },
      { re: /^open (?:the )?(?:app )?(.+)$/, tool: 'open_app', args: function (m) { return { app: m[1] }; } },
      { re: /^(?:search|find)(?: my)? (?:documents|notes|knowledge) (?:for )?(.+)$/, tool: 'search_knowledge', args: function (m) { return { query: m[1] }; } },
      { re: /^remind me(?: to)? (.+?) in (\d+) ?(minute|minutes|hour|hours)$/, tool: 'set_reminder', args: function (m) {
        var minutes = Number(m[2]) * (/hour/i.test(m[3]) ? 60 : 1);
        return { text: m[1], minutes: minutes };
      } },
      { re: /^(?:save|write) (?:a )?note(?: (?:called|named) (.+?))?(?::| that says| saying)? (.+)$/, tool: 'write_note', args: function (m) {
        return { name: m[1] || 'note-' + new Date().toISOString().slice(0, 10), text: m[2] };
      } },
      { re: /^(?:remember|note) that (.+)$/, tool: 'remember', args: function (m) { return { text: m[1] }; } },
      { re: /^(?:what can|which) (?:you|jarvis) do\??$/, tool: 'phone_capabilities', args: {} }
    ];
    for (var i = 0; i < rules.length; i += 1) {
      var match = raw.match(rules[i].re);
      if (!match) continue;
      // "open the door" must not be treated as an app name; require a short tail.
      if (rules[i].tool === 'open_app' && match[1].length > 40) return null;
      return { tool: rules[i].tool, args: typeof rules[i].args === 'function' ? rules[i].args(match) : rules[i].args };
    }
    return null;
  }

  window.JarvisTools = {
    list: list,
    get: get,
    validate: validate,
    run: run,
    permissions: permissions,
    requestPermission: requestPermission,
    recent: recent,
    promptLines: promptLines,
    confirmSheet: confirmSheet,
    routeCommand: routeCommand
  };
})();
