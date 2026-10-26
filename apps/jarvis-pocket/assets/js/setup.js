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
        hint: 'You will get an alert when the task finishes.' },
      { id: 'install', title: 'App updates', done: canInstall(),
        hint: 'A new version can install itself inside the app.' },
      { id: 'brain', title: 'On-device brain', done: !!(window.JarvisLocalBrain && window.JarvisLocalBrain.isReady()),
        hint: 'Qwen3.5 inside the phone. Download once (about 490 MB) and it answers with no internet and no API key.' },
      { id: 'youtube', title: 'YouTube (optional)', done: ytReady(),
        hint: 'Optional: a Google Data API key for video search and channel work. Not needed for chat or the phone tools.' }
    ];
  }

  function badge(done) {
    return '<span class="pill ' + (done ? 'pill-ok' : 'pill-warn') + '">' + (done ? 'done' : 'to do') + '</span>';
  }

  function screen() {
    var list = steps();
    var done = list.filter(function (step) { return step.done; }).length;
    var config = LLM.settings();

    return '<section class="screen setup-screen">' +
      '<div class="screen-head"><h1>Setup</h1>' +
      '<p>Four short steps — 2 minutes. Everything stays inside this phone.</p></div>' +
      '<div class="card"><div class="card-head"><h2>' + UI.icon('check') + done + '/4 ready</h2>' +
      '<span class="pill">' + (done === 4 ? 'ready' : 'in progress') + '</span></div>' +
      '<div class="video-bar"><span id="setupBar" style="width:' + Math.round((done / 4) * 100) + '%"></span></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('alert') + '1. Notifications</h2>' + badge(notified()) + '</div>' +
      '<p class="muted small">' + list[0].hint + '</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="setupNotify">Allow</button></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('download') + '2. App updates</h2>' + badge(canInstall()) + '</div>' +
      '<p class="muted small">' + list[1].hint + '</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="setupInstall">Grant permission</button></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('brain') + '3a. On-device brain (offline)</h2>' +
      badge(!!(window.JarvisLocalBrain && window.JarvisLocalBrain.isReady())) + '</div>' +
      '<p class="muted small">Qwen3.5 inside the phone — one download (~490 MB), then answers with no internet.</p>' +
      '<div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/local">Open local brain</a></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('shield') + '3b. Microphone &amp; phone tools</h2>' +
      badge(!!(window.JarvisTools && true)) + '</div>' +
      '<p class="muted small">Voice input, calendar, notes and app launching each ask for their own Android permission the first time they are used. ' +
      'Nothing is granted silently, and anything Android will not let me verify is reported as unverified.</p>' +
      '<div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/dash">Permissions &amp; dashboard</a></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('play') + '4. YouTube (optional)</h2>' + badge(ytReady()) + '</div>' +
      '<p class="muted small">' + list[3].hint + '</p>' +
      '<div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/connections">Open connections</a></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('check') + 'All done?</h2></div>' +
      '<p class="muted small">Open chat and say "check up my phone" or give it any task.</p>' +
      '<div class="card-actions"><button class="btn btn-primary" id="setupFinish">Start chatting</button>' +
      '<button class="btn btn-ghost" id="setupLater">Later</button></div></div>' +
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
          UI.toast('Allow it in Settings under "Install unknown apps"', { tone: 'warn' });
        });
      } else {
        UI.toast('Works in the Android app only', { tone: 'warn' });
      }
      setTimeout(function () { refreshCheck().then(refresh); }, 900);
    });

    // JARVIS 1.0 has no key step: the brain is downloaded once, on this phone.
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
