/* JARVIS — Local brain screen: download, load and test Qwen3.5 on the phone. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var LLM = window.JarvisLLM;
  var B = window.JarvisLocalBrain;

  var state = { busy: '', progress: null, error: '', result: '', tps: 0 };

  function pill(text, tone) {
    return '<span class="pill ' + (tone || '') + '">' + UI.esc(text) + '</span>';
  }

  function deviceLine(status) {
    if (!status.device) return 'Hardware is checked when you load the model.';
    return status.device === 'webgpu'
      ? 'Running on the phone GPU (WebGPU) — fastest option.'
      : 'Running on the phone CPU (WASM) — works everywhere, slower.';
  }

  function modelCard(model) {
    var status = B.status();
    var isSelected = status.model.id === model.id;
    var isDownloaded = !!UI.storeGet('local.ready.' + model.id, false);
    var isLoaded = status.loaded && status.loadedId === model.id;
    var badge = model.badge === 'latest' ? pill('latest Qwen', 'ok')
      : model.badge === 'custom' ? pill('custom', 'warn') : '';
    var size = model.sizeMb ? 'Download ~' + model.sizeMb + ' MB · RAM ~' +
      (model.ramMb / 1024).toFixed(1) + ' GB' : 'Size depends on the repository you pasted.';
    return '<article class="card brain-card' + (isSelected ? ' is-selected' : '') + '" data-model-card="' + model.id + '">' +
      '<div class="card-head"><h2>' + UI.esc(model.label) + ' ' + badge + '</h2></div>' +
      '<p class="muted small">' + UI.esc(model.note) + '</p>' +
      '<p class="muted small">' + UI.esc(size) + '</p>' +
      '<div class="card-actions">' +
      '<button class="btn ' + (isSelected ? 'btn-ghost' : 'btn-primary') + ' btn-sm" data-pick="' + model.id + '">' +
      (isSelected ? 'Selected' : 'Select') + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-prepare="' + model.id + '"' + (state.busy ? ' disabled' : '') + '>' +
      (isLoaded ? 'Reload' : (isDownloaded ? 'Load' : 'Download & load')) + '</button>' +
      (isSelected && isLoaded ? '<button class="btn btn-ghost btn-sm" id="brainUse">Use for chat</button>' : '') +
      '</div></article>';
  }

  function screen() {
    var status = B.status();
    var rows = B.all().map(modelCard).join('');
    var progress = state.progress || status.progress;
    var bar = progress
      ? '<div class="video-bar"><span style="width:' + Math.min(100, progress.pct || 0) + '%"></span></div>' +
        '<p class="muted small">Downloading ' + (progress.pct || 0) + '% · ' +
        (progress.loadedMb || 0) + ' / ' + (progress.totalMb || 0) + ' MB' +
        (progress.file ? ' · ' + UI.esc(progress.file.split('/').pop()) : '') + '</p>'
      : '';

    return '<section class="screen brain-screen">' +
      '<div class="screen-head"><h1>Local brain</h1>' +
      '<p>Qwen3.5 runs inside this phone. Download once, then it answers with no internet at all.</p></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('brain') + 'Status</h2>' +
      (status.loaded ? pill('loaded', 'ok') : (status.downloaded ? pill('downloaded', 'ok') : pill('not ready', 'warn'))) +
      '</div>' +
      '<p class="muted small">' + UI.esc(deviceLine(status)) + '</p>' +
      (status.error ? '<p class="small" style="color:var(--bad)">' + UI.esc(status.error) + '</p>' : '') +
      bar +
      (state.result ? '<p class="small" id="brainResult">' + UI.esc(state.result) + '</p>' : '') +
      '<div class="card-actions">' +
      '<button class="btn btn-primary btn-sm" id="brainTest"' + (state.busy ? ' disabled' : '') + '>Test reply</button>' +
      '<button class="btn btn-ghost btn-sm" id="brainRelease">Free memory</button>' +
      '<button class="btn btn-ghost btn-sm" id="brainClear">Delete downloads</button>' +
      '</div></div>' +

      rows +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('info') + 'Paste a model repository</h2></div>' +
      '<p class="muted small">Any Transformers.js-compatible ONNX repository on Hugging Face works, for example ' +
      '<code>onnx-community/Qwen3.5-0.8B-Text-ONNX</code>. Bigger models need more RAM and download time.</p>' +
      '<label class="field"><span>Repository</span>' +
      '<div class="field-row"><input id="brainRepo" type="text" spellcheck="false" placeholder="owner/model-ONNX" value="' +
      UI.esc((B.custom() || {}).repo || '') + '">' +
      '<button class="btn btn-ghost btn-sm" id="brainRepoSave">Use</button></div></label></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('info') + 'Straight talk</h2></div>' +
      '<p class="small muted">The model downloads straight from Hugging Face to this phone — no server in between. ' +
      'After that everything runs offline. Qwen3.5 0.8B needs roughly 1.4 GB of RAM and answers at about ' +
      '2–6 tokens/second on the CPU, faster with WebGPU. It is a small model: good for everyday questions, ' +
      'not a replacement for a big cloud model.</p></div>' +
      '</section>';
  }

  function refresh() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function prepare(id) {
    state.busy = id;
    state.error = '';
    B.select(id);
    B.prepare(id, function (progress) {
      state.progress = progress;
      var host = document.querySelector('.brain-screen .video-bar span');
      if (host) host.style.width = Math.min(100, progress.pct || 0) + '%';
    }).then(function () {
      state.progress = null;
      state.busy = '';
      UI.toast('Local brain is ready', { tone: 'ok' });
      refresh();
    }).catch(function (error) {
      state.progress = null;
      state.busy = '';
      state.error = error.message;
      UI.toast(error.message, { tone: 'warn' });
      refresh();
    });
  }

  function seconds(started) {
    return ((Date.now() - started) / 1000).toFixed(1) + 's';
  }

  function mount() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-pick]'), function (button) {
      button.addEventListener('click', function () {
        B.select(button.getAttribute('data-pick'));
        refresh();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-prepare]'), function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        prepare(button.getAttribute('data-prepare'));
      });
    });
    var save = document.getElementById('brainRepoSave');
    if (save) save.addEventListener('click', function () {
      var input = document.getElementById('brainRepo');
      var model = B.setCustom(input ? input.value : '');
      state.result = model.custom
        ? 'Custom repository selected: ' + model.repo
        : 'Custom repository cleared. Default Qwen3.5 model selected.';
      refresh();
    });
    var use = document.getElementById('brainUse');
    if (use) use.addEventListener('click', function () {
      LLM.save({ provider: 'local', model: B.selected().id });
      UI.toast('Chat now uses the on-device Qwen model', { tone: 'ok' });
      refresh();
    });
    var test = document.getElementById('brainTest');
    if (test) test.addEventListener('click', function () {
      test.disabled = true;
      state.result = 'Running a test…';
      var started = Date.now();
      LLM.save({ provider: 'local', model: B.selected().id });
      B.ensureLoaded().then(function () {
        state.result = 'Model loaded in ' + seconds(started) + '. Generating a reply…';
        refresh();
        var t0 = Date.now();
        return B.generate({
          system: 'You are JARVIS on a phone. Reply in one short line.',
          messages: [{ role: 'user', content: 'Say: Jarvis is ready, boss' }],
          maxTokens: 40,
          temperature: 0.2
        }).then(function (text) {
          var secs = Math.max(0.2, (Date.now() - t0) / 1000);
          state.tps = Math.round((text.split(/\s+/).length / secs) * 10) / 10;
          state.result = 'Reply: "' + text.trim().slice(0, 160) + '" · ~' + state.tps + ' words/sec';
        });
      }).catch(function (error) {
        state.result = 'Failed: ' + error.message;
      }).then(function () {
        test.disabled = false;
        refresh();
      });
    });
    var release = document.getElementById('brainRelease');
    if (release) release.addEventListener('click', function () {
      B.release().then(function () {
        state.result = 'Memory freed. Tap Load to bring the model back.';
        refresh();
      });
    });
    var clear = document.getElementById('brainClear');
    if (clear) clear.addEventListener('click', function () {
      if (!window.confirm('Delete the downloaded model? It will have to be downloaded again.')) return;
      B.clearCache().then(function () {
        state.result = 'Model files deleted.';
        refresh();
      });
    });
  }

  window.JarvisBrainUI = { screen: screen, mount: mount };
})();
