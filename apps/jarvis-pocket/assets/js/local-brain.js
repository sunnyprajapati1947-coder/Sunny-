/* JARVIS — on-device brain: Qwen3.5 (latest Qwen family) inside the app,
   through Transformers.js + ONNX Runtime Web. All weights are managed by
   JarvisModel; once they are on the phone nothing leaves it. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Model = window.JarvisModel;

  var VENDOR = 'vendor/transformers/';
  var LIB_FILE = 'transformers.web.min.js.gz';
  var ORT_FILE = 'ort.bundle.min.mjs';
  var WASM_FILE = 'ort-wasm-simd-threaded.jsep.wasm';
  var MJS_FILE = 'ort-wasm-simd-threaded.jsep.mjs';

  var KEY_MODEL = 'local.model';

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
    filesReady: false,
    lastLoadMs: 0,
    tokens: 0
  };

  var queue = Promise.resolve();

  function selected() {
    return Model.find(UI.storeGet(KEY_MODEL, '') || Model.MODELS[0].id);
  }

  function select(id) {
    var model = Model.find(id);
    UI.storeSet(KEY_MODEL, model.id);
    return model;
  }

  function status() {
    var model = selected();
    return {
      model: model,
      filesReady: state.filesReady,
      downloaded: state.filesReady,
      loaded: !!state.pipe && state.loadedId === model.id,
      loadedId: state.loadedId,
      loading: state.loadingId,
      device: state.device,
      webgpu: state.webgpu,
      progress: state.progress,
      error: state.error,
      canRun: !!(window.WebAssembly),
      ramMb: model.ramMb,
      totalBytes: Model.totalBytes(model, state.device || 'wasm')
    };
  }

  function friendly(error) {
    var message = String((error && error.message) || error || 'unknown error');
    if (/out of memory|OOM|Allocation failed|memory access out of bounds|RangeError|Array buffer allocation/i.test(message)) {
      return 'The phone ran out of memory. Tap Free memory, close other apps, then load the model again.';
    }
    if (/no space|quota|QuotaExceeded/i.test(message)) {
      return 'There is not enough free storage for the model (about 550 MB). Free some space and retry.';
    }
    if (/HTTP 40[134]|Failed to fetch|NetworkError|network error|ECONN|Load failed/i.test(message)) {
      return 'The model server could not be reached. Open Settings → Local brain → Diagnose to see which ' +
        'source failed, then retry on Wi-Fi (or import the model files from storage). Detail: ' + message.slice(0, 160);
    }
    if (/SharedArrayBuffer|threads/i.test(message)) {
      return 'This WebView cannot use WASM threads, so the single-thread path is used.';
    }
    if (/WebGPU|adapter|GPUDevice/i.test(message)) {
      return 'WebGPU is unavailable, so the CPU path is used (slower but it works).';
    }
    if (/Missing|tokenizer|config\.json|model\.onnx|Could not locate/i.test(message)) {
      return 'The model files are incomplete on this phone. Open Settings → Local brain → Diagnose and download again.';
    }
    if (/Importing a module script failed|Failed to fetch dynamically imported module|MIME/i.test(message)) {
      return 'The local engine files could not be loaded. Reinstall the app and try again.';
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
      if (!gzipped) return new TextDecoder().decode(bytes);
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('this WebView is too old for the on-device engine (DecompressionStream is missing)');
      }
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text();
    }).then(function (code) {
      var ortUrl = vendorUrl(ORT_FILE);
      return code
        .replace(/from"onnxruntime-common"/g, 'from"' + ortUrl + '"')
        .replace(/from"onnxruntime-web\/webgpu"/g, 'from"' + ortUrl + '"');
    });
  }

  function wasmPaths() {
    return { wasm: vendorUrl(WASM_FILE), mjs: vendorUrl(MJS_FILE) };
  }

  function configureOrt(ort) {
    if (!ort || !ort.env || !ort.env.wasm) return;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = wasmPaths();
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
        // We manage the files ourselves: when they are on the phone the engine
        // must never reach the network.
        env.allowRemoteModels = !state.filesReady;
        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
          env.backends.onnx.wasm.numThreads = 1;
          env.backends.onnx.wasm.proxy = false;
          env.backends.onnx.wasm.wasmPaths = wasmPaths();
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

  function mapProgress(onProgress) {
    return function (p) {
      if (!p) return;
      state.progress = {
        pct: p.pct,
        loadedMb: Math.round((p.loadedBytes || 0) / 1048576),
        totalMb: Math.round((p.totalBytes || 0) / 1048576),
        speedMb: Math.round(((p.speed || 0) / 1048576) * 10) / 10,
        eta: p.eta || 0,
        file: p.file || '',
        step: (p.fileIndex || 1) + '/' + (p.fileCount || 1)
      };
      if (onProgress) onProgress(state.progress);
    };
  }

  function prepare(id, onProgress, options) {
    options = options || {};
    var model = id ? Model.find(id) : selected();
    if (state.pipe && state.loadedId === model.id) {
      return Model.inspect(model, state.device || 'wasm').then(function () { return status(); });
    }
    if (state.loadingId) return Promise.reject(new Error('A model is already loading. Wait for it to finish.'));

    state.loadingId = model.id;
    state.error = '';

    // Memory budget: refuse a load that cannot fit instead of letting Android
    // kill the WebView mid-warmup. `force` is only used by the explicit
    // "Load anyway" button in the model manager.
    var guard = window.JarvisMem ? window.JarvisMem.check(model.ramMb) : null;
    if (guard && !guard.ok && !options.force) {
      state.loadingId = '';
      state.error = guard.advice;
      var guardError = new Error(guard.advice);
      guardError.code = 'mem-budget';
      guardError.guard = guard;
      return Promise.reject(guardError);
    }
    if (guard && window.JarvisMem) window.JarvisMem.status();

    return detectDevice().then(function (device) {
      return Model.ensure(model, {
        device: device,
        onProgress: mapProgress(onProgress)
      }).then(function (ready) {
        state.filesReady = !!ready.ready;
        if (!state.filesReady) {
          throw new Error('The model files are missing: ' +
            ready.missing.map(function (file) { return file.path; }).join(', '));
        }
        return loadLibrary().then(function (mod) {
          var dtype = device === 'webgpu' ? 'q4f16' : 'q4';
          var started = Date.now();
          return mod.pipeline('text-generation', model.repo, {
            dtype: dtype,
            device: device,
            progress_callback: function (event) {
              if (event && event.status === 'progress' && event.total) {
                state.progress = {
                  pct: Math.round(((event.loaded || 0) / event.total) * 100),
                  loadedMb: Math.round((event.loaded || 0) / 1048576),
                  totalMb: Math.round(event.total / 1048576),
                  file: event.file || '',
                  step: 'loading into memory'
                };
                if (onProgress) onProgress(state.progress);
              }
            }
          }).then(function (pipe) {
            if (state.pipe && state.pipe.dispose) {
              try { state.pipe.dispose(); } catch (error) { /* ignore */ }
            }
            state.pipe = pipe;
            state.loadedId = model.id;
            state.loadingId = '';
            state.progress = null;
            state.lastLoadMs = Date.now() - started;
            UI.storeSet(KEY_MODEL, model.id);
            return status();
          });
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
            state.tokens += 1;
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
        // Memory pressure: release the engine through the guard so the rest of
        // the app (tools, memory, library) keeps running instead of dying.
        var pressure = window.JarvisMem ? window.JarvisMem.shouldRecover(error) : '';
        if (pressure) {
          return window.JarvisMem.recover('out of memory during generation').then(function () {
            throw new Error(friendly(error));
          });
        }
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

  function removeModel(id) {
    var model = Model.find(id || selected().id);
    return release().then(function () { return Model.remove(model); }).then(function (info) {
      state.filesReady = !!info.ready;
      UI.storeSet('local.ready.' + model.id, false);
      return status();
    });
  }

  function isReady() {
    return !!(state.pipe && state.loadedId === selected().id);
  }

  /* Drop in-memory engine state only. The model files in CacheStorage stay, so
     a memory recovery never costs the user another download. */
  function clearTransient() {
    state.progress = null;
    state.lib = null;
    state.libPromise = null;
    return Promise.resolve(true);
  }

  function memCheck(force) {
    if (!window.JarvisMem) return { ok: true, advice: '' };
    var verdict = window.JarvisMem.check(selected().ramMb);
    return force ? Object.assign({}, verdict, { ok: true, forced: true }) : verdict;
  }

  function filesReady() {
    return Model.inspect(selected(), state.device || 'wasm').then(function (info) {
      state.filesReady = !!info.ready;
      return info;
    });
  }

  function ensureLoaded() {
    if (isReady()) return Promise.resolve(status());
    return prepare(selected().id);
  }

  window.JarvisLocalBrain = {
    catalog: Model.catalog,
    all: Model.catalog,
    selected: selected,
    select: select,
    status: status,
    prepare: prepare,
    ensureLoaded: ensureLoaded,
    generate: generate,
    release: release,
    clearTransient: clearTransient,
    memCheck: memCheck,
    removeModel: removeModel,
    filesReady: filesReady,
    isReady: isReady,
    friendly: friendly
  };
})();
