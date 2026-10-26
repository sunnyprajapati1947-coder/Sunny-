/* JARVIS — verified phone tools.
 *
 * One registry, one argument validator and one result shape for every action:
 *   { ok, tool, verified, evidence, data }
 *
 * `ok` is only true when the action actually ran. `verified` says whether the
 * result could be confirmed (a read-back, a provider query, a broadcast) or is
 * merely a request Android accepted (opening another app, showing a
 * notification). High-impact actions ask the user first.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var N = window.JarvisNative;
  var KB = window.JarvisKB;
  var Memory = window.JarvisMemory;
  var DB = window.JarvisDB;

  var HISTORY_KEY = 'tools.history';

  /* ------------------------------------------------------------- schemas */

  var TOOLS = [
    {
      name: 'device_stats',
      title: 'Phone status',
      hint: 'battery, memory, storage, cores',
      schema: {},
      confirm: false,
      call: function () {
        return native('deviceStats').then(function (data) {
          return {
            ok: true,
            verified: true,
            evidence: 'read from Android memory, storage and battery APIs',
            data: data
          };
        });
      }
    },
    {
      name: 'phone_capabilities',
      title: 'What can this phone do?',
      hint: 'reports which action bridges and permissions are available',
      schema: {},
      confirm: false,
      call: function () {
        return Promise.all([
          native('deviceStats').catch(function () { return null; }),
          native('permissions').catch(function () { return null; })
        ]).then(function (out) {
          var stats = out[0];
          var perms = out[1];
          var data = {
            native: !!stats,
            device: (stats && stats.device) || '',
            sdk: stats ? stats.sdk : 0,
            permissions: (perms && perms.permissions) || {},
            modelReady: !!(window.JarvisLocalBrain && window.JarvisLocalBrain.isReady()),
            documents: window.JarvisKB ? window.JarvisKB.stats().passages : 0
          };
          return {
            ok: true,
            verified: !!stats,
            evidence: stats ? 'read from the native bridge and Android permission state'
              : 'the native bridge is not available in a browser',
            data: data
          };
        });
      }
    },
    {
      name: 'list_apps',
      title: 'List apps',
      hint: 'installed apps that can be opened',
      schema: { query: 'string?' },
      confirm: false,
      call: function (args) {
        return native('listApps', { query: args.query || '' }).then(function (data) {
          return { ok: true, verified: true, data: data, evidence: 'PackageManager returned ' + ((data && data.apps || []).length) + ' apps' };
        });
      }
    },
    {
      name: 'open_app',
      title: 'Open an app',
      hint: 'launches an installed app by name',
      schema: { app: 'string' },
      confirm: true,
      call: function (args) {
        return native('launchApp', { app: args.app }).then(function (data) {
          if (!data || data.ok === false) {
            return { ok: false, verified: true, evidence: (data && data.evidence) || 'no matching app', data: data };
          }
          return {
            ok: true,
            verified: !!data.verified,
            evidence: data.evidence || 'launch intent handed to Android',
            data: data
          };
        });
      }
    },
    {
      name: 'write_note',
      title: 'Save a note',
      hint: 'writes a text file in the app folder, then reads it back',
      schema: { name: 'string', text: 'string' },
      confirm: false,
      call: function (args) {
        return native('writeNote', { name: args.name, text: args.text }).then(function (data) {
          return {
            ok: !!(data && data.ok),
            verified: !!(data && data.verified),
            evidence: (data && data.evidence) || 'file written',
            data: data
          };
        });
      }
    },
    {
      name: 'read_note',
      title: 'Read a note',
      hint: 'reads a note that was saved earlier',
      schema: { name: 'string' },
      confirm: false,
      call: function (args) {
        return native('readNote', { name: args.name }).then(function (data) {
          return { ok: !!(data && data.ok), verified: true, evidence: (data && data.evidence) || 'read back from storage', data: data };
        });
      }
    },
    {
      name: 'list_notes',
      title: 'List notes',
      hint: 'notes saved in the app folder',
      schema: {},
      confirm: false,
      call: function () {
        return native('listNotes').then(function (data) {
          return { ok: !!(data && data.ok), verified: true, evidence: 'directory listing', data: data };
        });
      }
    },
    {
      name: 'add_calendar_event',
      title: 'Add a calendar event',
      hint: 'writes to the phone calendar and reads it back',
      schema: { title: 'string', minutes: 'number?' },
      confirm: true,
      call: function (args) {
        return native('addCalendarEvent', {
          title: args.title,
          minutes: typeof args.minutes === 'number' ? args.minutes : 60
        }).then(function (data) {
          return {
            ok: !!(data && data.ok),
            verified: !!(data && data.verified),
            evidence: (data && data.evidence) || 'calendar insert',
            data: data
          };
        });
      }
    },
    {
      name: 'set_reminder',
      title: 'Set a reminder',
      hint: 'opens the clock app with the reminder filled in',
      schema: { text: 'string', minutes: 'number?' },
      confirm: true,
      call: function (args) {
        return native('setReminder', {
          text: args.text,
          minutes: typeof args.minutes === 'number' ? args.minutes : 10
        }).then(function (data) {
          return {
            ok: !!(data && data.ok),
            verified: !!(data && data.verified),
            evidence: (data && data.evidence) || 'alarm intent handed to Android',
            data: data
          };
        });
      }
    },
    {
      name: 'notify',
      title: 'Post a notification',
      hint: 'shows a notification right now',
      schema: { title: 'string', body: 'string?' },
      confirm: false,
      call: function (args) {
        return native('notify', { title: args.title, body: args.body || '' }).then(function (data) {
          return { ok: !!(data && data.ok !== false), verified: false, evidence: 'notification posted; Android does not report delivery', data: data };
        });
      }
    },
    {
      name: 'share_text',
      title: 'Share text',
      hint: 'opens the Android share sheet',
      schema: { text: 'string' },
      confirm: true,
      call: function (args) {
        return native('share', { text: args.text, url: '' }).then(function (data) {
          return { ok: !!(data && data.ok !== false), verified: false, evidence: 'share sheet opened; the app you pick handles it', data: data };
        });
      }
    },
    {
      name: 'open_url',
      title: 'Open a link',
      hint: 'opens an https link in the browser',
      schema: { url: 'string' },
      confirm: true,
      call: function (args) {
        var url = String(args.url || '');
        if (!/^https:\/\//i.test(url)) {
          return Promise.resolve({ ok: false, verified: true, evidence: 'refused: only https links are opened', data: null });
        }
        return native('openUrl', { url: url }).then(function (data) {
          return { ok: !!(data && data.ok !== false), verified: false, evidence: 'browser intent dispatched', data: data };
        });
      }
    },
    {
      name: 'media_control',
      title: 'Control music',
      hint: 'play, pause, next, previous',
      schema: { action: 'string' },
      confirm: false,
      call: function (args) {
        var action = String(args.action || 'toggle').toLowerCase();
        return native('mediaControl', { action: action }).then(function (data) {
          return {
            ok: !!(data && data.ok !== false),
            verified: !!(data && data.verified),
            evidence: (data && data.evidence) || 'media key event',
            data: data
          };
        });
      }
    },
    {
      name: 'search_documents',
      title: 'Search my documents',
      hint: 'local search over documents you indexed',
      schema: { query: 'string' },
      confirm: false,
      call: function (args) {
        var hits = KB.search(args.query, 5);
        return Promise.resolve({
          ok: true,
          verified: true,
          evidence: hits.length + ' passage(s) matched locally',
          data: hits
        });
      }
    },
    {
      name: 'remember',
      title: 'Remember something',
      hint: 'stores a fact in on-device memory',
      schema: { text: 'string' },
      confirm: false,
      call: function (args) {
        var entry = Memory.add(args.text, { kind: 'tool' });
        if (!entry || entry.ok === false) {
          return Promise.resolve({ ok: false, verified: true, evidence: (entry && entry.error) || 'memory refused', data: null });
        }
        var back = Memory.list().filter(function (row) { return row.id === entry.id; })[0];
        return Promise.resolve({
          ok: !!back,
          verified: !!back,
          evidence: back ? 'read back from the memory store' : 'not visible after the write',
          data: entry
        });
      }
    }
  ];

  /* --------------------------------------------------------------- native */

  function plugins() {
    try {
      return (window.Capacitor && window.Capacitor.Plugins) || {};
    } catch (error) {
      return {};
    }
  }

  function bridge(method) {
    var all = plugins();
    var candidates = [all.JarvisTools, all.JarvisNative];
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] && typeof candidates[i][method] === 'function') return candidates[i];
    }
    return null;
  }

  function native(method, args) {
    var target = bridge(method);
    if (!target) {
      return Promise.reject(new Error('This action needs the installed Android app (' + method + ').'));
    }
    return Promise.resolve(target[method](args || {})).catch(function (error) {
      throw new Error((error && error.message) || (method + ' failed'));
    });
  }

  function nativeReady() {
    return !!bridge('deviceStats');
  }

  /* ----------------------------------------------------------- validation */

  function coerce(value, type) {
    var optional = /\?$/.test(type);
    var base = type.replace(/\?$/, '');
    if (value == null || value === '') {
      if (optional) return { ok: true, value: undefined };
      return { ok: false, error: 'missing value' };
    }
    if (base === 'string') return { ok: true, value: String(value) };
    if (base === 'number') {
      var num = Number(value);
      if (!isFinite(num)) return { ok: false, error: 'not a number' };
      return { ok: true, value: num };
    }
    if (base === 'boolean') return { ok: true, value: !!value };
    return { ok: true, value: value };
  }

  function validate(name, args) {
    var tool = byName(name);
    if (!tool) return { ok: false, error: 'Unknown tool: ' + name };
    var input = args && typeof args === 'object' ? args : {};
    var out = {};
    var keys = Object.keys(tool.schema || {});
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var result = coerce(input[key], tool.schema[key]);
      if (!result.ok) return { ok: false, error: 'Tool ' + name + ' needs "' + key + '" (' + tool.schema[key] + ')' };
      if (result.value !== undefined) out[key] = result.value;
    }
    var unknown = Object.keys(input).filter(function (key) { return keys.indexOf(key) === -1; });
    return { ok: true, args: out, ignored: unknown };
  }

  function byName(name) {
    var wanted = String(name || '');
    return TOOLS.filter(function (tool) { return tool.name === wanted; })[0] || null;
  }

  /* --------------------------------------------------------------- history */

  function history() {
    var rows = [];
    try { rows = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]') || []; } catch (error) { rows = []; }
    return Array.isArray(rows) ? rows : [];
  }

  function record(entry) {
    var rows = history();
    rows.unshift(entry);
    rows = rows.slice(0, 40);
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(rows)); } catch (error) { /* ignore */ }
    if (DB && DB.available) {
      try {
        DB.insert('history', {
          id: DB.uid('h'),
          kind: 'tool',
          title: entry.tool,
          body: (entry.ok ? 'ok' : 'failed') + (entry.verified ? ' · verified' : ' · unverified') + ' — ' + entry.evidence,
          created: new Date().toISOString()
        });
      } catch (error) { /* history is best-effort */ }
    }
    return entry;
  }

  /* ----------------------------------------------------------- confirmation */

  function confirmSheet(tool, args) {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'jconfirm-host';
      host.innerHTML =
        '<div class="jconfirm-backdrop"></div>' +
        '<div class="jconfirm" role="dialog" aria-modal="true" aria-label="Allow ' + UI.esc(tool.title) + '">' +
          '<h3>Allow ' + UI.esc(tool.title) + '?</h3>' +
          '<p class="small muted">' + UI.esc(tool.hint) + '</p>' +
          '<pre class="jconfirm-args">' + UI.esc(JSON.stringify(args || {}, null, 2)) + '</pre>' +
          '<div class="jconfirm-actions">' +
            '<button class="btn btn-ghost" data-answer="no">Cancel</button>' +
            '<button class="btn btn-primary" data-answer="yes">Allow</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(host);
      requestAnimationFrame(function () { host.classList.add('is-open'); });
      function close(answer) {
        host.classList.remove('is-open');
        setTimeout(function () { host.remove(); }, 180);
        resolve(answer);
      }
      host.addEventListener('click', function (event) {
        var button = event.target.closest('[data-answer]');
        if (button) close(button.getAttribute('data-answer') === 'yes');
        else if (event.target.classList.contains('jconfirm-backdrop')) close(false);
      });
    });
  }

  /* ------------------------------------------------------------------- run */

  function fail(name, evidence, extra) {
    var out = {
      tool: name,
      ok: false,
      verified: true,
      evidence: evidence,
      text: evidence,
      data: null,
      ms: 0
    };
    if (extra) Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function run(name, args, options) {
    options = options || {};
    var tool = byName(name);
    if (!tool) return Promise.resolve(fail(name, 'There is no such action on this phone.'));
    var checked = validate(name, args);
    if (!checked.ok) return Promise.resolve(fail(name, checked.error));
    if (!nativeReady() && tool.name !== 'search_documents' && tool.name !== 'remember' && tool.name !== 'phone_capabilities') {
      return Promise.resolve(fail(name, 'This action needs the installed Android app; the browser build cannot touch the phone.'));
    }

    var start = Date.now();
    var go = tool.confirm && !options.confirmed
      ? confirmSheet(tool, checked.args).then(function (yes) {
          if (!yes) {
            return { ok: false, cancelled: true, tool: name, verified: true, evidence: 'You cancelled it, so nothing was done.', data: null };
          }
          return tool.call(checked.args);
        })
      : Promise.resolve().then(function () { return tool.call(checked.args); });

    return go.then(function (result) {
      var out = {
        tool: name,
        ok: !!result.ok,
        verified: !!result.verified,
        evidence: result.evidence || (result.ok ? 'done' : 'failed'),
        data: result.data == null ? null : result.data,
        ms: Date.now() - start
      };
      out.text = out.ok ? summarize(name, out) : (out.evidence || 'The action did not run.');
      if (result.cancelled) out.cancelled = true;
      return record(out);
    }).catch(function (error) {
      return record({
        tool: name,
        ok: false,
        verified: true,
        evidence: String((error && error.message) || error),
        data: null,
        ms: Date.now() - start
      });
    });
  }


  /* A short, factual sentence for the chat bubble. It never says more than the
     tool actually established. */
  function summarize(name, result) {
    var data = result.data || {};
    if (!result.ok) return '';
    if (name === 'device_stats') {
      return 'Battery ' + (data.batteryPct == null ? '?' : data.batteryPct) + '%, ' +
        Math.round((data.availMb || 0) / 101.3) / 10 + ' GB RAM free of ' +
        Math.round((data.totalMb || 0) / 101.3) / 10 + ' GB, ' +
        Math.round((data.freeStorageMb || 0) / 101.3) / 10 + ' GB storage free, ' +
        (data.cores || '?') + ' cores, Android ' + (data.android || '?') + '.';
    }
    if (name === 'phone_capabilities') {
      var permsOn = Object.keys(data.permissions || {}).filter(function (key) { return data.permissions[key]; });
      return (data.native ? ('Installed app on ' + (data.device || 'this phone') + ' (SDK ' + data.sdk + '). ') : 'Browser build: phone actions are unavailable. ') +
        'Permissions on: ' + (permsOn.length ? permsOn.join(', ') : 'none yet') + '. ' +
        (data.modelReady ? 'On-device brain loaded.' : 'On-device brain not loaded yet.') + ' ' +
        data.documents + ' indexed passage(s).';
    }
    if (name === 'list_apps') {
      var apps = data.apps || [];
      return apps.length + ' app(s) available' + (apps.length ? ': ' + apps.slice(0, 12).map(function (a) { return a.label || a.package; }).join(', ') + (apps.length > 12 ? '…' : '') : '.');
    }
    if (name === 'open_app') return 'Asked Android to open ' + (data.app || data.package || 'the app') + '.';
    if (name === 'write_note') return 'Saved "' + (data.name || '') + '" and read it back (' + (data.bytes || 0) + ' bytes).';
    if (name === 'read_note') return '"' + (data.name || '') + '": ' + String(data.text || '').slice(0, 400);
    if (name === 'list_notes') return (data.notes || []).length + ' note(s): ' + (data.notes || []).join(', ');
    if (name === 'add_calendar_event') return 'Event "' + (data.title || '') + '" saved' + (data.when ? ' for ' + data.when : '') + '.';
    if (name === 'set_reminder') return 'Reminder handoff to the clock app for "' + (data.text || '') + '".';
    if (name === 'notify') return 'Notification posted.';
    if (name === 'share_text') return 'Share sheet opened.';
    if (name === 'open_url') return 'Link opened.';
    if (name === 'media_control') return 'Media action sent: ' + (data.action || '');
    if (name === 'search_documents') {
      var hits = data || [];
      if (!hits.length) return 'No passage in your documents matches that.';
      return hits.map(function (hit, index) {
        return (index + 1) + '. ' + hit.title + (hit.part ? ' (' + hit.part + ')' : '') + ' — ' + hit.snippet.slice(0, 160);
      }).join('\n');
    }
    if (name === 'remember') return 'Saved to memory: ' + (data.text || '');
    return '';
  }

  /* Deterministic routing for the phrases people actually type, so the phone
     actions work even before the model is downloaded. */
  function routeCommand(text) {
    var raw = String(text || '').trim();
    var value = raw.toLowerCase();
    if (!value) return null;
    if (/^(hi|hello|hey|namaste)\b/.test(value)) return null;
    if (/(battery|ram|storage|memory|phone status|device status|kitni battery|kitni ram)/.test(value)) {
      return { tool: 'device_stats', args: {} };
    }
    var open = raw.match(/^(?:open|launch)\s+(.+)$/i) || raw.match(/^khol(?:o|do)?\s+(.+)$/i);
    if (open) return { tool: 'open_app', args: { app: open[1].replace(/\s+(app|application)$/i, '').trim() } };
    var note = value.match(/^(?:save (?:a )?note|note (?:down )?|likho)\s*[:\-]?\s*(.+)$/);
    if (note) {
      return { tool: 'write_note', args: { name: 'note-' + new Date().toISOString().slice(0, 10), text: note[1] } };
    }
    var remind = value.match(/remind me (?:to )?(.+?)(?: in (\d+) ?(min|minutes|hour|hours|ghante))?$/);
    if (remind) {
      var minutes = 10;
      if (remind[2]) minutes = /hour|ghante/.test(remind[3] || '') ? Number(remind[2]) * 60 : Number(remind[2]);
      return { tool: 'set_reminder', args: { text: remind[1], minutes: minutes } };
    }
    var search = value.match(/^(?:search|find|dhundo)\s+(?:my )?(?:documents?|notes?|files?)\s+(?:for\s+)?(.+)$/);
    if (search) return { tool: 'search_documents', args: { query: search[1] } };
    var remember = value.match(/^(?:remember|yaad rakho)[:\s]+(.+)$/);
    if (remember) return { tool: 'remember', args: { text: remember[1] } };
    return null;
  }

  /* ------------------------------------------------------------ permissions */

  function permissions() {
    return native('permissions').catch(function (error) {
      return { native: false, error: error.message, permissions: {} };
    });
  }

  function request(name) {
    return native('requestPermission', { name: name });
  }

  /* --------------------------------------------------------- model prompt */

  function promptLines() {
    return TOOLS.map(function (tool) {
      var args = Object.keys(tool.schema || {}).map(function (key) {
        return key + ':' + tool.schema[key];
      }).join(', ');
      return '- ' + tool.name + '(' + args + ') — ' + tool.hint;
    }).join('\n');
  }

  window.JarvisTools = {
    list: function () { return TOOLS.slice(); },
    get: byName,
    validate: validate,
    run: run,
    confirmSheet: confirmSheet,
    history: history,
    permissions: permissions,
    requestPermission: request,
    promptLines: promptLines,
    routeCommand: routeCommand,
    summarize: summarize,
    nativeReady: nativeReady,
    clearHistory: function () {
      try { sessionStorage.removeItem(HISTORY_KEY); } catch (error) { /* ignore */ }
    }
  };
})();
