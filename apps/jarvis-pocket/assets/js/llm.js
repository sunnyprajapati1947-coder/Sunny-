/* Jarvis Pocket — provider adapters, streaming and the system prompt. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;

  var PROVIDERS = {
    local: {
      label: 'On-device (Qwen)',
      kind: 'local',
      base: '',
      models: ['qwen3.5-0.8b'],
      keys: 'https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX',
      note: 'Qwen3.5 runs inside the phone, even without internet. Download the model first (Settings → Local brain).'
    },
    gemini: {
      label: 'Google Gemini',
      kind: 'gemini',
      base: 'https://generativelanguage.googleapis.com/v1beta',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
      keys: 'https://aistudio.google.com/apikey',
      note: 'Free tier available, works directly from the browser.'
    },
    openrouter: {
      label: 'OpenRouter',
      kind: 'openai',
      base: 'https://openrouter.ai/api/v1',
      models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'deepseek/deepseek-chat'],
      keys: 'https://openrouter.ai/keys',
      note: 'One key for many models. Browser friendly.'
    },
    openai: {
      label: 'OpenAI',
      kind: 'openai',
      base: 'https://api.openai.com/v1',
      models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
      keys: 'https://platform.openai.com/api-keys',
      note: 'If the browser blocks the request, use OpenRouter with the same models.'
    },
    anthropic: {
      label: 'Anthropic Claude',
      kind: 'anthropic',
      base: 'https://api.anthropic.com',
      models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest'],
      keys: 'https://console.anthropic.com/settings/keys',
      note: 'Direct browser access is enabled for this app.'
    },
    groq: {
      label: 'Groq',
      kind: 'openai',
      base: 'https://api.groq.com/openai/v1',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'],
      keys: 'https://console.groq.com/keys',
      note: 'Extremely fast open models, free tier.'
    },
    deepseek: {
      label: 'DeepSeek',
      kind: 'openai',
      base: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      keys: 'https://platform.deepseek.com/api_keys',
      note: 'Cheap reasoning models.'
    },
    custom: {
      label: 'Custom / local',
      kind: 'openai',
      base: '',
      models: [],
      keys: '',
      note: 'Any OpenAI-compatible endpoint, e.g. http://192.168.1.5:11434/v1 for Ollama.'
    }
  };

  var DEFAULTS = {
    provider: 'local',
    key: '',
    model: 'qwen3.5-0.8b',
    base: '',
    temperature: 0.6,
    maxTokens: 1400,
    stream: true,
    persona: '',
    replyLang: 'auto',
    assistantName: 'Jarvis'
  };

  /* 1.0 is local only. Any older setting that pointed at a cloud provider is
     migrated on read, so an update cannot silently call a remote model. */
  function settings() {
    var stored = UI.storeGet('llm', {}) || {};
    var merged = Object.assign({}, DEFAULTS, stored);
    if (merged.provider !== 'local') {
      merged.provider = 'local';
      merged.model = 'qwen3.5-0.8b';
      merged.key = '';
      merged.base = '';
    }
    return merged;
  }

  function save(patch) {
    var next = Object.assign({}, settings(), patch || {});
    UI.storeSet('llm', next);
    return next;
  }

  function providerOf(config) {
    return PROVIDERS[config.provider] || PROVIDERS.custom;
  }

  function baseUrl(config) {
    var provider = providerOf(config);
    var base = (config.base || provider.base || '').trim().replace(/\/+$/, '');
    return base;
  }

  function isReady(config) {
    var settingsNow = config || settings();
    var provider = providerOf(settingsNow);
    if (provider.kind === 'local') {
      return !!(window.JarvisLocalBrain && window.JarvisLocalBrain.isReady());
    }
    return !!(settingsNow.key && settingsNow.model && baseUrl(settingsNow));
  }

  function friendlyError(error, config) {
    var message = String((error && error.message) || error || 'Unknown error');
    var status = error && error.status;
    if (status === 401 || status === 403) return 'The API key was rejected. Check the key again in Settings.';
    if (status === 404) return 'Model "' + (config ? config.model : '') + '" was not found. Change the model name in Settings.';
    if (status === 429) return 'Rate limit hit. Try again in a moment or pick another model.';
    if (status === 400) return 'The request was rejected: ' + message;
    if (status >= 500) return 'The provider is down (' + status + '). Try again later.';
    if (/Failed to fetch|fetch failed|NetworkError|Load failed|ECONNREFUSED|ERR_NETWORK/i.test(message)) {
      return 'Network/CORS block. Either check the internet connection or use the OpenRouter provider (browser-friendly).';
    }
    return message;
  }

  function requestHeaders(config) {
    var provider = providerOf(config);
    if (provider.kind === 'anthropic') {
      return {
        'content-type': 'application/json',
        'x-api-key': config.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }
    var headers = {
      'content-type': 'application/json',
      authorization: 'Bearer ' + config.key
    };
    if (config.provider === 'openrouter') {
      headers['HTTP-Referer'] = location.origin;
      headers['X-Title'] = 'Jarvis Pocket';
    }
    return headers;
  }

  function endpoint(config) {
    var provider = providerOf(config);
    var base = baseUrl(config);
    if (provider.kind === 'anthropic') return base + '/v1/messages';
    if (provider.kind === 'gemini') {
      return base + '/models/' + encodeURIComponent(config.model) + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(config.key);
    }
    return base + '/chat/completions';
  }

  function plainEndpoint(config) {
    var provider = providerOf(config);
    var base = baseUrl(config);
    if (provider.kind === 'anthropic') return base + '/v1/messages';
    if (provider.kind === 'gemini') {
      return base + '/models/' + encodeURIComponent(config.model) + ':generateContent?key=' + encodeURIComponent(config.key);
    }
    return base + '/chat/completions';
  }

  function payload(config, system, messages, stream) {
    var provider = providerOf(config);
    if (provider.kind === 'anthropic') {
      return {
        model: config.model,
        max_tokens: config.maxTokens || 1400,
        temperature: config.temperature,
        system: system,
        stream: stream,
        messages: messages.map(function (message) {
          return { role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content };
        })
      };
    }
    if (provider.kind === 'gemini') {
      return {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(function (message) {
          return {
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
          };
        }),
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens || 1400
        }
      };
    }
    return {
      model: config.model,
      stream: stream,
      temperature: config.temperature,
      max_tokens: config.maxTokens || 1400,
      messages: [{ role: 'system', content: system }].concat(messages.map(function (message) {
        return { role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content };
      }))
    };
  }

  function extractDelta(config, json) {
    var provider = providerOf(config);
    try {
      if (provider.kind === 'anthropic') {
        if (json.type === 'content_block_delta' && json.delta && json.delta.text) return json.delta.text;
        return '';
      }
      if (provider.kind === 'gemini') {
        var candidate = json.candidates && json.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) return '';
        return candidate.content.parts.map(function (part) { return part.text || ''; }).join('');
      }
      var choice = json.choices && json.choices[0];
      if (!choice) return '';
      if (choice.delta && typeof choice.delta.content === 'string') return choice.delta.content;
      if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
      return '';
    } catch (error) {
      return '';
    }
  }

  function extractFull(config, json) {
    var provider = providerOf(config);
    if (provider.kind === 'anthropic') {
      return (json.content || []).map(function (part) { return part.text || ''; }).join('');
    }
    if (provider.kind === 'gemini') {
      var candidate = json.candidates && json.candidates[0];
      if (!candidate || !candidate.content || !candidate.content.parts) return '';
      return candidate.content.parts.map(function (part) { return part.text || ''; }).join('');
    }
    var choice = json.choices && json.choices[0];
    return (choice && choice.message && choice.message.content) || '';
  }

  function parseSseChunk(config, raw, onDelta) {
    var text = '';
    var blocks = raw.split('\n\n');
    for (var i = 0; i < blocks.length; i += 1) {
      var lines = blocks[i].split('\n');
      var data = null;
      for (var j = 0; j < lines.length; j += 1) {
        var line = lines[j];
        if (line.indexOf('data:') === 0) {
          var value = line.slice(5).trim();
          if (value && value !== '[DONE]') data = value;
        }
      }
      if (!data) continue;
      var json;
      try {
        json = JSON.parse(data);
      } catch (error) {
        continue;
      }
      var delta = extractDelta(config, json);
      if (delta) {
        text += delta;
        if (onDelta) onDelta(delta);
      }
    }
    return text;
  }

  function readStream(response, config, onDelta) {
    if (!response.body || !response.body.getReader) {
      return response.json().then(function (json) {
        var text = extractFull(config, json);
        if (text && onDelta) onDelta(text);
        return text;
      });
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var buffer = '';
    var full = '';
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          if (buffer.trim()) full += parseSseChunk(config, buffer, onDelta);
          return full;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var splitAt = buffer.lastIndexOf('\n\n');
        if (splitAt >= 0) {
          var ready = buffer.slice(0, splitAt + 2);
          buffer = buffer.slice(splitAt + 2);
          full += parseSseChunk(config, ready, onDelta);
        }
        return pump();
      });
    }
    return pump();
  }

  function complete(options) {
    var config = settings();
    var messages = options.messages || [];
    var system = options.system || '';
    var onDelta = options.onDelta;

    // Test seam: the smoke suite replaces the model with a scripted reply so
    // the UI can be exercised without loading half a gigabyte of weights.
    if (typeof window.__JARVIS_TEST_COMPLETE === 'function') {
      return Promise.resolve(window.__JARVIS_TEST_COMPLETE({
        system: system,
        messages: messages,
        onDelta: onDelta
      }));
    }

    // JARVIS 1.0 has exactly one brain: the model on this phone.
    if (!window.JarvisLocalBrain) {
      return Promise.reject(new Error('The local brain module did not load.'));
    }
    return window.JarvisLocalBrain.generate({
      system: system,
      messages: messages,
      onDelta: onDelta,
      maxTokens: Math.min(768, config.maxTokens || 512),
      temperature: typeof config.temperature === 'number' ? config.temperature : 0.5
    });
  }

  function testConnection() {
    var provider = providerOf(settings());
    if (provider.kind === 'local') {
      if (!window.JarvisLocalBrain) return Promise.reject(new Error('The local brain module did not load.'));
      return window.JarvisLocalBrain.ensureLoaded()
        .then(function () { return window.JarvisLocalBrain.generate({ system: 'Reply with exactly: ready', messages: [{ role: 'user', content: 'ping' }], maxTokens: 24, temperature: 0 }); })
        .then(function (text) { return { ok: true, text: (text || '').slice(0, 80) }; })
        .catch(function (error) { return { ok: false, error: error.message }; });
    }
    return complete({
      system: 'Reply with exactly: ready',
      messages: [{ role: 'user', content: 'ping' }],
      stream: false
    }).then(function (text) {
      return { ok: true, text: (text || '').slice(0, 80) };
    }).catch(function (error) {
      return { ok: false, error: error.message };
    });
  }

  function memoryLines(memory) {
    if (!memory || !memory.length) return '';
    return memory.slice(-40).map(function (entry) { return '- ' + entry.text; }).join('\n');
  }

  function languageLine(pref) {
    if (pref === 'hinglish') return 'Reply in natural Hinglish (Hindi in Latin script), the way Indian developers talk.';
    if (pref === 'hindi') return 'Reply in Hindi (Devanagari). Code and technical terms can stay in English.';
    if (pref === 'english') return 'Reply in clear English.';
    return 'Reply in the same language the user writes in (Hindi, Hinglish or English).';
  }

  function buildSystem(options) {
    var config = options.settings || settings();
    var stats = Pack.stats();
    var name = config.assistantName || 'Jarvis';
    var lines = [
      'You are ' + name + ', a sharp, warm AI assistant living inside a phone app called Jarvis Pocket.',
      'Jarvis Pocket ships an offline library of ' + stats.items + ' skills, agents, commands, rules and guides curated from ' + stats.packs + ' open-source agent repositories.',
      '',
      'How to answer:',
      '- Be concise and useful. Short paragraphs, tight bullets, no filler and no repeated disclaimers.',
      '- This is a phone screen: keep headings short, avoid wide tables, prefer lists.',
      '- ' + languageLine(config.replyLang),
      '- Use markdown. Code in fenced blocks with a language tag.',
      '- If library context below answers the question, ground your answer in it and cite items as [Title](#/item/<id>).',
      '- If the library does not cover something, say so plainly instead of inventing items or links.',
      '- Never invent commands, file paths or URLs that are not in the context.'
    ];
    if (config.persona) {
      lines.push('', 'Extra instructions from the user:', config.persona.slice(0, 1200));
    }
    var memory = memoryLines(options.memory);
    if (memory) {
      lines.push('', 'Things the user asked you to remember:', memory);
    }
    var toolLines = window.JarvisTools && window.JarvisTools.promptLines
      ? window.JarvisTools.promptLines()
      : '';
    lines.push(
      '',
      'Actions on this phone — only when the user actually asks for one. Emit one tag per line, exactly like this:',
      '<tool>{"name":"device_stats"}</tool>',
      '<tool>{"name":"open_app","app":"YouTube"}</tool>',
      '<tool>{"name":"search_knowledge","query":"voice cloning"}</tool>',
      'Available actions:',
      toolLines,
      '',
      'Rules for actions:',
      '- Never claim an action happened. The app runs it and sends the real result back as <tool_result>.',
      '- The result says verified or unverified. Repeat that honestly, including when Android could not confirm it.',
      '- If an action is impossible on this phone, say so instead of inventing a workaround.',
      '- Never show tool tags in your final answer.'
    );
    if (options.context) {
      lines.push('', 'Relevant library context:', '"""', options.context, '"""');
    }
    return lines.join('\n');
  }

  function offlineAnswer(question) {
    return Pack.contextFor(question, 4).then(function (context) {
      var hits = Pack.searchScored(question, 5);
      if (!hits.length) {
        return 'I am in **library mode** right now (the on-device brain is not installed).\n\n' +
          'This question is not answered by the library. Open **Settings → Local brain** and download ' +
          'Qwen3.5 once (about 490 MB) and I can answer it fully, offline.\n\n' +
          'Meanwhile you can search the library: **Library → Search**.';
      }
      var lines = ['I am in **library mode** right now (the on-device brain is not installed), so here is a direct answer from the library:\n'];
      hits.forEach(function (hit, index) {
        var pack = Pack.packOf(hit.item);
        lines.push((index + 1) + '. **' + hit.item.t + '** — ' + (pack ? pack.name : '') + ' · ' + Pack.typeOf(hit.item) +
          '\n   ' + (hit.item.d || '').slice(0, 160) + '\n   [Open](#/item/' + encodeURIComponent(hit.item.i) + ')');
      });
      lines.push('\nWant full answers? Install the on-device brain in **Settings → Local brain**.');
      return { text: lines.join('\n'), context: context, offline: true };
    });
  }

  window.JarvisLLM = {
    PROVIDERS: PROVIDERS,
    DEFAULTS: DEFAULTS,
    settings: settings,
    save: save,
    isReady: isReady,
    providerOf: providerOf,
    complete: complete,
    testConnection: testConnection,
    buildSystem: buildSystem,
    offlineAnswer: offlineAnswer,
    friendlyError: friendlyError
  };
})();
