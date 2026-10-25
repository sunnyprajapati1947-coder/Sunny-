/* JARVIS — connect the phone: YouTube, social sharing, device health. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var N = window.JarvisNative || { available: false };
  var YT_KEY = 'conn.youtubeKey';

  function key() {
    return UI.storeGet(YT_KEY, '') || '';
  }

  function setKey(value) {
    UI.storeSet(YT_KEY, value);
    if (N.available && N.secureSet) N.secureSet('youtube.key', value).catch(function () {});
  }

  function hydrateKey() {
    if (!N.available || !N.secureGet) return;
    N.secureGet('youtube.key').then(function (value) {
      if (value && !key()) {
        UI.storeSet(YT_KEY, value);
        var input = document.getElementById('ytKey');
        if (input) input.value = value;
      }
    }).catch(function () {});
  }

  function testYouTube() {
    var value = key();
    if (!value) {
      UI.toast('Add the YouTube API key first', { tone: 'warn' });
      return;
    }
    UI.toast('Checking YouTube…');
    var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&type=video&q=' +
      encodeURIComponent('ai news') + '&key=' + encodeURIComponent(value);
    fetch(url).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error((body.error && body.error.message) || ('HTTP ' + response.status));
        var items = (body.items || []).map(function (item) {
          var title = item.snippet && item.snippet.title;
          var id = item.id && item.id.videoId;
          return '<li><a href="https://youtu.be/' + encodeURIComponent(id) + '" target="_blank" rel="noopener">' +
            UI.esc(title) + '</a></li>';
        }).join('');
        UI.toast('YouTube connected ✅', { tone: 'ok' });
        UI.sheet('YouTube connected', '<p class="muted small">Test search results:</p><ul>' + items + '</ul>');
      });
    }).catch(function (error) {
      UI.toast('YouTube fail: ' + error.message, { tone: 'warn' });
    });
  }

  function shareTo(platform) {
    var text = 'Content created by JARVIS — edit the caption here.';
    if (N.available && N.share) {
      N.share(text).catch(function () {});
      return;
    }
    UI.copyText(text).then(function () { UI.toast('Caption copied'); });
  }

  function openApp(url) {
    if (N.available && N.openUrl) {
      N.openUrl(url).catch(function () { window.open(url, '_blank'); });
    } else {
      window.open(url, '_blank');
    }
  }

  function youtubeSearch() {
    var input = document.getElementById('ytQuery');
    var query = input ? input.value.trim() : '';
    if (!query) {
      UI.toast('What do you want to search for?', { tone: 'warn' });
      return;
    }
    var value = key();
    if (!value) {
      openApp('https://www.youtube.com/results?search_query=' + encodeURIComponent(query));
      return;
    }
    fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=6&type=video&q=' +
      encodeURIComponent(query) + '&key=' + encodeURIComponent(value))
      .then(function (response) { return response.json(); })
      .then(function (body) {
        if (body.error) throw new Error(body.error.message);
        var rows = (body.items || []).map(function (item) {
          var id = item.id && item.id.videoId;
          return '<a class="item-row" href="https://youtu.be/' + encodeURIComponent(id) +
            '" data-open="https://youtu.be/' + encodeURIComponent(id) + '">' +
            '<span class="item-main"><span class="item-title">' +
            UI.esc(item.snippet && item.snippet.title) + '</span>' +
            '<span class="item-desc">' + UI.esc((item.snippet && item.snippet.channelTitle) || '') + '</span></span>' +
            '<span class="row-chev">' + UI.icon('chevron') + '</span></a>';
        }).join('');
        UI.sheet('YouTube: ' + query, rows || '<p class="muted">Nothing found.</p>');
        Array.prototype.forEach.call(document.querySelectorAll('#sheet [data-open]'), function (row) {
          row.addEventListener('click', function (event) {
            event.preventDefault();
            openApp(row.getAttribute('data-open'));
          });
        });
      })
      .catch(function (error) { UI.toast('Search fail: ' + error.message, { tone: 'warn' }); });
  }

  function deviceCard() {
    if (!N.available) {
      return '<div class="card"><div class="card-head"><h2>' + UI.icon('shield') + 'Device</h2></div>' +
        '<p class="muted small">Browser mode: native gallery, notifications and updates come with the APK.</p></div>';
    }
    return '<div class="card" id="deviceCard"><div class="card-head"><h2>' + UI.icon('shield') + 'Device health</h2></div>' +
      '<div id="deviceBody"><p class="muted small">Checking…</p></div>' +
      '<div class="card-actions">' +
      '<button class="btn btn-ghost btn-sm" id="deviceCheck">Re-check</button>' +
      '<button class="btn btn-ghost btn-sm" id="deviceUpdate">Update check</button>' +
      '<button class="btn btn-ghost btn-sm" id="deviceNotify">Allow notifications</button>' +
      '</div></div>';
  }

  function paintDevice() {
    var body = document.getElementById('deviceBody');
    if (!body) return;
    if (!N.available) return;
    Promise.all([N.call('info'), N.call('selfCheck')]).then(function (rows) {
      var info = rows[0] || {};
      var check = rows[1] || {};
      body.innerHTML =
        '<div class="row"><span class="muted">Version</span><span>' + UI.esc(info.version || '') + ' (' + (info.versionCode || '') + ')</span></div>' +
        '<div class="row"><span class="muted">Device</span><span>' + UI.esc(info.device || '') + ' · Android ' + (info.sdk || '') + '</span></div>' +
        '<div class="row"><span class="muted">Notifications</span><span>' + (check.notifications ? 'allowed ✅' : 'off — allow it') + '</span></div>' +
        '<div class="row"><span class="muted">Install updates</span><span>' + (check.installs ? 'allowed ✅' : 'Allow it in Settings') + '</span></div>' +
        '<div class="row"><span class="muted">Free storage</span><span>' + (check.freeMb || 0) + ' MB</span></div>';
    }).catch(function (error) {
      body.innerHTML = '<p class="small" style="color:var(--warn)">' + UI.esc(error.message) + '</p>';
    });
  }

  function screen() {
    return '<section class="screen connections-screen">' +
      '<div class="screen-head"><h1>Connections</h1>' +
      '<p>YouTube, social and device — everything stays on this phone. JARVIS never keeps your password.</p></div>' +

      '<div class="card">' +
      '<div class="card-head"><h2>' + UI.icon('bolt') + 'YouTube</h2></div>' +
      '<p class="muted small">An API key enables search and video data. Use “Share” below to upload — ' +
      'the YouTube app uploads it itself, so JARVIS never needs your Google password.</p>' +
      '<label class="field"><span>YouTube Data API key (optional)</span>' +
      '<input id="ytKey" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="' + UI.esc(key()) + '"></label>' +
      '<div class="card-actions">' +
      '<button class="btn btn-primary btn-sm" id="ytSave">Save key</button>' +
      '<button class="btn btn-ghost btn-sm" id="ytTest">Test</button>' +
      '<button class="btn btn-ghost btn-sm" id="ytOpen">Open YouTube</button>' +
      '</div>' +
      '<label class="field" style="margin-top:12px"><span>YouTube search</span>' +
      '<input id="ytQuery" type="search" placeholder="video ideas, competitors, tutorials…"></label>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" id="ytSearch">Search</button></div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><h2>' + UI.icon('share') + 'Social & uploads</h2></div>' +
      '<p class="muted small">The phone share sheet is the safest route: content is created by JARVIS, ' +
      'you open the app you prefer and post from there. No API token can be stolen.</p>' +
      '<div class="card-actions">' +
      '<button class="btn btn-ghost btn-sm" data-share="whatsapp">WhatsApp</button>' +
      '<button class="btn btn-ghost btn-sm" data-share="instagram">Instagram</button>' +
      '<button class="btn btn-ghost btn-sm" data-share="youtube">YouTube</button>' +
      '<button class="btn btn-ghost btn-sm" data-share="x">X</button>' +
      '<button class="btn btn-ghost btn-sm" id="copyCaption">Copy caption</button>' +
      '</div>' +
      '<p class="muted small">After making the video: Gallery → video → Share → YouTube/Instagram. ' +
      'JARVIS can save video to the gallery; to edit it, open the phone editor or the video skill in the library.</p>' +
      '<div class="card-actions">' +
      '<a class="btn btn-ghost btn-sm" href="#/search?q=video%20editing">Video editing skills</a>' +
      '<a class="btn btn-ghost btn-sm" href="#/search?q=youtube">YouTube skills</a>' +
      '</div></div>' +

      deviceCard() +
      '</section>';
  }

  function mount() {
    var input = document.getElementById('ytKey');
    hydrateKey();
    var save = document.getElementById('ytSave');
    if (save) save.addEventListener('click', function () {
      var value = input ? input.value.trim() : '';
      setKey(value);
      UI.toast(value ? 'Key saved (on this device)' : 'Key hata di', { tone: 'ok' });
    });
    var test = document.getElementById('ytTest');
    if (test) test.addEventListener('click', testYouTube);
    var open = document.getElementById('ytOpen');
    if (open) open.addEventListener('click', function () { openApp('https://m.youtube.com'); });
    var search = document.getElementById('ytSearch');
    if (search) search.addEventListener('click', youtubeSearch);
    Array.prototype.forEach.call(document.querySelectorAll('[data-share]'), function (button) {
      button.addEventListener('click', function () { shareTo(button.getAttribute('data-share')); });
    });
    var copy = document.getElementById('copyCaption');
    if (copy) copy.addEventListener('click', function () {
      UI.copyText('Content created by JARVIS — edit the caption here.').then(function () {
        UI.toast('Caption copied');
      });
    });
    var check = document.getElementById('deviceCheck');
    if (check) check.addEventListener('click', paintDevice);
    var update = document.getElementById('deviceUpdate');
    if (update) update.addEventListener('click', function () {
      if (N.available && N.checkForUpdate) {
        N.checkForUpdate((window.JarvisNativeInfo && window.JarvisNativeInfo.version) || '0.0.0');
        UI.toast('Checking for updates…');
      }
    });
    var notify = document.getElementById('deviceNotify');
    if (notify) notify.addEventListener('click', function () {
      if (N.available) N.call('requestNotifications').catch(function () {});
    });
    paintDevice();
  }

  window.JarvisConnections = { screen: screen, mount: mount };
})();
