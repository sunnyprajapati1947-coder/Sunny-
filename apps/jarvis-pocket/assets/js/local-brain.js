/* JARVIS — on-device brain: Qwen3.5 (the latest Qwen generation) running inside
   the app through Transformers.js + ONNX Runtime Web. Downloaded once, then it
   answers with no internet connection at all. */
(function () {
  'use strict';

  var UI = window.JarvisUI;

  var VENDOR = 'vendor/transformers/';
  var LIB_FILE = 'transformers.web.min.js.gz';
  var ORT_FILE = 'ort.bundle.min.mjs';
  var WASM_FILE = 'ort-wasm-simd-threaded.jsep.wasm';
  var MJS_FILE = 'ort-wasm-simd-threaded.jsep.mjs';

  var KEY_MODEL = 'local.model';
  var KEY_READY = 'local.ready.';
  var KEY_CUSTOM = 'local.custom';

  var CATALOG = [
    {
      id: 'qwen3.5-0.8b',
      label: 'Qwen3.5 0.8B',
      badge: 'latest',
      repo: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
      sizeMb: 490,
      ramMb: 1400,
      note: 'Latest Qwen family, text build. Fits a 4 GB phone; answers offline.',
      recommended: true
    }
  ];

  var state = {
    lib: null,
    libPromise: null,
    pipe: null,
    loadedId: '',
    loadingId: '',
    device: '',
    webgpu: false,
    progress: null,
    error: '',
    promptTimer: 0
  };

  var queue = Promise.resolve();

  function catalog() { return CATALOG.slice(); }

  function custom() {
    var repo = String(UI.storeGet(KEY_CUSTOM, '') || '');
    if (!repo) return null;
    return {
      id: 'custom',
      label: repo.split('/').pop(),
      badge: 'custom',
      repo: repo,
      sizeMb: 0,
      ramMb: 0,
      note: 'Custom Transformers.js repository: ' + repo,
      recommended: false,
      custom: true
    };
  }

  function all() {
    var rows = catalog();
    var extra = custom();
    if (extra) rows.push(extra);
    return rows;
  }

  function find(id) {
    return all().filter(function (model) { return model.id === id; })[0] || null;
  }

  function selected() {
    var id = UI.storeGet(KEY_MODEL, '') || 'qwen3.5-0.8b';
    return find(id) || CATALOG[0];
  }

  function select(id) {
    if (!find(id)) return selected();
    UI.storeSet(KEY_MODEL, id);
    return selected();
  }

  function setCustom(repo) {
    var clean = String(repo || '').trim().replace(/^https?:\/\/huggingface\.co\//, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) {
      UI.storeRemove(KEY_CUSTOM);
      UI.storeSet(KEY_MODEL, 'qwen3.5-0.8b');
      return selected();
    }
    UI.storeSet(KEY_CUSTOM, clean);
    UI.storeSet(KEY_MODEL, 'custom');
    return selected();
  }

  function downloaded(id) {
    return !!UI.storeGet(KEY_READY + id, false);
  }

  function status() {
    var model = selected();
    return {
      model: model,
      downloaded: downloaded(model.id),
      loaded: !!state.pipe && state.loadedId === model.id,
      loadedId: state.loadedId,
      loading: state.loadingId,
      device: state.device,
      webgpu: state.webgpu,
      progress: state.progress,
      error: state.error,
      canRun: !!(window.WebAssembly),
      custom: custom()
    };
  }

  function friendly(error) {
    var message = String((error && error.message) || error || 'unknown error');
    if (/out of memory|OOM|Allocation failed|memory access out of bounds|RangeError/i.test(message)) {
      return 'The phone ran out of memory. Close other apps, then try again — or use a smaller model.';
    }
    if (/Failed to fetch|NetworkError|network error|ECONN|Load failed|404|403/i.test(message)) {
      return 'The model download failed (no internet, or the file was blocked). Connect to Wi-Fi and retry.';
    }
    if (/SharedArrayBuffer|threads/i.test(message)) {
      return 'This browser cannot use WASM threads. It will fall back to single-thread mode.';
    }
    if (/WebGPU|adapter|GPUDevice/i.test(message)) {
      return 'WebGPU is unavailable, so the CPU path is used (slower but it works).';
    }
    if (/Missing|tokenizer|config\.json|model\.onnx/i.test(message)) {
      return 'This repository does not contain a Transformers.js compatible model. Try the default Qwen3.5 model.';
    }
    if (/Importing a module script failed|Failed to fetch dynamically imported module|MIME/i.test(message)) {
      return 'The local engine files could not be loaded. Reinstall the app (or reload the page) and try again.';
    }
    return message.slice(0, 240);
  }

  function vendorUrl(file) {
    return new URL(VENDOR + file, document.baseURI).href;
  }

  function engineSource() {
    var url = vendorUrl(LIB_FILE);
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('engine download failed: HTTP ' + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (!gzipped) {
        // A proxy already decompressed it, or the build shipped plain JS.
        return new TextDecoder().decode(bytes);
      }
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('this WebView is too old for the on-device engine (DecompressionStream is missing)');
      }
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text();
    }).then(function (code) {
      // Resolve the two bare module specifiers to the vendored ONNX Runtime,
      // so the engine never reaches out to a CDN.
      var ortUrl = vendorUrl(ORT_FILE);
      return code
        .replace(/from"onnxruntime-common"/g, 'from"' + ortUrl + '"')
        .replace(/from"onnxruntime-web\/webgpu"/g, 'from"' + ortUrl + '"');
    });
  }

  function configureOrt(ort) {
    if (!ort || !ort.env || !ort.env.wasm) return;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = {
      wasm: vendorUrl(WASM_FILE),
      mjs: vendorUrl(MJS_FILE)
    };
  }

  function loadLibrary() {
    if (state.lib) return Promise.resolve(state.lib);
    if (state.libPromise) return state.libPromise;
    state.libPromise = Promise.all([import(vendorUrl(ORT_FILE)), engineSource()]).then(function (loaded) {
      var ort = loaded[0];
      configureOrt(ort);
      var blobUrl = URL.createObjectURL(new Blob([loaded[1]], { type: 'text/javascript' }));
      return import(blobUrl).then(function (mod) {
        var env = mod.env;
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        // The backend copies the ONNX env on first use; keep both in sync.
        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
          env.backends.onnx.wasm.numThreads = 1;
          env.backends.onnx.wasm.proxy = false;
          env.backends.onnx.wasm.wasmPaths = {
            wasm: vendorUrl(WASM_FILE),
            mjs: vendorUrl(MJS_FILE)
          };
        }
        state.lib = mod;
        return mod;
      });
    }).catch(function (error) {
      state.libPromise = null;
      throw new Error('The local engine could not start: ' + friendly(error));
    });
    return state.libPromise;
  }

  function detectDevice() {
    if (state.device) return Promise.resolve(state.device);
    if (!navigator.gpu || !navigator.gpu.requestAdapter) {
      state.device = 'wasm';
      return Promise.resolve(state.device);
    }
    return navigator.gpu.requestAdapter().then(function (adapter) {
      state.webgpu = !!adapter;
      state.device = adapter ? 'webgpu' : 'wasm';
      return state.device;
    }).catch(function () {
      state.device = 'wasm';
      return Promise.resolve(state.device);
    });
  }

  function trackProgress(onProgress) {
    var files = {};
    return function (event) {
      if (event && event.status) {
        if (event.status === 'progress' && event.file) {
          files[event.file] = { loaded: event.loaded || 0, total: event.total || 0 };
        } else if (event.status === 'done' && event.file) {
          files[event.file] = { loaded: event.total || 0, total: event.total || 0 };
        }
      }
      var loaded = 0;
      var total = 0;
      Object.keys(files).forEach(function (name) {
        loaded += files[name].loaded;
        total += files[name].total;
      });
      var pct = total ? Math.round((loaded / total) * 100) : 0;
      state.progress = {
        pct: pct,
        loadedMb: Math.round(loaded / 1048576),
        totalMb: Math.round(total / 1048576),
        file: (event && event.file) || ''
      };
      if (onProgress) onProgress(state.progress);
    };
  }

  function prepare(id, onProgress) {
    var model = find(id) || selected();
    if (state.pipe && state.loadedId === model.id) return Promise.resolve(status());
    if (state.loadingId) return Promise.reject(new Error('A model is already loading. Wait for it to finish.'));

    state.loadingId = model.id;
    state.error = '';
    state.progress = { pct: 0, loadedMb: 0, totalMb: model.sizeMb || 0, file: '' };

    return loadLibrary().then(function (mod) {
      return detectDevice().then(function (device) {
        var dtype = device === 'webgpu' ? 'q4f16' : 'q4';
        return mod.pipeline('text-generation', model.repo, {
          dtype: dtype,
          device: device,
          progress_callback: trackProgress(onProgress)
        }).then(function (pipe) {
          if (state.pipe && state.pipe.dispose) {
            try { state.pipe.dispose(); } catch (error) { /* ignore */ }
          }
          state.pipe = pipe;
          state.loadedId = model.id;
          state.loadingId = '';
          state.progress = null;
          UI.storeSet(KEY_READY + model.id, true);
          UI.storeSet(KEY_MODEL, model.id);
          return status();
        });
      });
    }).catch(function (error) {
      state.loadingId = '';
      state.progress = null;
      state.error = friendly(error);
      throw new Error(state.error);
    });
  }

  function stripThink(text) {
    return String(text || '')
      .replace(/<think[\s\S]*?<\/think>/gi, '')
      .replace(/<\|im_end\|>/g, '')
      .replace(/^\s+/, '');
  }

  function outputText(out) {
    if (!out) return '';
    var first = Array.isArray(out) ? out[0] : out;
    if (!first) return '';
    if (typeof first === 'string') return first;
    if (first.generated_text !== undefined) {
      var value = first.generated_text;
      if (Array.isArray(value)) {
        var last = value[value.length - 1];
        return typeof last === 'string' ? last : (last && last.content) || '';
      }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') return value.content || '';
    }
    if (Array.isArray(first) && first.length) {
      var tail = first[first.length - 1];
      return typeof tail === 'string' ? tail : (tail && tail.content) || '';
    }
    return '';
  }

  function generate(options) {
    options = options || {};
    var model = selected();
    var messages = [];
    if (options.system) messages.push({ role: 'system', content: String(options.system) });
    (options.messages || []).forEach(function (message) {
      if (!message || !message.content) return;
      messages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: String(message.content)
      });
    });
    if (!messages.length) return Promise.reject(new Error('Type a message first.'));

    var run = function () {
      return prepare(model.id).then(function () {
        return state.lib.TextStreamer ? new state.lib.TextStreamer(state.pipe.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: function (token) {
            if (options.onDelta) options.onDelta(token);
          }
        }) : undefined;
      }).then(function (streamer) {
        var maxTokens = Math.min(1024, Math.max(32, options.maxTokens || 512));
        var temperature = typeof options.temperature === 'number' ? options.temperature : 0.5;
        var settings = {
          max_new_tokens: maxTokens,
          do_sample: temperature > 0.05,
          temperature: Math.max(0.1, temperature),
          top_p: 0.9,
          repetition_penalty: 1.05
        };
        if (streamer) settings.streamer = streamer;
        return state.pipe(messages, settings);
      }).then(function (out) {
        var text = stripThink(outputText(out));
        if (!text) throw new Error('The model returned an empty answer. Try again.');
        return text;
      }).catch(function (error) {
        throw new Error(friendly(error));
      });
    };

    var result = queue.then(run, run);
    queue = result.catch(function () {});
    return result;
  }

  function release() {
    if (state.pipe && state.pipe.dispose) {
      try { state.pipe.dispose(); } catch (error) { /* ignore */ }
    }
    state.pipe = null;
    state.loadedId = '';
    return Promise.resolve(status());
  }

  function clearCache() {
    return release().then(function () {
      all().forEach(function (model) { UI.storeSet(KEY_READY + model.id, false); });
      if (typeof caches === 'undefined') return status();
      return caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }).then(function () { return status(); });
    });
  }

  function isReady() {
    return !!(state.pipe && state.loadedId === selected().id);
  }

  function ensureLoaded() {
    if (isReady()) return Promise.resolve(status());
    return prepare(selected().id);
  }

  window.JarvisLocalBrain = {
    catalog: catalog,
    all: all,
    selected: selected,
    select: select,
    setCustom: setCustom,
    custom: custom,
    status: status,
    prepare: prepare,
    ensureLoaded: ensureLoaded,
    generate: generate,
    release: release,
    clearCache: clearCache,
    isReady: isReady,
    friendly: friendly
  };
})();
