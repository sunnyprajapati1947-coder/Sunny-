/* JARVIS — Model manager: download, verify, import and load the on-device
   Qwen3.5 brain. Every state shown here comes from the real cache, not from a
   flag that could be stale. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var B = window.JarvisLocalBrain;
  var Model = window.JarvisModel;

  var state = {
    busy: '',
    progress: null,
    error: '',
    result: '',
    device: '',
    inspected: null,
    diag: null,
    diagBusy: false,
    verifying: false,
    verifyResult: null,
    importNote: '',
    inspecting: false
  };

  function pill(text, tone) {
    return '<span class="pill ' + (tone || '') + '">' + UI.esc(text) + '</span>';
  }

  function mb(bytes) {
    return Math.round((Number(bytes) || 0) / 1048576);
  }

  function deviceLine() {
    if (state.device === 'webgpu') return 'The phone GPU (WebGPU) runs the model — the fastest path.';
    if (state.device === 'wasm') return 'The phone CPU (WASM, single thread) runs the model — slower but stable.';
    return 'Hardware is detected when the model loads.';
  }

  function fileRows(info) {
    if (!info || !info.files || !info.files.length) return '';
    return '<div class="stack-list">' + info.files.map(function (file) {
      return '<div class="row"><span class="row-main"><code>' + UI.esc(file.path) + '</code></span>' +
        '<span class="row-side">' + (file.present
          ? pill('on phone', 'ok')
          : (file.optional ? pill('optional', '') : pill('missing', 'warn'))) + '</span></div>';
    }).join('') + '</div>';
  }

  function progressBar() {
    var progress = state.progress;
    if (!progress) return '';
    return '<div class="video-bar"><span style="width:' + Math.min(100, progress.pct || 0) + '%"></span></div>' +
      '<p class="muted small">' + (progress.pct || 0) + '% · ' +
      (progress.loadedMb || 0) + ' / ' + (progress.totalMb || 0) + ' MB' +
      (progress.speedMb ? ' · ' + progress.speedMb + ' MB/s' : '') +
      (progress.eta ? ' · ~' + Math.round(progress.eta) + 's left' : '') +
      (progress.file ? ' · ' + UI.esc(progress.file.split('/').pop()) + ' (' + UI.esc(progress.step || '') + ')' : '') +
      '</p>';
  }

  function diagBlock() {
    if (state.diagBusy) return '<p class="muted small">Checking the model sources…</p>';
    if (!state.diag) return '';
    var env = state.diag.environment || {};
    var rows = (state.diag.sources || []).map(function (source) {
      var host = source.url.split('/resolve/')[0].replace(/^https?:\/\//, '');
      var tone = source.ok ? 'ok' : 'warn';
      return '<div class="row"><span class="row-main">' + UI.esc(host) +
        (source.url.indexOf('download=true') > 0 ? ' (attachment)' : '') + '</span>' +
        '<span class="row-side">' + pill(source.ok ? ('HTTP ' + source.status + ' · ' + source.ms + ' ms')
          : (source.error ? 'blocked' : 'HTTP ' + source.status), tone) + '</span></div>';
    }).join('');
    return '<div class="stack-list">' + rows + '</div>' +
      '<p class="muted small">Cache: ' + (env.cache ? 'available' : 'missing') +
      ' · WebGPU: ' + (env.webgpu ? 'yes' : 'no') +
      ' · gzip: ' + (env.decompression ? 'yes' : 'no') +
      ' · storage used ' + (env.usageMb || 0) + ' of ' + (env.quotaMb || 0) + ' MB</p>' +
      (state.diag.log && state.diag.log.length
        ? '<p class="muted small">Last errors: ' + UI.esc(state.diag.log.map(function (row) {
          return row.error;
        }).join(' · ')) + '</p>'
        : '');
  }

  function screen() {
    var info = state.inspected;
    var ready = info && info.ready;
    var loaded = B.isReady();
    var totalMb = info ? mb(info.totalBytes) : 490;
    var haveMb = info ? mb(info.presentBytes) : 0;

    return '<section class="screen brain-screen">' +
      '<div class="screen-head"><h1>Local brain</h1>' +
      '<p>Qwen3.5 lives inside this phone. Download once, then every answer is generated here — no cloud, no API key.</p></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('brain') + 'Status</h2>' +
      (loaded ? pill('loaded', 'ok') : (ready ? pill('installed', 'ok') : pill('not installed', 'warn'))) +
      '</div>' +
      '<p class="muted small">' + UI.esc(deviceLine()) + '</p>' +
      '<p class="muted small">' + haveMb + ' of ' + totalMb + ' MB on the phone' +
      (info && info.missing && info.missing.length
        ? ' · missing ' + info.missing.map(function (file) { return file.path.split('/').pop(); }).join(', ')
        : '') + '</p>' +
      (state.error ? '<p class="small" style="color:var(--bad)">' + UI.esc(state.error) + '</p>' : '') +
      (state.result ? '<p class="small">' + UI.esc(state.result) + '</p>' : '') +
      progressBar() +
      '<div class="card-actions">' +
      (state.busy === 'download'
        ? '<button class="btn btn-ghost btn-sm" id="brainCancel">Cancel download</button>'
        : '<button class="btn btn-primary btn-sm" id="brainDownload"' + (state.busy ? ' disabled' : '') + '>' +
          (ready ? 'Re-download' : 'Download ' + totalMb + ' MB') + '</button>') +
      '<button class="btn btn-ghost btn-sm" id="brainTest"' + (state.busy || !ready ? ' disabled' : '') + '>Test reply</button>' +
      '<button class="btn btn-ghost btn-sm" id="brainRelease">Free memory</button>' +
      '</div>' +
      '<div class="card-actions">' +
      '<button class="btn btn-ghost btn-sm" id="brainDiag">' + UI.icon('info') + 'Diagnose</button>' +
      '<button class="btn btn-ghost btn-sm" id="brainImport">Import from storage</button>' +
      '<button class="btn btn-ghost btn-sm" id="brainVerify">Verify files</button>' +
      '</div>' +
      (state.verifyResult ? '<p class="muted small">' + UI.esc(state.verifyResult) + '</p>' : '') +
      diagBlock() +
      '</div>' +

      (info ? '<div class="card"><div class="card-head"><h2>' + UI.icon('list') + 'Files</h2>' +
        pill(ready ? 'complete' : 'incomplete', ready ? 'ok' : 'warn') + '</div>' +
        fileRows(info) + '</div>' : '') +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('download') + 'Offline install</h2></div>' +
      '<p class="muted small">No internet at all? Download the model on a computer from ' +
      '<code>' + UI.esc(Model.MODELS[0].repo) + '</code> (files: <code>config.json</code>, ' +
      '<code>generation_config.json</code>, <code>tokenizer.json</code>, <code>tokenizer_config.json</code>, ' +
      'and the <code>onnx/model_q4*.onnx</code> pair), copy them to the phone, then tap Import and pick them.</p>' +
      '<input type="file" id="brainFiles" multiple hidden>' +
      (state.importNote ? '<p class="muted small">' + UI.esc(state.importNote) + '</p>' : '') +
      '<button class="btn btn-ghost btn-sm" id="brainImport2">Choose files</button></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('info') + 'Custom source</h2></div>' +
      '<p class="muted small">If huggingface.co is blocked on your network, paste a mirror that serves the same ' +
      'repository layout (for example <code>hf-mirror.com</code>). JARVIS tries the official host first, then this mirror.</p>' +
      '<label class="field"><span>Mirror host</span>' +
      '<div class="field-row"><input id="brainMirror" type="text" spellcheck="false" placeholder="hf-mirror.com" value="' +
      UI.esc((Model.mirror()[0] || '').replace(/^https?:\/\//, '').replace(/\/$/, '')) + '">' +
      '<button class="btn btn-ghost btn-sm" id="brainMirrorSave">Save</button></div></label></div>' +

      '<div class="card"><div class="card-head"><h2>' + UI.icon('shield') + 'Straight talk</h2></div>' +
      '<p class="small muted">Qwen3.5 0.8B is a real language model but a small one: about 1.4 GB of RAM and ' +
      '2–6 words per second on a phone CPU. It is good at everyday questions, short code and summaries. ' +
      'It will not match a data-centre model, and it never sends your text anywhere.</p></div>' +
      '</section>';
  }

  function refresh() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function inspect() {
    var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
    return Model.inspect(model, state.device || 'wasm').then(function (info) {
      state.inspected = info;
      return info;
    });
  }

  function detect() {
    if (!navigator.gpu || !navigator.gpu.requestAdapter) {
      state.device = 'wasm';
      return Promise.resolve();
    }
    return navigator.gpu.requestAdapter().then(function (adapter) {
      state.device = adapter ? 'webgpu' : 'wasm';
    }).catch(function () { state.device = 'wasm'; });
  }

  function startDownload() {
    state.busy = 'download';
    state.error = '';
    state.result = '';
    var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
    refresh();
    detect().then(function () {
      return Model.download(model, {
        device: state.device || 'wasm',
        onProgress: function (p) {
          state.progress = {
            pct: p.pct,
            loadedMb: Math.round((p.loadedBytes || 0) / 1048576),
            totalMb: Math.round((p.totalBytes || 0) / 1048576),
            speedMb: Math.round((p.speed || 0) / 1048576 * 10) / 10,
            eta: p.eta,
            file: p.file,
            step: p.fileIndex + '/' + p.fileCount
          };
          var bar = document.querySelector('.brain-screen .video-bar span');
          if (bar) bar.style.width = Math.min(100, state.progress.pct) + '%';
          var note = document.querySelector('.brain-screen .video-bar + p');
          if (note) {
            note.textContent = state.progress.pct + '% · ' + state.progress.loadedMb + ' / ' +
              state.progress.totalMb + ' MB · ' + state.progress.speedMb + ' MB/s';
          }
        }
      });
    }).then(function (info) {
      state.busy = '';
      state.progress = null;
      state.inspected = info;
      state.result = info.ready ? 'All model files are on the phone. Tap Test reply.' : 'Download finished but files are still missing.';
      UI.toast(info.ready ? 'Model installed on the phone' : 'Model incomplete', { tone: info.ready ? 'ok' : 'warn' });
      refresh();
    }).catch(function (error) {
      state.busy = '';
      state.progress = null;
      state.error = String(error.message || error);
      refresh();
    });
  }

  function testReply() {
    state.busy = 'test';
    state.result = 'Loading the model into memory…';
    refresh();
    var started = Date.now();
    B.prepare(null, function (p) {
      state.progress = p;
      refresh();
    }).then(function () {
      state.result = 'Loaded in ' + ((Date.now() - started) / 1000).toFixed(1) + 's. Generating…';
      refresh();
      var t0 = Date.now();
      return B.generate({
        system: 'You are JARVIS, running on a phone. Answer in one short sentence.',
        messages: [{ role: 'user', content: 'Say: Jarvis is ready, boss' }],
        maxTokens: 40,
        temperature: 0.2
      }).then(function (text) {
        var secs = Math.max(0.2, (Date.now() - t0) / 1000);
        var words = String(text).trim().split(/\s+/).length;
        state.result = 'Reply: "' + String(text).trim().slice(0, 180) + '" · ' +
          (words / secs).toFixed(1) + ' words/sec, on device.';
      });
    }).catch(function (error) {
      state.result = 'Failed: ' + error.message;
    }).then(function () {
      state.busy = '';
      state.progress = null;
      refresh();
    });
  }

  function mount() {
    var download = document.getElementById('brainDownload');
    if (download) download.addEventListener('click', startDownload);
    var cancel = document.getElementById('brainCancel');
    if (cancel) cancel.addEventListener('click', function () { Model.cancel(); state.busy = ''; state.progress = null; refresh(); });
    var test = document.getElementById('brainTest');
    if (test) test.addEventListener('click', testReply);
    var release = document.getElementById('brainRelease');
    if (release) release.addEventListener('click', function () {
      B.release().then(function () {
        state.result = 'Model memory freed. The files stay on the phone.';
        refresh();
      });
    });
    var diag = document.getElementById('brainDiag');
    if (diag) diag.addEventListener('click', function () {
      state.diagBusy = true;
      refresh();
      var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
      Model.diagnose(model).then(function (result) {
        state.diag = result;
        state.diagBusy = false;
        refresh();
      }).catch(function (error) {
        state.diagBusy = false;
        state.diag = { sources: [], environment: {}, log: [{ error: error.message }] };
        refresh();
      });
    });
    var verify = document.getElementById('brainVerify');
    if (verify) verify.addEventListener('click', function () {
      state.verifying = true;
      state.verifyResult = 'Hashing every model file (this can take a minute)…';
      refresh();
      var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
      Model.verify(model, { device: state.device || 'wasm' }).then(function (rows) {
        var bad = rows.filter(function (row) { return !row.ok; });
        state.verifying = false;
        state.verifyResult = !rows.length
          ? 'No checksums available for the installed files.'
          : (bad.length ? 'Checksum failed for ' + bad.map(function (row) { return row.path; }).join(', ')
            : 'All ' + rows.length + ' checksummed files match the official SHA-256.');
        refresh();
      });
    });
    var pick = function () { var input = document.getElementById('brainFiles'); if (input) input.click(); };
    var importBtn = document.getElementById('brainImport');
    if (importBtn) importBtn.addEventListener('click', pick);
    var importBtn2 = document.getElementById('brainImport2');
    if (importBtn2) importBtn2.addEventListener('click', pick);
    var files = document.getElementById('brainFiles');
    if (files) files.addEventListener('change', function () {
      var list = files.files;
      if (!list || !list.length) return;
      state.importNote = 'Importing ' + list.length + ' file(s)…';
      refresh();
      var model = Model.find(UI.storeGet('local.model', '') || Model.MODELS[0].id);
      Model.importFiles(list, model, state.device || 'wasm').then(function (result) {
        state.importNote = 'Imported ' + result.imported.length + ' file(s)' +
          (result.unknown.length ? ' · ignored ' + result.unknown.length + ' unknown file(s)' : '') +
          (result.status.ready ? ' · the model is ready' : ' · still missing files');
        state.inspected = result.status;
        refresh();
      }).catch(function (error) {
        state.importNote = 'Import failed: ' + error.message;
        refresh();
      });
    });
    var save = document.getElementById('brainMirrorSave');
    if (save) save.addEventListener('click', function () {
      var input = document.getElementById('brainMirror');
      Model.setMirror(input ? input.value.trim() : '');
      UI.toast('Mirror saved', { tone: 'ok' });
      refresh();
    });

    if (!state.inspected && !state.inspecting) {
      state.inspecting = true;
      inspect().then(function () {
        state.inspecting = false;
        refresh();
      }).catch(function () { state.inspecting = false; });
    }
  }

  window.JarvisBrainUI = { screen: screen, mount: mount, inspect: inspect };
})();
