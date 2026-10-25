/* Jarvis Pocket — provider adapters, streaming and the system prompt. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;

  var PROVIDERS = {
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
    provider: 'gemini',
    key: '',
    model: 'gemini-2.5-flash',
    base: '',
    temperature: 0.6,
    maxTokens: 1400,
    stream: true,
    persona: '',
    replyLang: 'auto',
    assistantName: 'Jarvis'
  };

  function settings() {
    var stored = UI.storeGet('llm', {}) || {};
    var merged = Object.assign({}, DEFAULTS, stored);
    if (!stored.provider) merged.model = DEFAULTS.model;
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
    return !!(settingsNow.key && settingsNow.model && baseUrl(settingsNow));
  }

  function friendlyError(error, config) {
    var message = String((error && error.message) || error || 'Unknown error');
    var status = error && error.status;
    if (status === 401 || status === 403) return 'API key rejected. Settings me key dobara check karo.';
    if (status === 404) return 'Model "' + (config ? config.model : '') + '" nahi mila. Settings me model name badlo.';
    if (status === 429) return 'Rate limit lag gaya. Thodi der baad try karo ya doosra model chuno.';
    if (status === 400) return 'Request reject hui: ' + message;
    if (status >= 500) return 'Provider down hai (' + status + '). Baad me try karo.';
    if (/Failed to fetch|fetch failed|NetworkError|Load failed|ECONNREFUSED|ERR_NETWORK/i.test(message)) {
      return 'Network/CORS block. Ya to internet check karo, ya OpenRouter provider use karo (browser-friendly).';
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
    var signal = options.signal;
    var wantStream = options.stream !== false && config.stream !== false;
    var provider = providerOf(config);

    if (!config.key || !config.model) {
      return Promise.reject(new Error('No API key yet. Settings me apni key add karo.'));
    }

    var body = payload(config, system, messages, wantStream);
    var url = wantStream ? endpoint(config) : plainEndpoint(config);

    return fetch(url, {
      method: 'POST',
      headers: requestHeaders(config),
      body: JSON.stringify(body),
      signal: signal
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          var message = text;
          try {
            var parsed = JSON.parse(text);
            message = (parsed.error && (parsed.error.message || parsed.error)) || text;
            if (typeof message !== 'string') message = JSON.stringify(message);
          } catch (error) { /* raw text is fine */ }
          var failure = new Error(message.slice(0, 300));
          failure.status = response.status;
          throw failure;
        });
      }
      if (wantStream && /text\/event-stream/.test(response.headers.get('content-type') || '')) {
        return readStream(response, config, onDelta).then(function (text) {
          return text;
        });
      }
      return response.json().then(function (json) {
        var text = extractFull(config, json);
        if (text && onDelta) onDelta(text);
        return text;
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw error;
      var wrapped = new Error(friendlyError(error, config));
      wrapped.status = error && error.status;
      wrapped.cause = error;
      throw wrapped;
    });
  }

  function testConnection() {
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
    lines.push(
      '',
      'Tools — only when the context above is not enough. Emit one tag per line, exactly like this:',
      '<tool>{"name":"kb_search","query":"voice cloning"}</tool>',
      '<tool>{"name":"kb_open","id":"ecc-skills-voice"}</tool>',
      '<tool>{"name":"remember","text":"User builds Android apps in Kotlin"}</tool>',
      'Available tools: kb_search {query}, kb_open {id}, remember {text}.',
      'After a tool call the app replies with <tool_result>. Then answer the user normally. Never show tool tags in your final answer.'
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
        return 'Main abhi **offline library mode** me hoon (AI key set nahi hai).\n\n' +
          'Is sawaal ka jawab library me nahi mila. **Settings → AI provider** me apni key daalo (Gemini free hai), ' +
          'phir main poora jawab de paunga.\n\n' +
          'Tab tak library me search karo: **Library → Search**.';
      }
      var lines = ['Main abhi **offline library mode** me hoon (AI key set nahi hai), isliye library se seedha jawab de raha hoon:\n'];
      hits.forEach(function (hit, index) {
        var pack = Pack.packOf(hit.item);
        lines.push((index + 1) + '. **' + hit.item.t + '** — ' + (pack ? pack.name : '') + ' · ' + Pack.typeOf(hit.item) +
          '\n   ' + (hit.item.d || '').slice(0, 160) + '\n   [Kholo](#/item/' + encodeURIComponent(hit.item.i) + ')');
      });
      lines.push('\nPoora AI jawab chahiye? **Settings → AI provider** me key add karo (Gemini ka free tier kaafi hai).');
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
