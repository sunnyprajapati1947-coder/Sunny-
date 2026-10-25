/* JARVIS — prompt se vertical video: script, animated scenes, gallery auto-save. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var LLM = window.JarvisLLM;
  var N = window.JarvisNative || { available: false };

  var SIZES = {
    vertical: { w: 720, h: 1280, label: 'Vertical 9:16 (Reels/Shorts)' },
    square: { w: 720, h: 720, label: 'Square 1:1 (post)' },
    landscape: { w: 1280, h: 720, label: 'Landscape 16:9 (YouTube)' }
  };
  var PALETTES = [
    ['#07080d', '#101a3a', '#38bdf8'],
    ['#0b0614', '#2a1040', '#f472b6'],
    ['#04120f', '#0d332a', '#34d399'],
    ['#140b04', '#3a2007', '#fbbf24']
  ];

  var state = { scenes: [], blob: null, busy: false, raf: 0, recorder: null, cancel: false };

  function pickMime() {
    if (typeof window.MediaRecorder === 'undefined') return '';
    var list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i += 1) {
      try {
        if (MediaRecorder.isTypeSupported(list[i])) return list[i];
      } catch (error) { /* keep trying */ }
    }
    return '';
  }

  function canRecord() {
    return !!(window.HTMLCanvasElement && document.createElement('canvas').getContext &&
      document.createElement('canvas').getContext('2d') && pickMime());
  }

  function planVideo(prompt) {
    var text = String(prompt || '').trim();
    if (!text) return Promise.reject(new Error('Video ka topic batao.'));
    if (!LLM.isReady()) return Promise.reject(new Error('Video script ke liye Settings me AI key daalo.'));
    var system = 'You write short vertical-video scripts for a phone assistant. ' +
      'Reply with JSON only: {"title":"<=60 chars","scenes":[{"text":"onscreen line, <=90 chars","seconds":3}]}. ' +
      'Use 4 to 7 scenes, 2-6 seconds each, no markdown, no extra keys, no tool tags. ' +
      'Text must be simple Hinglish or English, readable in one glance.';
    return LLM.complete({
      system: system,
      messages: [{ role: 'user', content: 'Video topic: ' + text.slice(0, 1200) }],
      stream: false
    }).then(function (raw) {
      var body = String(raw || '').replace(/```[a-z]*/gi, '').trim();
      var match = body.match(/\{[\s\S]*\}/);
      var parsed = null;
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (error) { parsed = null; }
      }
      if (!parsed || !Array.isArray(parsed.scenes) || !parsed.scenes.length) {
        var lines = body.split('\n').map(function (line) {
          return line.replace(/^[\s\-*\d.)]+/, '').trim();
        }).filter(function (line) { return line.length > 3; });
        parsed = { title: text.slice(0, 60), scenes: lines.slice(0, 6).map(function (line) {
          return { text: line.slice(0, 90), seconds: 3 };
        }) };
      }
      var scenes = parsed.scenes.map(function (scene) {
        var value = typeof scene === 'string' ? { text: scene } : (scene || {});
        var seconds = Number(value.seconds);
        return {
          text: String(value.text || '').slice(0, 160),
          seconds: Math.min(8, Math.max(1.5, isFinite(seconds) ? seconds : 3))
        };
      }).filter(function (scene) { return scene.text; }).slice(0, 8);
      if (!scenes.length) scenes = [{ text: text.slice(0, 120), seconds: 4 }];
      return { title: String(parsed.title || text).slice(0, 90), scenes: scenes };
    });
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var probe = line ? line + ' ' + word : word;
      if (ctx.measureText(probe).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 6);
  }

  function drawScene(ctx, scene, index, total, size) {
    var palette = PALETTES[index % PALETTES.length];
    var gradient = ctx.createLinearGradient(0, 0, size.w, size.h);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(1, palette[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.w, size.h);

    var glow = ctx.createRadialGradient(size.w * 0.8, size.h * 0.15, 10, size.w * 0.8, size.h * 0.15, size.w * 0.9);
    glow.addColorStop(0, palette[2] + '55');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size.w, size.h);

    var fontSize = Math.round(size.w * 0.072);
    ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lines = wrapLines(ctx, scene.text, size.w * 0.84);
    var lineHeight = fontSize * 1.28;
    var startY = size.h / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (line, i) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(line, size.w / 2 + 2, startY + i * lineHeight + 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(line, size.w / 2, startY + i * lineHeight);
    });

    ctx.font = '600 ' + Math.round(size.w * 0.032) + 'px system-ui, sans-serif';
    ctx.fillStyle = palette[2];
    ctx.textAlign = 'left';
    ctx.fillText('JARVIS', size.w * 0.08, size.h - size.h * 0.08);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(248,250,252,0.6)';
    ctx.fillText((index + 1) + '/' + total, size.w - size.w * 0.08, size.h - size.h * 0.08);

    var barWidth = size.w * 0.84;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(size.w * 0.08, size.h * 0.9, barWidth, 6);
    ctx.fillStyle = palette[2];
    ctx.fillRect(size.w * 0.08, size.h * 0.9, barWidth * ((index + 1) / total), 6);
  }

  function record(scenes, size, onTick) {
    return new Promise(function (resolve, reject) {
      var mime = pickMime();
      if (!mime) {
        reject(new Error('Is browser/WebView me video recording support nahi hai.'));
        return;
      }
      var canvas = document.createElement('canvas');
      canvas.width = size.w;
      canvas.height = size.h;
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas render nahi ho paya.'));
        return;
      }
      var stage = document.getElementById('videoStage');
      if (stage) {
        canvas.className = 'video-canvas';
        stage.innerHTML = '';
        stage.appendChild(canvas);
        stage.hidden = false;
      }
      drawScene(ctx, scenes[0], 0, scenes.length, size);

      var stream = canvas.captureStream ? canvas.captureStream(30) : null;
      if (!stream) {
        reject(new Error('Canvas stream support nahi hai.'));
        return;
      }
      var recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      } catch (error) {
        reject(new Error('Recorder start nahi hua: ' + error.message));
        return;
      }
      var chunks = [];
      var total = scenes.reduce(function (sum, scene) { return sum + scene.seconds; }, 0);
      var started = 0;
      state.recorder = recorder;
      state.cancel = false;

      recorder.ondataavailable = function (event) {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onerror = function (event) {
        reject(new Error('Recording error: ' + (event.error && event.error.name || 'unknown')));
      };
      recorder.onstop = function () {
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.recorder = null;
        try { stream.getTracks().forEach(function (track) { track.stop(); }); } catch (error) { /* ignore */ }
        if (state.cancel) {
          reject(new Error('Video cancel ho gaya.'));
          return;
        }
        var blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) {
          reject(new Error('Recording khali nikli.'));
          return;
        }
        resolve(blob);
      };
      recorder.start(250);

      var start = performance.now();
      function frame(now) {
        if (state.cancel) {
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        var elapsed = (now - start) / 1000;
        var cursor = 0;
        var active = 0;
        for (var i = 0; i < scenes.length; i += 1) {
          if (elapsed < cursor + scenes[i].seconds) { active = i; break; }
          cursor += scenes[i].seconds;
          active = i;
        }
        if (elapsed !== started) {
          started = elapsed;
          if (onTick) onTick(Math.min(1, elapsed / total), elapsed, total);
        }
        drawScene(ctx, scenes[active], active, scenes.length, size);
        if (elapsed >= total) {
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        state.raf = requestAnimationFrame(frame);
      }
      state.raf = requestAnimationFrame(frame);
    });
  }

  function toBase64(blob) {
    return blob.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var chunk = 0x8000;
      var parts = [];
      for (var i = 0; i < bytes.length; i += chunk) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
      }
      return btoa(parts.join(''));
    });
  }

  function saveToGallery(blob, title) {
    var name = 'jarvis-' + Date.now() + '.webm';
    if (N.available && N.saveToGallery) {
      return toBase64(blob).then(function (data) {
        return N.saveToGallery({ base64: data, filename: name, mime: blob.type || 'video/webm' });
      }).then(function (result) {
        UI.toast('Gallery me save ho gaya ✅', { tone: 'ok' });
        return result && result.uri ? result.uri : name;
      });
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    UI.toast('Video download ho gaya (browser mode)', { tone: 'ok' });
    return Promise.resolve(name);
  }

  function status(html) {
    var host = document.getElementById('videoStatus');
    if (host) host.innerHTML = html;
  }

  function progress(value, elapsed, total) {
    var bar = document.getElementById('videoBar');
    if (bar) bar.style.width = Math.round(value * 100) + '%';
    status('<p class="muted small">Recording ' + elapsed.toFixed(1) + 's / ' + total.toFixed(1) + 's</p>');
  }

  function finish(blob, title) {
    state.blob = blob;
    var url = URL.createObjectURL(blob);
    var host = document.getElementById('videoResult');
    if (host) {
      host.hidden = false;
      host.innerHTML = '<div class="card"><div class="card-head"><h2>' + UI.esc(title) + '</h2>' +
        '<span class="pill ok">' + Math.round(blob.size / 1024) + ' KB</span></div>' +
        '<video class="video-result" controls playsinline src="' + url + '"></video>' +
        '<div class="card-actions">' +
        '<button class="btn btn-primary btn-sm" id="videoSave">Save to gallery</button>' +
        '<button class="btn btn-ghost btn-sm" id="videoShare">Share</button>' +
        '</div></div>';
    }
    status('');
    var saveBtn = document.getElementById('videoSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveToGallery(blob, title).catch(function (error) {
          UI.toast('Save fail: ' + error.message, { tone: 'warn' });
        });
      });
    }
    var shareBtn = document.getElementById('videoShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (N.available && N.share) {
          N.share('JARVIS se bana video').catch(function () {});
        } else if (navigator.share) {
          navigator.share({ title: title, text: 'JARVIS video' }).catch(function () {});
        } else {
          UI.toast('Share is device par available nahi', { tone: 'warn' });
        }
      });
    }
    var stage = document.getElementById('videoStage');
    if (stage) stage.hidden = true;
  }

  function create(prompt, options) {
    options = options || {};
    var size = SIZES[options.size] || SIZES.vertical;
    if (state.busy) return Promise.reject(new Error('Ek video pehle se ban raha hai.'));
    if (!LLM.isReady()) return Promise.reject(new Error('Settings → AI provider me key daalo.'));
    state.busy = true;
    state.blob = null;
    var result = document.getElementById('videoResult');
    if (result) result.hidden = true;
    status('<p class="muted small">Script likh raha hoon…</p>');
    return planVideo(prompt).then(function (plan) {
      state.scenes = plan.scenes;
      status('<p class="muted small">' + plan.scenes.length + ' scenes render ho rahe hain…</p>');
      return record(plan.scenes, size, progress).then(function (blob) {
        return saveToGallery(blob, plan.title).then(function () {
          return { blob: blob, title: plan.title, plan: plan };
        }, function () {
          return { blob: blob, title: plan.title, plan: plan };
        });
      });
    }).then(function (out) {
      state.busy = false;
      finish(out.blob, out.title);
      return out;
    }).catch(function (error) {
      state.busy = false;
      status('<p class="small" style="color:var(--bad)">' + UI.esc(error.message) + '</p>');
      throw error;
    });
  }

  function stop() {
    state.cancel = true;
    if (state.recorder && state.recorder.state !== 'inactive') {
      try { state.recorder.stop(); } catch (error) { /* ignore */ }
    }
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function screen() {
    var ready = canRecord();
    return '<section class="screen video-screen">' +
      '<div class="screen-head"><h1>Video studio</h1>' +
      '<p>Prompt do — script, scenes aur video ban jayega, gallery me khud save hoga.</p></div>' +
      '<div class="card"><div class="card-head"><h2>' + UI.icon('play') + 'Naya video</h2></div>' +
      '<label class="field"><span>Video kis baare me hai?</span>' +
      '<textarea id="videoPrompt" rows="3" placeholder="Jaise: 5 tips jo har student ko exam se pehle pata hone chahiye"></textarea></label>' +
      '<label class="field"><span>Size</span><select id="videoSize">' +
      Object.keys(SIZES).map(function (key) {
        return '<option value="' + key + '">' + UI.esc(SIZES[key].label) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="card-actions"><button class="btn btn-primary" id="videoStart">' + UI.icon('bolt') + 'Video banao</button>' +
      '<button class="btn btn-ghost" id="videoStop" hidden>Stop</button></div>' +
      '<div class="video-bar"><span id="videoBar"></span></div>' +
      '<div id="videoStatus"></div>' +
      '<div id="videoStage" hidden></div></div>' +
      '<div id="videoResult" hidden></div>' +
      (ready ? '' : '<div class="card"><p class="muted small">Is WebView me video recording support nahi mila. Android app build me ye kaam karta hai.</p></div>') +
      '<div class="card"><div class="card-head"><h2>' + UI.icon('info') + 'Seedhi baat</h2></div>' +
      '<p class="small muted">Ye slideshow-style video hai: AI script + animated text scenes + WebM output, phone gallery me ' +
      'Movies/JARVIS me save. Real AI footage (jaise Veo/Runway) ke liye alag paid API key chahiye — tabhi sach me footage banega.</p></div>' +
      '</section>';
  }

  function mount() {
    var start = document.getElementById('videoStart');
    var stopBtn = document.getElementById('videoStop');
    if (!start) return;
    start.addEventListener('click', function () {
      var prompt = (document.getElementById('videoPrompt') || {}).value || '';
      var size = (document.getElementById('videoSize') || {}).value || 'vertical';
      if (!prompt.trim()) {
        UI.toast('Pehle topic likho', { tone: 'warn' });
        return;
      }
      start.disabled = true;
      if (stopBtn) stopBtn.hidden = false;
      create(prompt, { size: size }).then(function () {
        start.disabled = false;
        if (stopBtn) stopBtn.hidden = true;
      }).catch(function () {
        start.disabled = false;
        if (stopBtn) stopBtn.hidden = true;
      });
    });
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        stop();
        stopBtn.hidden = true;
        start.disabled = false;
      });
    }
  }

  window.JarvisVideo = {
    screen: screen,
    mount: mount,
    create: create,
    plan: planVideo,
    stop: stop,
    canRecord: canRecord
  };

  window.addEventListener('hashchange', function () {
    if (location.hash.indexOf('#/video') !== 0) stop();
  });
})();
