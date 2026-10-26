/* JARVIS — model manager.
 *
 * Owns every model file on the phone: download (streamed straight into the
 * browser cache, never into RAM), resume-free retries, mirror fallback,
 * integrity checks, offline import from device storage and honest diagnostics.
 *
 * The files are stored under the exact URLs that the on-device engine
 * (Transformers.js) looks up, so once a download finishes the engine reads
 * them from cache and never touches the network again.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;

  var CACHE = 'transformers-cache';
  var HOST = 'https://huggingface.co/';
  var MIRRORS = ['https://hf-mirror.com/'];
  var KEY_MIRROR = 'model.mirror';

  /* Every file that the text-generation pipeline asks for. Sizes and SHA-256
     values come from the Hugging Face file listing; a size of 0 means the file
     is optional and its size is discovered at download time. */
  var MODELS = [
    {
      id: 'qwen3.5-0.8b',
      label: 'Qwen3.5 0.8B (text)',
      badge: 'latest',
      repo: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
      ramMb: 1400,
      note: 'Latest Qwen family, text build. Fits a 4 GB phone and answers with no internet.',
      recommended: true,
      shared: [
        { path: 'config.json', bytes: 1989, optional: false },
        { path: 'generation_config.json', bytes: 120, optional: true },
        { path: 'tokenizer.json', bytes: 19226111, optional: false,
          sha256: '89da80cc6689bef4d90cc1028249436975ffb0814618f1d93c65310e05801a9b' },
        { path: 'tokenizer_config.json', bytes: 10027, optional: false }
      ],
      variants: {
        q4f16: [
          { path: 'onnx/model_q4f16.onnx', bytes: 597442,
            sha256: '955bb412842e4d3dc1eb71a2ae60c3243a3db5d6e746a23f437028189599fcc0' },
          { path: 'onnx/model_q4f16.onnx_data', bytes: 469331968,
            sha256: '74b281b74489172937c36cbc3755d33cedd55a1f681fc77426ac9c0bf153d528' }
        ],
        q4: [
          { path: 'onnx/model_q4.onnx', bytes: 482783,
            sha256: 'ea717eb57f3a00e0ac5dc5b537ef8385945f1fbd4f9323d8dd45aa652ae8554e' },
          { path: 'onnx/model_q4.onnx_data', bytes: 550764544,
            sha256: 'ac65b1f1220314ef2debc02545f5aa5702ec201e723ca45dce2bfefc85921859' }
        ]
      }
    }
  ];

  var state = { running: null, abort: null, progress: null, log: [] };

  function catalog() { return MODELS.slice(); }

  function find(id) {
    return MODELS.filter(function (model) { return model.id === id; })[0] || MODELS[0];
  }

  function mirrorPrefix() {
    var extra = String(UI.storeGet(KEY_MIRROR, '') || '').trim();
    if (!extra) return [];
    if (!/[a-z]+:\/\//i.test(extra)) extra = 'https://' + extra;
    if (extra.charAt(extra.length - 1) !== '/') extra += '/';
    return [extra];
  }

  function hosts() {
    return [HOST].concat(mirrorPrefix()).concat(MIRRORS);
  }

  function canonical(repo, path) {
    return HOST + repo + '/resolve/main/' + path;
  }

  function candidates(repo, path) {
    var list = [];
    hosts().forEach(function (host) {
      list.push(host + repo + '/resolve/main/' + path);
    });
    // A second variant that forces a plain attachment download on servers that
    // refuse inline fetches.
    list.push(HOST + repo + '/resolve/main/' + path + '?download=true');
    return list;
  }

  function variantFor(device) {
    return device === 'webgpu' ? 'q4f16' : 'q4';
  }

  function filesFor(model, device) {
    var variant = variantFor(device);
    var files = (model.shared || []).slice();
    (model.variants[variant] || []).forEach(function (file) { files.push(file); });
    return files.map(function (file) {
      return {
        path: file.path,
        bytes: file.bytes || 0,
        sha256: file.sha256 || '',
        optional: !!file.optional,
        variant: /^onnx\//.test(file.path) ? variant : 'shared'
      };
    });
  }

  function totalBytes(model, device) {
    return filesFor(model, device).reduce(function (sum, file) { return sum + (file.bytes || 0); }, 0);
  }

  function openCache() {
    if (typeof caches === 'undefined' || !caches.open) {
      return Promise.reject(new Error('This WebView has no storage cache, so a model cannot be kept on the phone.'));
    }
    return caches.open(CACHE);
  }

  function has(cache, key) {
    return cache.match(key).then(function (hit) { return !!hit; }).catch(function () { return false; });
  }

  function inspect(model, device) {
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    var files = filesFor(model, device || 'wasm');
    return openCache().then(function (cache) {
      return Promise.all(files.map(function (file) {
        return has(cache, canonical(model.repo, file.path)).then(function (present) {
          return { path: file.path, bytes: file.bytes, present: present, optional: file.optional };
        });
      }));
    }).then(function (rows) {
      var missing = rows.filter(function (row) { return !row.present && !row.optional; });
      return {
        model: model,
        files: rows,
        missing: missing,
        ready: missing.length === 0,
        presentBytes: rows.reduce(function (sum, row) { return sum + (row.present ? row.bytes : 0); }, 0),
        totalBytes: totalBytes(model, device || 'wasm')
      };
    }).catch(function (error) {
      return { model: model, files: [], missing: [], ready: false, error: error.message, totalBytes: 0, presentBytes: 0 };
    });
  }

  /* ------------------------------------------------------------- download */

  function streamIntoCache(cache, key, urls, expected, onBytes, signal) {
    var index = 0;
    var lastError = null;

    function attempt() {
      if (signal && signal.aborted) return Promise.reject(new Error('Download cancelled.'));
      if (index >= urls.length) {
        var reason = lastError ? lastError.message : 'no mirror answered';
        return Promise.reject(new Error(reason));
      }
      var url = urls[index++];
      return fetch(url, { signal: signal, headers: { accept: '*/*' } }).then(function (response) {
        if (!response.ok) {
          var failure = new Error('HTTP ' + response.status + ' from ' + url.split('/resolve/')[0]);
          failure.status = response.status;
          throw failure;
        }
        if (!response.body || !response.body.getReader) {
          return response.arrayBuffer().then(function (buffer) {
            onBytes(buffer.byteLength, buffer.byteLength);
            return cache.put(key, new Response(buffer, {
              headers: { 'content-type': 'application/octet-stream' }
            }));
          });
        }
        var total = Number(response.headers.get('content-length') || expected || 0);
        var reader = response.body.getReader();
        var loaded = 0;
        var stream = new ReadableStream({
          pull: function (controller) {
            return reader.read().then(function (chunk) {
              if (chunk.done) { controller.close(); return; }
              loaded += chunk.value.byteLength;
              onBytes(loaded, total);
              controller.enqueue(chunk.value);
            }, function (error) {
              controller.error(error);
            });
          },
          cancel: function (reason) {
            try { reader.cancel(reason); } catch (error) { /* already gone */ }
          }
        });
        return cache.put(key, new Response(stream, {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(total || loaded)
          }
        })).then(function () {
          if (expected && loaded && Math.abs(loaded - expected) > 1024) {
            // A truncated body is worse than a retry: drop it and move on.
            return cache.delete(key).then(function () {
              var short = new Error('the download stopped early (' + loaded + ' of ' + expected + ' bytes)');
              throw short;
            });
          }
          return { url: url, bytes: loaded };
        });
      }).catch(function (error) {
        if (signal && signal.aborted) throw error;
        lastError = error;
        state.log.push({ at: Date.now(), url: url, error: String(error && error.message || error) });
        return attempt();
      });
    }

    return Promise.resolve().then(attempt);
  }

  function download(model, options) {
    options = options || {};
    if (state.running) return Promise.reject(new Error('A model download is already running.'));
    var device = options.device || 'wasm';
    var files = filesFor(model, device);
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.running = model.id;
    state.abort = controller;
    state.log = [];

    var grandTotal = files.reduce(function (sum, file) { return sum + (file.bytes || 0); }, 0);
    var doneBytes = 0;
    var current = { index: 0, file: files[0], loaded: 0, total: files[0].bytes || 0 };
    var startedAt = Date.now();

    function emit(extra) {
      var loaded = doneBytes + current.loaded;
      var pct = grandTotal ? Math.min(99, Math.round((loaded / grandTotal) * 100)) : 0;
      var seconds = Math.max(0.5, (Date.now() - startedAt) / 1000);
      state.progress = {
        model: model.id,
        phase: 'download',
        file: current.file.path,
        fileIndex: current.index + 1,
        fileCount: files.length,
        loadedBytes: loaded,
        totalBytes: grandTotal,
        fileLoaded: current.loaded,
        fileTotal: current.total,
        pct: pct,
        speed: Math.round(loaded / seconds),
        eta: loaded > 0 ? Math.round((grandTotal - loaded) / Math.max(1, loaded / seconds)) : 0
      };
      if (extra) Object.keys(extra).forEach(function (key) { state.progress[key] = extra[key]; });
      if (options.onProgress) options.onProgress(state.progress);
    }

    emit();

    var chain = openCache();
    files.forEach(function (file, index) {
      chain = chain.then(function (cache) {
        current = { index: index, file: file, loaded: 0, total: file.bytes || 0 };
        emit();
        var key = canonical(model.repo, file.path);
        return has(cache, key).then(function (present) {
          if (present) {
            doneBytes += file.bytes || 0;
            current.loaded = file.bytes || 0;
            emit();
            return null;
          }
          return streamIntoCache(cache, key, candidates(model.repo, file.path), file.bytes, function (loaded, total) {
            current.loaded = loaded;
            current.total = total || file.bytes || 0;
            emit();
          }, controller ? controller.signal : null).then(function (result) {
            doneBytes += result.bytes || file.bytes || 0;
            return null;
          }).catch(function (error) {
            if (file.optional) {
              state.log.push({ at: Date.now(), url: file.path, error: 'optional file skipped: ' + error.message });
              return null;
            }
            throw new Error(file.path + ': ' + error.message);
          });
        });
      });
    });

    return chain.then(function () {
      state.running = null;
      state.abort = null;
      state.progress = null;
      UI.storeSet('local.ready.' + model.id, true);
      return inspect(model, device);
    }).catch(function (error) {
      state.running = null;
      state.abort = null;
      state.progress = null;
      throw error;
    });
  }

  function cancel() {
    if (state.abort) {
      state.abort.abort();
      state.abort = null;
      state.running = null;
      state.progress = null;
    }
    return Promise.resolve();
  }

  /* --------------------------------------------------------------- import */

  function importFiles(fileList, model, device) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.reject(new Error('No files were selected.'));
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    var expected = filesFor(model, device || 'wasm');
    var byPath = {};
    expected.forEach(function (file) { byPath[file.path] = file; });

    return openCache().then(function (cache) {
      var used = [];
      var unknown = [];
      var work = Promise.resolve();
      files.forEach(function (file) {
        work = work.then(function () {
          var name = String(file.webkitRelativePath || file.name || '').replace(/^.*?((?:onnx\/)?[^/]+)$/, '$1');
          var key = '';
          if (byPath[name]) key = name;
          else if (byPath['onnx/' + name]) key = 'onnx/' + name;
          if (!key) {
            unknown.push(file.name);
            return null;
          }
          return cache.put(canonical(model.repo, key), new Response(file, {
            headers: { 'content-type': 'application/octet-stream' }
          })).then(function () { used.push(key); });
        });
      });
      return work.then(function () {
        return inspect(model, device).then(function (status) {
          if (status.ready) UI.storeSet('local.ready.' + model.id, true);
          return { imported: used, unknown: unknown, status: status };
        });
      });
    });
  }

  /* ------------------------------------------------------------- integrity */

  function sha256Init() {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var buffer = new Uint8Array(64);
    var offset = 0;
    var length = 0;

    function rotr(value, bits) { return (value >>> bits) | (value << (32 - bits)); }

    function block(view) {
      var w = new Int32Array(64);
      var i;
      for (i = 0; i < 16; i += 1) {
        w[i] = (view[i * 4] << 24) | (view[i * 4 + 1] << 16) | (view[i * 4 + 2] << 8) | view[i * 4 + 3];
      }
      for (i = 16; i < 64; i += 1) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i += 1) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }

    return {
      update: function (chunk) {
        var bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        length += bytes.length;
        var i = 0;
        while (i < bytes.length) {
          var take = Math.min(64 - offset, bytes.length - i);
          buffer.set(bytes.subarray(i, i + take), offset);
          offset += take;
          i += take;
          if (offset === 64) { block(buffer); offset = 0; }
        }
      },
      hex: function () {
        var tail = new Uint8Array(offset < 56 ? 64 : 128);
        tail.set(buffer.subarray(0, offset));
        tail[offset] = 0x80;
        var bits = length * 8;
        var high = Math.floor(bits / 4294967296);
        var low = bits >>> 0;
        var end = tail.length;
        tail[end - 8] = (high >>> 24) & 0xff; tail[end - 7] = (high >>> 16) & 0xff;
        tail[end - 6] = (high >>> 8) & 0xff; tail[end - 5] = high & 0xff;
        tail[end - 4] = (low >>> 24) & 0xff; tail[end - 3] = (low >>> 16) & 0xff;
        tail[end - 2] = (low >>> 8) & 0xff; tail[end - 1] = low & 0xff;
        for (var i = 0; i < tail.length; i += 64) block(tail.subarray(i, i + 64));
        return H.map(function (word) {
          return ('00000000' + (word >>> 0).toString(16)).slice(-8);
        }).join('');
      }
    };
  }

  function verify(model, options) {
    options = options || {};
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    var device = options.device || 'wasm';
    var files = filesFor(model, device).filter(function (file) { return !!file.sha256; });
    return openCache().then(function (cache) {
      var results = [];
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          return cache.match(canonical(model.repo, file.path)).then(function (hit) {
            if (!hit) {
              results.push({ path: file.path, ok: false, reason: 'missing' });
              return null;
            }
            var hash = sha256Init();
            var reader = hit.body.getReader();
            function pump() {
              return reader.read().then(function (chunk) {
                if (chunk.done) return null;
                hash.update(chunk.value);
                return pump();
              });
            }
            return pump().then(function () {
              var digest = hash.hex();
              results.push({
                path: file.path,
                ok: digest === file.sha256,
                reason: digest === file.sha256 ? 'sha256 matches' : 'checksum mismatch',
                expected: file.sha256,
                actual: digest
              });
            });
          });
        });
      });
      return chain.then(function () { return results; });
    });
  }

  /* ----------------------------------------------------------- diagnostics */

  function timedFetch(url) {
    var started = Date.now();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 9000);
    return fetch(url, { signal: controller ? controller.signal : undefined, cache: 'no-store' })
      .then(function (response) {
        clearTimeout(timer);
        return { url: url, ok: response.ok, status: response.status, ms: Date.now() - started };
      })
      .catch(function (error) {
        clearTimeout(timer);
        return { url: url, ok: false, status: 0, ms: Date.now() - started, error: String(error && error.message || error) };
      });
  }

  function diagnose(model) {
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    var probe = model.repo + '/resolve/main/config.json';
    var checks = hosts().map(function (host) { return timedFetch(host + probe); });
    checks.push(timedFetch(HOST + probe + '?download=true'));
    var environment = {
      cache: typeof caches !== 'undefined',
      decompression: typeof DecompressionStream !== 'undefined',
      wasm: typeof WebAssembly !== 'undefined',
      webgpu: !!(navigator.gpu && navigator.gpu.requestAdapter),
      online: navigator.onLine !== false,
      secure: !!window.isSecureContext,
      quotaMb: 0,
      usageMb: 0
    };
    var storage = (navigator.storage && navigator.storage.estimate)
      ? navigator.storage.estimate().then(function (est) {
        environment.quotaMb = Math.round((est.quota || 0) / 1048576);
        environment.usageMb = Math.round((est.usage || 0) / 1048576);
        return null;
      }).catch(function () { return null; })
      : Promise.resolve(null);

    var cached = openCache().then(function (cache) {
      return cache.keys().then(function (keys) {
        environment.cachedFiles = keys.length;
        return null;
      });
    }).catch(function () {
      environment.cachedFiles = null;
      return null;
    });

    return Promise.all(checks).then(function (results) {
      return Promise.all([storage, cached]).then(function () {
        return { model: model, sources: results, environment: environment, log: state.log.slice(-10) };
      });
    });
  }

  function remove(model) {
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    return openCache().then(function (cache) {
      var all = [];
      ['q4', 'q4f16'].forEach(function (device) {
        filesFor(model, device === 'q4' ? 'wasm' : 'webgpu').forEach(function (file) {
          all.push(file.path);
        });
      });
      var unique = all.filter(function (path, index) { return all.indexOf(path) === index; });
      return Promise.all(unique.map(function (path) {
        return cache.delete(canonical(model.repo, path)).catch(function () { return false; });
      })).then(function () {
        UI.storeSet('local.ready.' + model.id, false);
        return inspect(model);
      });
    });
  }

  /* Some engines resolve the same file through a slightly different URL (a
     query string, a trailing slash, a different revision spelling). Copy any
     such entry onto the canonical key so nothing is downloaded twice. */
  function repair(model, device) {
    if (!model) model = find(UI.storeGet('local.model', MODELS[0].id) || MODELS[0].id);
    return openCache().then(function (cache) {
      var files = filesFor(model, device || 'wasm');
      return cache.keys().then(function (requests) {
        var fixed = [];
        var chain = Promise.resolve();
        files.forEach(function (file) {
          var key = canonical(model.repo, file.path);
          var suffix = '/' + model.repo + '/resolve/main/' + file.path;
          chain = chain.then(function () {
            return has(cache, key).then(function (present) {
              if (present) return null;
              var match = requests.filter(function (request) {
                var url = String(request.url || '');
                if (url === key) return true;
                if (url.indexOf(key + '?') === 0) return true;
                return url.indexOf(key.replace('://huggingface.co/', '://')) === 0;
              })[0];
              if (!match) return null;
              return cache.match(match).then(function (hit) {
                if (!hit) return null;
                return cache.put(key, hit).then(function () { fixed.push(file.path); });
              });
            });
          });
        });
        return chain.then(function () { return fixed; });
      });
    }).catch(function () { return []; });
  }

  function ensure(model, options) {
    options = options || {};
    var device = options.device || 'wasm';
    return repair(model, device).then(function () { return inspect(model, device); }).then(function (status) {
      if (status.ready) return status;
      if (options.download === false) {
        var missing = status.missing.map(function (file) { return file.path; }).join(', ') || 'model files';
        throw new Error('The model is not on this phone yet (' + missing + '). Open Settings → Local brain and tap Download.');
      }
      return download(model, { device: device, onProgress: options.onProgress });
    });
  }

  window.JarvisModel = {
    MODELS: MODELS,
    CACHE: CACHE,
    catalog: catalog,
    find: find,
    filesFor: filesFor,
    variantFor: variantFor,
    totalBytes: totalBytes,
    canonical: canonical,
    inspect: inspect,
    download: download,
    cancel: cancel,
    importFiles: importFiles,
    verify: verify,
    diagnose: diagnose,
    remove: remove,
    ensure: ensure,
    progress: function () { return state.progress; },
    busy: function () { return state.running; },
    setMirror: function (value) {
      if (value) UI.storeSet(KEY_MIRROR, value);
      else UI.storeRemove(KEY_MIRROR);
      return mirrorPrefix();
    },
    mirror: mirrorPrefix,
    _sha256: sha256Init
  };
})();
