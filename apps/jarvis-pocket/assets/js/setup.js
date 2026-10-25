/* JARVIS — first-run setup wizard: permissions, AI brain, YouTube, done. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var LLM = window.JarvisLLM;
  var N = window.JarvisNative || { available: false };

  var FLAG = 'setup.done';

  function check() {
    return window.JarvisNativeCheck || {};
  }

  function refreshCheck() {
    if (!N.available || !N.selfCheck) return Promise.resolve(check());
    return N.selfCheck().then(function (data) {
      window.JarvisNativeCheck = data || {};
      return window.JarvisNativeCheck;
    }).catch(function () { return check(); });
  }

  function notified() {
    var info = check();
    if (N.available) return !!info.notifications;
    return !('Notification' in window) || Notification.permission === 'granted';
  }

  function canInstall() {
    var info = check();
    if (N.available) return info.installs !== false;
    return true;
  }

  function ytReady() {
    return !!UI.storeGet('conn.youtubeKey', '');
  }

  function steps() {
    return [
      { id: 'notify', title: 'Notifications', done: notified(),
        hint: 'Task poora hone par alert milega.' },
      { id: 'install', title: 'App updates', done: canInstall(),
        hint: 'Naya version app ke andar install ho sake.' },
      { id: 'brain', title: 'AI brain', done: LLM.isReady(),
        hint: 'Gemini ya koi OpenAI-compatible key. Iske bina sirf 1,899-skill library chalti hai.' },
      { id: 'youtube', title: 'YouTube (optional)', done: ytReady(),
        hint: 'Video search aur channel kaam ke liye Data API key.' }
    ];
  }

  function badge(done) {
    return '<span class="pill ' + (done ? 'pill-ok' : 'pill-warn') + '">' + (done ? 'ho gaya' : 'baaki') + '</span>';
  }

  function screen() {
    var list = steps();
    var done = list.filter(function (step) { return step.done; }).length;
    var config = LLM.settings();
    var provider = LLM.providerOf(config);

    return '<section class="screen setup-screen">' +
      '<div class="screen-head"><h1>Setup</h1>' +
      '<p>Char chhote step — 2 minute. Sab kuch is phone me rehta hai.</p></div>' +
      '<div class="card"><div class="card-head"><h2>' + UI.icon('check') + done + '/4 taiyar</h2>' +
      '<span class="pill">' + (done === 4 ? 'ready' : 'in progress') + '</span></div>' +
      '<div class="video-bar"><span id="setupBar" style="width:' + Math.round((done / 4) * 100) + '%"></span></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('alert') + '1. Notifications</h2>' + badge(notified()) + '</div>' +
      '<p class="muted small">' + list[0].hint + '</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="setupNotify">Allow karo</button></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('download') + '2. App updates</h2>' + badge(canInstall()) + '</div>' +
      '<p class="muted small">' + list[1].hint + '</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="setupInstall">Permission do</button></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('spark') + '3. AI brain</h2>' + badge(LLM.isReady()) + '</div>' +
      '<p class="muted small">' + list[2].hint + '</p>' +
      '<label class="field"><span>API key</span>' +
      '<div class="field-row"><input id="setupKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" value="' + UI.esc(config.key) + '">' +
      '<button class="icon-btn" id="setupShowKey" aria-label="Show key">' + UI.icon('eye') + '</button></div></label>' +
      '<div class="card-actions"><button class="btn btn-primary btn-sm" id="setupSaveKey">' + UI.icon('bolt') + 'Save & test</button>' +
      (provider.keys ? '<button class="btn btn-ghost btn-sm" id="setupGetKey">Free key lo</button>' : '') + '</div>' +
      '<p class="muted small" id="setupKeyNote">Provider: ' + UI.esc(provider.label) + ' · ' + UI.esc(config.model) + '</p></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('play') + '4. YouTube (optional)</h2>' + badge(ytReady()) + '</div>' +
      '<p class="muted small">' + list[3].hint + '</p>' +
      '<div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/connections">Connections kholo</a></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('check') + 'Ho gaya?</h2></div>' +
      '<p class="muted small">Chat kholo aur bolo "mere phone ka checkup karo" ya koi bhi kaam.</p>' +
      '<div class="card-actions"><button class="btn btn-primary" id="setupFinish">Chat shuru karo</button>' +
      '<button class="btn btn-ghost" id="setupLater">Baad me</button></div></div>' +
      '</section>';
  }

  function mount() {
    var refresh = function () { if (window.JarvisApp) window.JarvisApp.render(); };

    var notify = document.getElementById('setupNotify');
    if (notify) notify.addEventListener('click', function () {
      if (N.available && N.call) N.call('requestNotifications').catch(function () {});
      else if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      setTimeout(function () { refreshCheck().then(refresh); }, 900);
    });

    var install = document.getElementById('setupInstall');
    if (install) install.addEventListener('click', function () {
      if (N.available && N.call) {
        N.call('openInstallSettings').catch(function () {
          UI.toast('Settings me "Install unknown apps" se allow karo', { tone: 'warn' });
        });
      } else {
        UI.toast('Android app me hi kaam karta hai', { tone: 'warn' });
      }
      setTimeout(function () { refreshCheck().then(refresh); }, 900);
    });

    var show = document.getElementById('setupShowKey');
    var keyInput = document.getElementById('setupKey');
    if (show && keyInput) show.addEventListener('click', function () {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });

    var save = document.getElementById('setupSaveKey');
    if (save) save.addEventListener('click', function () {
      var value = keyInput ? keyInput.value.trim() : '';
      if (!value) {
        UI.toast('Pehle key paste karo', { tone: 'warn' });
        return;
      }
      LLM.save({ key: value });
      var note = document.getElementById('setupKeyNote');
      if (note) note.textContent = 'Check ho raha hai…';
      save.disabled = true;
      LLM.testConnection().then(function () {
        UI.toast('AI brain ready ✅', { tone: 'ok' });
        if (N.available && N.secureSet) N.secureSet('llm.key', value).catch(function () {});
        refresh();
      }).catch(function (error) {
        UI.toast('Key fail: ' + error.message, { tone: 'warn' });
        if (note) note.textContent = 'Key save hai, par test fail: ' + error.message;
      }).then(function () { save.disabled = false; });
    });

    var getKey = document.getElementById('setupGetKey');
    if (getKey) getKey.addEventListener('click', function () {
      var provider = LLM.providerOf(LLM.settings());
      var url = provider.keys || 'https://aistudio.google.com/apikey';
      if (N.available && N.openUrl) N.openUrl(url).catch(function () { window.open(url, '_blank'); });
      else window.open(url, '_blank');
    });

    var finish = document.getElementById('setupFinish');
    if (finish) finish.addEventListener('click', function () {
      UI.storeSet(FLAG, true);
      UI.toast('Jarvis ready hai boss ✅', { tone: 'ok' });
      location.hash = '#/';
    });

    var later = document.getElementById('setupLater');
    if (later) later.addEventListener('click', function () {
      UI.storeSet(FLAG, 'later');
      location.hash = '#/';
    });

    refreshCheck().then(function () {
      var bar = document.getElementById('setupBar');
      if (bar) {
        var done = steps().filter(function (step) { return step.done; }).length;
        bar.style.width = Math.round((done / 4) * 100) + '%';
      }
    });
  }

  function shouldAutoOpen() {
    if (UI.storeGet(FLAG, false)) return false;
    return !LLM.isReady();
  }

  window.JarvisSetup = {
    screen: screen,
    mount: mount,
    shouldAutoOpen: shouldAutoOpen,
    steps: steps
  };
})();
