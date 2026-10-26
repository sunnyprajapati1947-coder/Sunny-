/* JARVIS — native Android bridge (Capacitor). A no-op in the browser/PWA. */
(function () {
  'use strict';

  var plugin = null;
  try {
    plugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.JarvisNative) || null;
  } catch (error) {
    plugin = null;
  }
  var available = !!plugin;
  var info = null;

  function call(name, args) {
    if (!available || typeof plugin[name] !== 'function') {
      return Promise.reject(new Error('native bridge unavailable: ' + name));
    }
    return Promise.resolve(plugin[name](args || {}));
  }

  function toast(message, tone) {
    if (window.JarvisUI && window.JarvisUI.toast) window.JarvisUI.toast(message, { tone: tone || 'ok' });
  }

  /* ---------------------------------------------------------------- speech */

  if (available) {
    // Android WebView has no Web Speech API. These shims keep voice.js working
    // unchanged by routing through the native recogniser and TTS engine.
    var NativeRecognition = function () {
      this.lang = 'hi-IN';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this._active = false;
    };
    NativeRecognition.prototype.start = function () {
      var self = this;
      if (self._active) return;
      self._active = true;
      if (self.onstart) self.onstart();
      var tools = null;
      try {
        tools = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.JarvisTools) || null;
      } catch (error) { tools = null; }
      var request = tools && typeof tools.listenOffline === 'function'
        ? tools.listenOffline({ lang: self.lang, prompt: 'Speak now' })
        : call('listen', { lang: self.lang });
      request
        .then(function (result) {
          var text = (result && result.text) || '';
          self._active = false;
          if (result && result.permission) {
            if (self.onerror) self.onerror({ error: 'permission', message: result.evidence || '' });
            if (self.onend) self.onend();
            return;
          }
          if (text) {
            var alternative = { transcript: text, confidence: 1 };
            var list = [alternative];
            list.isFinal = true;
            if (self.onresult) self.onresult({ resultIndex: 0, results: [list] });
          } else if (self.onerror) {
            self.onerror({ error: 'no-speech' });
          }
          if (self.onend) self.onend();
        })
        .catch(function (error) {
          self._active = false;
          if (self.onerror) self.onerror({ error: 'native', message: error.message });
          if (self.onend) self.onend();
        });
    };
    NativeRecognition.prototype.stop = function () {
      if (this._active) {
        this._active = false;
        if (this.onend) this.onend();
      }
    };
    NativeRecognition.prototype.abort = NativeRecognition.prototype.stop;
    window.SpeechRecognition = NativeRecognition;
    window.webkitSpeechRecognition = NativeRecognition;

    var NativeUtterance = function (text) {
      this.text = String(text || '');
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onend = null;
      this.onerror = null;
    };
    window.SpeechSynthesisUtterance = NativeUtterance;
    window.speechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: function () {
        return [
          { name: 'Phone voice (Hindi)', lang: 'hi-IN', default: true, localService: true },
          { name: 'Phone voice (English)', lang: 'en-IN', default: false, localService: true }
        ];
      },
      addEventListener: function () {},
      removeEventListener: function () {},
      speak: function (utterance) {
        var self = this;
        self.speaking = true;
        call('speak', { text: utterance.text, lang: utterance.lang || 'hi-IN' })
          .catch(function () {})
          .then(function () {
            self.speaking = false;
            if (utterance.onend) utterance.onend();
          });
      },
      cancel: function () {
        this.speaking = false;
        call('stopSpeak').catch(function () {});
      },
      pause: function () {},
      resume: function () {}
    };
  }

  /* --------------------------------------------------------------- gallery */

  function base64FromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsDataURL(blob);
    });
  }

  function saveImage(img) {
    var src = img.currentSrc || img.src;
    if (!src) return;
    toast('Saving to the gallery…');
    fetch(src, { mode: 'cors' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.blob();
      })
      .then(function (blob) {
        return base64FromBlob(blob).then(function (base64) {
          var type = blob.type || 'image/png';
          var ext = type.indexOf('video/') === 0 ? 'mp4' : (type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          return call('saveToGallery', {
            base64: base64,
            mime: type,
            filename: 'jarvis-' + Date.now() + '.' + ext
          });
        });
      })
      .then(function () { toast('Saved to the gallery ✅', 'ok'); })
      .catch(function (error) { toast('Save failed: ' + error.message, 'warn'); });
  }

  function decorateImages() {
    var images = document.querySelectorAll('.chat-log img, #view img');
    Array.prototype.forEach.call(images, function (img) {
      if (img.dataset.jarvisSave) return;
      img.dataset.jarvisSave = '1';
      img.style.cursor = 'pointer';
      img.title = 'Tap to save to gallery';
      img.addEventListener('click', function (event) {
        event.preventDefault();
        saveImage(img);
      });
    });
  }

  /* ---------------------------------------------------------------- update */

  var RELEASES = 'https://api.github.com/repos/sunnyprajapati1947-coder/Sunny-/releases?per_page=30';

  function parseVersion(text) {
    var match = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
  }

  function isNewer(latest, current) {
    for (var i = 0; i < 3; i += 1) {
      if (latest[i] > current[i]) return true;
      if (latest[i] < current[i]) return false;
    }
    return false;
  }

  function showUpdateBanner(release, apkUrl) {
    if (document.getElementById('jarvisUpdate')) return;
    var bar = document.createElement('div');
    bar.id = 'jarvisUpdate';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top, 0px) + 10px);' +
      'z-index:60;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;' +
      'background:linear-gradient(135deg,#233,#122);border:1px solid rgba(120,255,190,.35);' +
      'color:#eafff4;font:600 13px/1.3 system-ui;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    bar.innerHTML = '<span style="flex:1">A new version ' + release + ' is ready</span>' +
      '<button id="jarvisUpdateGo" style="border:0;border-radius:10px;padding:8px 12px;background:#3fe08a;color:#04140b;font-weight:800">Update</button>' +
      '<button id="jarvisUpdateX" aria-label="Dismiss" style="border:0;background:transparent;color:#9fb;font-size:18px">×</button>';
    document.body.appendChild(bar);
    document.getElementById('jarvisUpdateX').addEventListener('click', function () { bar.remove(); });
    document.getElementById('jarvisUpdateGo').addEventListener('click', function () {
      call('downloadUpdate', { url: apkUrl, version: release })
        .then(function () {
          toast('Download started — install from the notification', 'ok');
        })
        .catch(function () {
          call('openUrl', { url: apkUrl }).catch(function () {
            window.open(apkUrl, '_blank');
          });
          toast('Downloaded in the browser — tap install', 'ok');
        });
      bar.remove();
    });
  }

  function checkForUpdate(version) {
    if (!available) return;
    var current = parseVersion(version);
    fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) { return response.ok ? response.json() : []; })
      .then(function (releases) {
        if (!Array.isArray(releases)) return;
        for (var i = 0; i < releases.length; i += 1) {
          var release = releases[i];
          var tag = String(release.tag_name || '');
          if (tag.indexOf('jarvis-v') !== 0) continue;
          var latest = parseVersion(tag);
          if (!isNewer(latest, current)) return;
          var assets = release.assets || [];
          var apk = null;
          for (var j = 0; j < assets.length; j += 1) {
            if (/\.apk$/i.test(assets[j].name || '')) { apk = assets[j]; break; }
          }
          if (!apk) return;
          showUpdateBanner(latest.join('.'), apk.browser_download_url);
          return;
        }
      })
      .catch(function () { /* offline: update check is best effort */ });
  }

  /* ------------------------------------------------------------ background */

  var backgroundOn = false;

  function background(on, text) {
    if (!available) return;
    if (on && !backgroundOn) {
      backgroundOn = true;
      call('backgroundStart', { text: text || 'Working…' }).catch(function () { backgroundOn = false; });
    } else if (!on && backgroundOn) {
      backgroundOn = false;
      call('backgroundStop').catch(function () {});
    }
  }

  /* ------------------------------------------------------------------ boot */

  function notifyReady(version) {
    var key = 'jarvis.readyNotice';
    try {
      if (localStorage.getItem(key) === version) return;
      localStorage.setItem(key, version);
    } catch (error) { /* storage may be blocked */ }
    call('notify', {
      title: 'Jarvis ready hai boss ✅',
      body: 'Version ' + version + ' — speak or type, and the work starts.'
    }).catch(function () {});
  }

  function boot() {
    if (!available) {
      if (window.JarvisUI && window.JarvisUI.storeGet) {
        // browser shell: still announce readiness once per version
        var v = window.JarvisUI.storeGet('app.version', 'web');
        if (v) setTimeout(function () { toast('Jarvis ready hai boss ✅'); }, 1200);
      }
      return;
    }
    call('requestNotifications').catch(function () {});
    call('info')
      .then(function (data) {
        info = data || {};
        window.JarvisNativeInfo = info;
        var version = info.version || '1.0.0';
        notifyReady(version);
        setTimeout(function () {
          toast('Jarvis ready hai boss ✅ v' + version);
          if (window.JarvisVoice && window.JarvisVoice.speak &&
              window.JarvisUI && window.JarvisUI.storeGet('voice.replies', false)) {
            window.JarvisVoice.speak('Jarvis ready hai boss');
          }
        }, 900);
        checkForUpdate(version);
        return call('selfCheck');
      })
      .then(function (check) {
        window.JarvisNativeCheck = check || {};
      })
      .catch(function () { /* bridge is optional */ });

    var observer = new MutationObserver(function () { decorateImages(); });
    observer.observe(document.body, { childList: true, subtree: true });
    decorateImages();
  }

  window.JarvisNative = {
    available: available,
    call: call,
    info: function () { return info; },
    saveImage: saveImage,
    saveToGallery: function (base64, mime, filename) {
      return call('saveToGallery', { base64: base64, mime: mime, filename: filename });
    },
    share: function (text, url) { return call('share', { text: text, url: url || '' }); },
    notify: function (title, body) { return call('notify', { title: title, body: body }); },
    openUrl: function (url) { return call('openUrl', { url: url }); },
    downloadUpdate: function (url, version) { return call('downloadUpdate', { url: url, version: version }); },
    secureGet: function (key) { return call('secureGet', { key: key }).then(function (r) { return (r && r.value) || ''; }); },
    secureSet: function (key, value) { return call('secureSet', { key: key, value: value }); },
    background: background,
    checkForUpdate: checkForUpdate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
