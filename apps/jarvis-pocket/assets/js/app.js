/* Jarvis Pocket — router, settings, memory, about and boot. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;
  var LLM = window.JarvisLLM;
  var Voice = window.JarvisVoice;
  var Memory = window.JarvisMemory;
  var Chat = window.JarvisChat;
  var Lib = window.JarvisLibrary;

  var TABS = [
    { id: 'chat', label: 'Chat', icon: 'chat', href: '#/' },
    { id: 'library', label: 'Library', icon: 'library', href: '#/library' },
    { id: 'tasks', label: 'Tasks', icon: 'clock', href: '#/tasks' },
    { id: 'memory', label: 'Memory', icon: 'brain', href: '#/memory' },
    { id: 'settings', label: 'Settings', icon: 'settings', href: '#/settings' }
  ];

  var bootError = null;

  function parseRoute() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var queryAt = raw.indexOf('?');
    var path = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
    var query = queryAt >= 0 ? raw.slice(queryAt + 1) : '';
    var params;
    try {
      params = new URLSearchParams(query);
    } catch (error) {
      params = { get: function () { return null; } };
    }
    return { path: path.replace(/\/+$/, '') || '/', params: params };
  }

  function activeTab(path) {
    if (path === '/library' || path.indexOf('/pack/') === 0 || path.indexOf('/item/') === 0 ||
      path.indexOf('/collection/') === 0 || path === '/saved' || path === '/search') return 'library';
    if (path === '/tasks') return 'tasks';
    if (path === '/connections' || path === '/video' || path === '/setup' || path === '/local' ||
      path === '/dash' || path === '/tools' || path === '/diag') return 'settings';
    if (path === '/memory') return 'memory';
    if (path === '/settings' || path === '/about') return 'settings';
    return 'chat';
  }

  function renderNav(path) {
    var host = document.getElementById('tabbar');
    if (!host) return;
    var current = activeTab(path);
    host.innerHTML = TABS.map(function (tab) {
      return '<a class="tab' + (tab.id === current ? ' is-on' : '') + '" href="' + tab.href + '" data-tab="' + tab.id + '">' +
        UI.icon(tab.icon) + '<span>' + tab.label + '</span></a>';
    }).join('');
  }

  function setChrome(path) {
    var brandSub = document.getElementById('brandSub');
    var stats = Pack.stats();
    if (brandSub) {
      brandSub.textContent = Pack.loaded()
        ? stats.items + ' items · ' + stats.packs + ' packs'
        : 'loading library…';
    }
    var topSearch = document.querySelector('[data-top="search"]');
    if (topSearch) topSearch.hidden = path === '/search';
    renderNav(path);
  }

  function skeleton() {
    return '<section class="screen"><div class="skeleton-lines"><span></span><span></span><span></span><span></span></div></section>';
  }

  function render() {
    var view = document.getElementById('view');
    if (!view) return;
    var route = parseRoute();
    var path = route.path;
    setChrome(path);

    if (!Pack.loaded()) {
      view.innerHTML = bootError
        ? '<section class="screen"><div class="empty-block">' + UI.icon('alert') +
          '<h3>The library could not load</h3><p>' + UI.esc(bootError) + '</p>' +
          '<button class="btn btn-primary" id="retryBoot">Retry</button></div></section>'
        : skeleton();
      var retry = document.getElementById('retryBoot');
      if (retry) {
        retry.addEventListener('click', function () {
          bootError = null;
          loadPack();
        });
      }
      return;
    }

    var html = '';
    try {
      if (path === '/') {
        html = Chat.screen();
      } else if (path === '/library') {
        html = Lib.libraryScreen();
      } else if (path === '/search') {
        html = Lib.searchScreen({ q: route.params.get('q') || '' });
      } else if (path === '/saved') {
        html = Lib.savedScreen();
      } else if (path.indexOf('/pack/') === 0) {
        html = Lib.packScreen(decodeURIComponent(path.slice(6)));
      } else if (path.indexOf('/item/') === 0) {
        html = Lib.itemScreen(decodeURIComponent(path.slice(6)));
      } else if (path.indexOf('/collection/') === 0) {
        html = Lib.collectionScreen(decodeURIComponent(path.slice(12)));
      } else if (path === '/tasks') {
        html = window.JarvisTasks.screen();
      } else if (path === '/connections') {
        html = window.JarvisConnections.screen();
      } else if (path === '/video') {
        html = window.JarvisVideo.screen();
      } else if (path === '/setup') {
        html = window.JarvisSetup.screen();
      } else if (path === '/local') {
        html = window.JarvisBrainUI.screen();
      } else if (path === '/dash' || path === '/tools' || path === '/diag') {
        html = window.JarvisDash.screen();
      } else if (path === '/code') {
        html = window.JarvisCode.screen();
      } else if (path.indexOf('/code/') === 0) {
        html = window.JarvisCode.screen(decodeURIComponent(path.slice(6)));
      } else if (path === '/memory') {
        html = memoryScreen();
      } else if (path === '/settings') {
        html = settingsScreen();
      } else if (path === '/about') {
        html = aboutScreen();
      } else {
        html = '<section class="screen"><div class="empty-block">' + UI.icon('alert') +
          '<h3>Page not found</h3><a class="btn btn-ghost" href="#/">Go home</a></div></section>';
      }
    } catch (error) {
      html = '<section class="screen"><div class="empty-block">' + UI.icon('alert') +
        '<h3>Something went wrong</h3><p>' + UI.esc(error.message) + '</p><a class="btn btn-ghost" href="#/">Home</a></div></section>';
    }

    view.innerHTML = html;

    try {
      if (path === '/') Chat.mount();
      else if (path === '/library') Lib.mountLibrary();
      else if (path === '/search') Lib.mountSearch({ q: route.params.get('q') || '' });
      else if (path.indexOf('/pack/') === 0) Lib.mountPack(decodeURIComponent(path.slice(6)));
      else if (path.indexOf('/item/') === 0) Lib.mountItem(decodeURIComponent(path.slice(6)));
      else if (path.indexOf('/collection/') === 0) Lib.mountCollection(decodeURIComponent(path.slice(12)));
      else if (path === '/tasks') window.JarvisTasks.mount();
      else if (path === '/connections') window.JarvisConnections.mount();
      else if (path === '/video') window.JarvisVideo.mount();
      else if (path === '/setup') window.JarvisSetup.mount();
      else if (path === '/local') window.JarvisBrainUI.mount();
      else if (path === '/dash' || path === '/tools' || path === '/diag') window.JarvisDash.mount();
      else if (path === '/code') window.JarvisCode.mount();
      else if (path.indexOf('/code/') === 0) window.JarvisCode.mount(decodeURIComponent(path.slice(6)));
      else if (path === '/memory') mountMemory();
      else if (path === '/settings') mountSettings();
      else if (path === '/about') mountAbout();
    } catch (error) {
      UI.toast('Screen error: ' + error.message, { tone: 'warn' });
    }

    if (path !== '/') window.scrollTo(0, 0);
    var main = document.getElementById('view');
    if (main && path !== '/') main.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- memory */

  function memoryScreen() {
    var rows = Memory.list().slice().reverse();
    return '' +
      '<section class="screen memory-screen">' +
        '<div class="screen-head"><h1>Memory</h1>' +
          '<p>Everything you write here is remembered in every chat — on this phone only.</p></div>' +
        '<form class="memory-form" id="memoryForm">' +
          '<textarea id="memoryInput" rows="2" placeholder="Remember: my name is Sunny and I build Android apps…"></textarea>' +
          '<button class="btn btn-primary" type="submit">' + UI.icon('plus') + 'Save</button>' +
        '</form>' +
        (rows.length
          ? '<div class="rows" id="memoryList">' + rows.map(function (row) {
            return '<div class="row row-static">' +
              '<span class="row-icon">' + UI.icon('brain') + '</span>' +
              '<span class="row-main"><strong>' + UI.esc(row.text) + '</strong>' +
              '<small>' + UI.relativeTime(row.ts) + '</small></span>' +
              '<button class="row-action" data-mem-del="' + row.id + '" aria-label="Forget">' + UI.icon('trash') + '</button>' +
            '</div>';
          }).join('') + '</div>' +
            '<button class="btn btn-ghost btn-block" id="memoryClear">' + UI.icon('trash') + 'Clear all memories</button>'
          : '<div class="empty-block">' + UI.icon('brain') + '<h3>Memory is empty</h3>' +
            '<p>Name, city, project, preferences — write anything. Jarvis will use it as context.</p></div>') +
      '</section>';
  }

  function mountMemory() {
    var form = document.getElementById('memoryForm');
    var input = document.getElementById('memoryInput');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = input ? input.value.trim() : '';
        if (!value) return;
        var saved = Memory.add(value);
        if (saved && saved.ok === false) UI.toast(saved.error, { tone: 'warn' });
        UI.toast('Saved to memory', { icon: 'check', tone: 'ok' });
        render();
      });
    }
    var list = document.getElementById('memoryList');
    if (list) {
      list.addEventListener('click', function (event) {
        var del = event.target.closest('[data-mem-del]');
        if (!del) return;
        Memory.remove(del.getAttribute('data-mem-del'));
        render();
      });
    }
    var clear = document.getElementById('memoryClear');
    if (clear) {
      clear.addEventListener('click', function () {
        Memory.clear();
        render();
        UI.toast('Memory cleared');
      });
    }
  }

  /* ----------------------------------------------------------- settings */

  function settingsScreen() {
    var config = LLM.settings();
    // Local only: there is no provider picker and no key field to render.

    return '' +
      '<section class="screen settings-screen">' +
        '<div class="screen-head"><h1>Settings</h1><p>Everything stays on this device — no account needed.</p></div>' +
        '<a class="card card-link" href="#/local"><div class="card-head"><h2>' +
          UI.icon('brain') + 'Local brain (Qwen3.5)</h2><span class="row-chev">' + UI.icon('chevron') + '</span></div>' +
          '<p class="muted small">' + ((window.JarvisLocalBrain && window.JarvisLocalBrain.isReady())
            ? 'Loaded — offline chat is ready.'
            : 'Run Qwen3.5 inside the phone — download once, then use it without internet.') + '</p></a>' +
        '<a class="card card-link" href="#/code"><div class="card-head"><h2>' +
          UI.icon('code') + 'Code studio</h2><span class="row-chev">' + UI.icon('chevron') + '</span></div>' +
          '<p class="muted small">Small web projects stored on this phone, run in a sandbox. No terminal.</p></a>' +
        '<a class="card card-link" href="#/setup"><div class="card-head"><h2>' +
          UI.icon('spark') + 'Setup wizard</h2><span class="row-chev">' + UI.icon('chevron') + '</span></div>' +
          '<p class="muted small">Notifications, updates, brain — the phone is ready in 2 minutes.</p></a>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('brain') + 'AI brain</h2>' +
            '<span class="pill ' + (LLM.isReady(config) ? 'pill-ok' : 'pill-warn') + '">' +
            (LLM.isReady(config) ? 'on device' : 'not loaded') + '</span></div>' +
          '<p class="muted small">JARVIS 1.0 is local only: no cloud model, no API key, no prompt ever leaves this phone. ' +
          'The brain is Qwen3.5 running through the ONNX engine inside the app.</p>' +
          '<div class="card-actions">' +
            '<a class="btn btn-primary" href="#/local">Model manager</a>' +
            '<a class="btn btn-ghost" href="#/dash">Dashboard &amp; permissions</a>' +
            '<a class="btn btn-ghost" href="#/code">Code</a>' +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('spark') + 'Assistant</h2></div>' +
          '<label class="field"><span>Name</span>' +
            '<input id="nameInput" type="text" value="' + UI.esc(config.assistantName) + '" maxlength="24">' +
          '</label>' +
          '<label class="field"><span>Reply language</span>' +
            '<select id="langSelect">' +
              option('auto', 'Auto (match my language)', config.replyLang) +
              option('hinglish', 'Hinglish', config.replyLang) +
              option('hindi', 'हिन्दी', config.replyLang) +
              option('english', 'English', config.replyLang) +
            '</select>' +
          '</label>' +
          '<label class="field"><span>Extra instructions (persona)</span>' +
            '<textarea id="personaInput" rows="3" placeholder="e.g. Give me short answers with code.">' + UI.esc(config.persona) + '</textarea>' +
          '</label>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('volume') + 'Voice</h2>' +
            '<span class="pill">' + (Voice.ttsSupported() ? 'TTS ready' : 'no TTS') + '</span></div>' +
          '<label class="switch"><input type="checkbox" id="speakToggle2" ' + (UI.storeGet('voice.speak', false) ? 'checked' : '') + '><span>Speak answers aloud</span></label>' +
          '<label class="field"><span>Voice</span><select id="voiceSelect"></select></label>' +
          '<label class="field"><span>Speed · <b id="rateValue">' + Number(UI.storeGet('voice.rate', 1)).toFixed(1) + '</b></span>' +
            '<input id="rateInput" type="range" min="0.7" max="1.5" step="0.1" value="' + Number(UI.storeGet('voice.rate', 1)) + '">' +
          '</label>' +
          '<label class="field"><span>Mic language</span>' +
            '<select id="micLang">' +
              option('', 'Auto (' + UI.esc(navigator.language || 'en-IN') + ')', UI.storeGet('voice.lang', '')) +
              option('en-IN', 'English (India)', UI.storeGet('voice.lang', '')) +
              option('hi-IN', 'हिन्दी (India)', UI.storeGet('voice.lang', '')) +
              option('en-US', 'English (US)', UI.storeGet('voice.lang', '')) +
              option('en-GB', 'English (UK)', UI.storeGet('voice.lang', '')) +
            '</select>' +
          '</label>' +
          '<label class="switch"><input type="checkbox" id="autoSend" ' + (UI.storeGet('voice.autoSend', true) ? 'checked' : '') + '><span>Auto-send after voice</span></label>' +
          '<button class="btn btn-ghost" id="testVoice">' + UI.icon('volume') + 'Test voice</button>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('download') + 'Offline library</h2>' +
          settingsScreenTail();
  }

  function option(value, label, current) {
    return '<option value="' + UI.esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + UI.esc(label) + '</option>';
  }

  /* settings screen is long; keep the rest in a second function for clarity */
  function settingsScreenTail() {
    var stats = Pack.stats();
    return '' +
          '</div>' +
          '<p class="muted small">' + stats.items + ' items · ' + UI.formatBytes(stats.bytes) + ' of markdown. The Save all tab lets you download them.</p>' +
          '<button class="btn btn-primary btn-block" id="saveAll">' + UI.icon('download') + 'Save all for offline</button>' +
          '<p class="muted small" id="storageNote">Storage: checking…</p>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('palette') + 'Appearance</h2></div>' +
          '<label class="field"><span>Theme</span>' +
            '<select id="themeSelect">' +
              option('system', 'System', UI.storeGet('theme', 'system')) +
              option('dark', 'Dark', UI.storeGet('theme', 'system')) +
              option('light', 'Light', UI.storeGet('theme', 'system')) +
            '</select>' +
          '</label>' +
          '<label class="field"><span>Text size</span>' +
            '<select id="sizeSelect">' +
              option('s', 'Small', UI.storeGet('textSize', 'm')) +
              option('m', 'Medium', UI.storeGet('textSize', 'm')) +
              option('l', 'Large', UI.storeGet('textSize', 'm')) +
              option('xl', 'Extra large', UI.storeGet('textSize', 'm')) +
            '</select>' +
          '</label>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><h2>' + UI.icon('download') + 'Data</h2></div>' +
          '<div class="card-actions">' +
            '<button class="btn btn-ghost" id="exportChats">' + UI.icon('share') + 'Export chats</button>' +
            '<button class="btn btn-ghost" id="clearChats">' + UI.icon('trash') + 'Clear chats</button>' +
            '<button class="btn btn-ghost" id="clearMemory">' + UI.icon('trash') + 'Clear memory</button>' +
            '<button class="btn btn-ghost btn-danger" id="resetAll">' + UI.icon('alert') + 'Reset app</button>' +
          '</div>' +
        '</section>' +

        '<a class="card card-link" href="#/connections">' +
          '<div class="card-head"><h2>' + UI.icon('bolt') + 'Connections — YouTube, social, device</h2>' + UI.icon('chevron') + '</div>' +
        '</a>' +
        '<a class="card card-link" href="#/saved">' +
          '<div class="card-head"><h2>' + UI.icon('bookmark') + 'Your shelf</h2>' + UI.icon('chevron') + '</div>' +
        '</a>' +
        '<a class="card card-link" href="#/about">' +
          '<div class="card-head"><h2>' + UI.icon('info') + 'About & packs</h2>' + UI.icon('chevron') + '</div>' +
        '</a>' +
        '<p class="muted center small">JARVIS · v' + ((window.JarvisNativeInfo && window.JarvisNativeInfo.version) || '1.0') + ' · made from 23 open-source repos</p>' +
      '</section>';
  }

  function mountSettings() {
    var config = LLM.settings();

    function saveField(patch, rerender) {
      LLM.save(patch);
      if (rerender) render();
    }

    var modelInput = document.getElementById('modelInput');
    if (modelInput) {
      modelInput.addEventListener('change', function () { saveField({ model: modelInput.value.trim() }); });
    }
    var baseInput = document.getElementById('baseInput');
    if (baseInput) {
      baseInput.addEventListener('change', function () { saveField({ base: baseInput.value.trim() }); });
    }
    var tempInput = document.getElementById('tempInput');
    if (tempInput) {
      tempInput.addEventListener('input', function () {
        var value = document.getElementById('tempValue');
        if (value) value.textContent = Number(tempInput.value).toFixed(1);
        LLM.save({ temperature: Number(tempInput.value) });
      });
    }
    var streamToggle = document.getElementById('streamToggle');
    if (streamToggle) {
      streamToggle.addEventListener('change', function () { LLM.save({ stream: streamToggle.checked }); });
    }
    var testKey = document.getElementById('testKey');
    if (testKey) {
      testKey.addEventListener('click', function () {
        var original = testKey.innerHTML;
        testKey.disabled = true;
        testKey.innerHTML = UI.icon('clock') + 'Testing…';
        LLM.testConnection().then(function (result) {
          testKey.disabled = false;
          testKey.innerHTML = original;
          if (result.ok) UI.toast('Connected — ' + LLM.settings().model, { tone: 'ok', icon: 'check' });
          else UI.toast(result.error, { tone: 'warn', icon: 'alert', ms: 5200 });
        });
      });
    }
    var clearKey = document.getElementById('clearKey');
    if (clearKey) {
      clearKey.addEventListener('click', function () {
        LLM.save({ key: '' });
        UI.toast('Key removed');
        render();
      });
    }
    var nameInput = document.getElementById('nameInput');
    if (nameInput) {
      nameInput.addEventListener('change', function () { saveField({ assistantName: nameInput.value.trim() || 'Jarvis' }); });
    }
    var langSelect = document.getElementById('langSelect');
    if (langSelect) {
      langSelect.addEventListener('change', function () { saveField({ replyLang: langSelect.value }); });
    }
    var personaInput = document.getElementById('personaInput');
    if (personaInput) {
      personaInput.addEventListener('change', function () { saveField({ persona: personaInput.value.trim() }); });
    }

    var speakToggle2 = document.getElementById('speakToggle2');
    if (speakToggle2) {
      speakToggle2.addEventListener('change', function () {
        UI.storeSet('voice.speak', speakToggle2.checked);
        if (!speakToggle2.checked) Voice.stopSpeaking();
      });
    }
    var voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
      var fillVoices = function () {
        var all = Voice.voices();
        var current = UI.storeGet('voice.uri', '');
        voiceSelect.innerHTML = '<option value="">Auto / system default</option>' + all.map(function (voice) {
          return '<option value="' + UI.esc(voice.voiceURI) + '"' + (voice.voiceURI === current ? ' selected' : '') + '>' +
            UI.esc(voice.name + ' · ' + (voice.lang || '')) + '</option>';
        }).join('');
      };
      fillVoices();
      setTimeout(fillVoices, 700);
      voiceSelect.addEventListener('change', function () {
        UI.storeSet('voice.uri', voiceSelect.value);
        Voice.speak('Hello, this is ' + LLM.settings().assistantName + ' mode. How are you?', { voiceURI: voiceSelect.value });
      });
    }
    var rateInput = document.getElementById('rateInput');
    if (rateInput) {
      rateInput.addEventListener('input', function () {
        var value = document.getElementById('rateValue');
        if (value) value.textContent = Number(rateInput.value).toFixed(1);
        UI.storeSet('voice.rate', Number(rateInput.value));
      });
    }
    var micLang = document.getElementById('micLang');
    if (micLang) {
      micLang.addEventListener('change', function () { UI.storeSet('voice.lang', micLang.value); });
    }
    var autoSend = document.getElementById('autoSend');
    if (autoSend) {
      autoSend.addEventListener('change', function () { UI.storeSet('voice.autoSend', autoSend.checked); });
    }
    var testVoice = document.getElementById('testVoice');
    if (testVoice) {
      testVoice.addEventListener('click', function () {
        Voice.speak('Hello! I am ' + LLM.settings().assistantName + ', your phone assistant.', {
          voiceURI: UI.storeGet('voice.uri', ''),
          rate: Number(UI.storeGet('voice.rate', 1))
        });
      });
    }

    var saveAll = document.getElementById('saveAll');
    if (saveAll) {
      saveAll.addEventListener('click', function () {
        if (saveAll.disabled) return;
        saveAll.disabled = true;
        saveAll.innerHTML = UI.icon('download') + 'Saving…';
        Pack.saveAll(function (done, total) {
          saveAll.innerHTML = UI.icon('download') + 'Saving ' + done + '/' + total;
        }).then(function (result) {
          saveAll.disabled = false;
          saveAll.innerHTML = UI.icon('check') + 'Saved for offline';
          UI.toast(result.failed ? (result.total - result.failed) + '/' + result.total + ' saved (some items failed)'
            : 'The whole library was saved offline', { tone: result.failed ? 'warn' : 'ok', icon: 'check' });
        });
      });
    }

    var storageNote = document.getElementById('storageNote');
    if (storageNote && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (estimate) {
        storageNote.textContent = 'Storage: ' + UI.formatBytes(estimate.usage || 0) + ' used of ' +
          UI.formatBytes(estimate.quota || 0) + ' available';
      }).catch(function () {
        storageNote.textContent = 'Storage: ' + (Pack.isSavedAll() ? 'library saved' : 'not saved yet');
      });
    }

    var themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', function () {
        UI.storeSet('theme', themeSelect.value);
        applyTheme(themeSelect.value);
      });
    }
    var sizeSelect = document.getElementById('sizeSelect');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', function () {
        UI.storeSet('textSize', sizeSelect.value);
        document.documentElement.dataset.textSize = sizeSelect.value;
      });
    }

    var exportChats = document.getElementById('exportChats');
    if (exportChats) {
      exportChats.addEventListener('click', function () {
        var text = Chat.exportAll();
        var name = 'jarvis-chats-' + new Date().toISOString().slice(0, 10) + '.md';
        if (UI.download(name, text, 'text/markdown;charset=utf-8')) UI.toast('Chats exported', { tone: 'ok', icon: 'check' });
        else UI.toast('Export fail hua', { tone: 'warn' });
      });
    }
    var clearChats = document.getElementById('clearChats');
    if (clearChats) {
      clearChats.addEventListener('click', function () {
        UI.storeRemove('chats');
        Chat.newChat(false);
        UI.toast('All chats were deleted');
        render();
      });
    }
    var clearMemory = document.getElementById('clearMemory');
    if (clearMemory) {
      clearMemory.addEventListener('click', function () {
        Memory.clear();
        UI.toast('Memory cleared');
      });
    }
    var resetAll = document.getElementById('resetAll');
    if (resetAll) {
      resetAll.addEventListener('click', function () {
        UI.storeClearAll();
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) { return caches.delete(key); }));
          }).catch(function () { /* ignore */ });
        }
        UI.toast('Reset done — reloading now');
        setTimeout(function () { location.reload(); }, 700);
      });
    }
  }

  /* -------------------------------------------------------------- about */

  function aboutScreen() {
    var packs = Pack.packs().slice().sort(function (a, b) { return b.count - a.count; });
    var stats = Pack.stats();
    return '' +
      '<section class="screen about-screen">' +
        '<div class="about-hero">' +
          '<div class="orb orb-lg" aria-hidden="true"></div>' +
          '<h1>Jarvis Pocket</h1>' +
          '<p>An offline-first AI assistant that brings ' + stats.packs + ' open-source agent repos and ' + stats.items +
            ' skills, agents, commands and guides into one phone app.</p>' +
        '</div>' +
        '<section class="card">' +
          '<div class="card-head"><h2>How it works</h2></div>' +
          '<ul class="about-list">' +
            '<li><b>No key, no account.</b> JARVIS 1.0 has no cloud model at all: the brain runs on this phone and prompts never leave it.</li>' +
            '<li><b>Library grounding.</b> For every question the app finds the most relevant docs in its packs and gives them to the model, so answers come from your own repositories.</li>' +
            '<li><b>Tools.</b> The model can search the library itself, read a full document and save something to memory.</li>' +
            '<li><b>Offline.</b> After downloading a pack you can read it without internet; chat itself needs internet (or the on-device brain).</li>' +
          '</ul>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card-head"><h2>Packs (' + stats.packs + ')</h2><span class="pill">' + stats.items + ' items</span></div>' +
          '<div class="pack-list">' + packs.map(function (pack) {
            return '<a class="pack-row" href="#/pack/' + pack.id + '">' +
              '<span class="row-main"><strong>' + UI.esc(pack.name) + '</strong>' +
              '<small>' + UI.esc(pack.repo) + ' · ' + pack.count + ' items · ' + UI.esc(pack.license) + '</small></span>' +
              '<span class="row-chev">' + UI.icon('chevron') + '</span></a>';
          }).join('') + '</div>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card-head"><h2>Credits & license</h2></div>' +
          '<p class="muted small">All content belongs to its original authors and each pack keeps its own license (MIT / Apache-2.0 and so on). ' +
            'This app only makes them readable. Every item has a "View source on GitHub" link in its reader.</p>' +
          '<p class="muted small">App shell: vanilla JS, marked (MIT) + DOMPurify (MPL-2.0), no tracking, no analytics.</p>' +
        '</section>' +
        '<p class="muted center small">v1.0 · pack built ' + UI.esc(stats.built || '') + '</p>' +
      '</section>';
  }

  function mountAbout() { /* static */ }

  /* --------------------------------------------------------------- boot */

  function applyTheme(pref) {
    var theme = pref || UI.storeGet('theme', 'system');
    var dark = theme === 'dark' || (theme !== 'light' &&
      !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches));
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#07080d' : '#f6f5f2');
    var status = document.getElementById('appleStatusBar');
    if (status) status.setAttribute('content', dark ? 'black-translucent' : 'default');
  }

  function loadPack() {
    return Pack.load().then(function () {
      bootError = null;
      var sub = document.getElementById('brandSub');
      if (sub) {
        var stats = Pack.stats();
        sub.textContent = stats.items + ' items · ' + stats.packs + ' packs';
      }
      render();
    }).catch(function (error) {
      bootError = error.message || 'unknown error';
      render();
    });
  }

  function trackKeyboard() {
    var viewport = window.visualViewport;
    if (!viewport) return;
    var update = function () {
      var gap = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      document.documentElement.style.setProperty('--kb', gap > 90 ? Math.round(gap) + 'px' : '0px');
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
  }

  function bindGlobal() {
    trackKeyboard();
    document.addEventListener('click', function (event) {
      var sheetClose = event.target.closest('[data-sheet-close]');
      if (sheetClose) UI.closeSheet();

      var top = event.target.closest('[data-top]');
      if (top) {
        var kind = top.getAttribute('data-top');
        if (kind === 'search') location.hash = '#/search';
        if (kind === 'new') {
          if (location.hash !== '#/' && location.hash !== '') location.hash = '#/';
          Chat.newChat(true);
        }
        return;
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (UI.isSheetOpen()) UI.closeSheet();
        else if (Voice.isListening()) Voice.stop();
        else if (Voice.ttsSupported()) Voice.stopSpeaking();
      }
      UI.trapFocus(event);
      if (event.key === '/' && !/input|textarea|select/i.test((event.target.tagName || ''))) {
        event.preventDefault();
        location.hash = '#/search';
      }
    });

    window.addEventListener('hashchange', function () {
      render();
      if (location.hash.indexOf('#/search') !== 0) {
        // nothing to do; keeps search input focus stable
      }
    });

    window.addEventListener('online', function () { UI.toast('Back online', { tone: 'ok', icon: 'check' }); });
    window.addEventListener('offline', function () { UI.toast('Offline — library still works', { tone: 'warn', icon: 'alert' }); });

    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function () { if (UI.storeGet('theme', 'system') === 'system') applyTheme('system'); };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline is best effort */ });
      });
    }
  }

  window.JarvisApp = {
    render: render,
    go: function (path) { location.hash = path; }
  };

  function boot() {
    applyTheme();
    var size = UI.storeGet('textSize', 'm');
    document.documentElement.dataset.textSize = /^(s|m|l|xl)$/.test(size) ? size : 'm';
    bindGlobal();
    if (window.JarvisDB && window.JarvisDB.init) {
      window.JarvisDB.init().then(function () { render(); });
    }
    render();
    loadPack();
    if (window.JarvisSetup && window.JarvisSetup.shouldAutoOpen() &&
        location.hash.indexOf('#/setup') !== 0) {
      location.hash = '#/setup';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
