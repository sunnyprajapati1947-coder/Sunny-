/* Jarvis Pocket — the on-device brain adapter and the system prompt.
   Local only by construction: there is no network call in this file. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;

  /* JARVIS 1.0 is local only. There is deliberately no provider table, no
     endpoint builder and no key handling anywhere in this file: the single
     brain is the on-device model, so no prompt can leave the phone. */
  var PROVIDERS = {
    local: {
      label: 'On-device (Qwen3.5)',
      kind: 'local',
      base: '',
      models: ['qwen3.5-0.8b'],
      keys: '',
      note: 'Qwen3.5 runs inside the phone. Download the model once, then it works in airplane mode.'
    }
  };

  var DEFAULTS = {
    provider: 'local',
    key: '',            // kept in the shape for stored-setting migration; never read
    model: 'qwen3.5-0.8b',
    base: '',           // same: no endpoint is ever built
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
    return PROVIDERS.local;
  }


  function isReady(config) {
    var settingsNow = config || settings();
    return !!(settingsNow && window.JarvisLocalBrain && window.JarvisLocalBrain.isReady());
  }

  function friendlyError(error) {
    var message = String((error && error.message) || error || 'Unknown error');
    if (window.JarvisLocalBrain && window.JarvisLocalBrain.friendly) {
      return window.JarvisLocalBrain.friendly(message);
    }
    return message;
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
    if (!window.JarvisLocalBrain) return Promise.reject(new Error('The local brain module did not load.'));
    return window.JarvisLocalBrain.ensureLoaded()
      .then(function () {
        return window.JarvisLocalBrain.generate({
          system: 'Reply with exactly: ready',
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 24,
          temperature: 0
        });
      })
      .then(function (text) { return { ok: true, text: (text || '').slice(0, 80) }; })
      .catch(function (error) { return { ok: false, error: error.message }; });
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
      '<tool>{"name":"search_documents","query":"battery saver"}</tool>',
      'Available actions (name(required args) — purpose):',
      toolLines || '- device_stats() — phone status',
      '',
      'Rules for actions:',
      '- Never claim an action happened. The app runs it and sends the real result back as <tool_result>.',
      '- Each result says verified or unverified. Repeat that honestly, including when Android could not confirm it.',
      '- If an action is impossible on this phone, say so instead of inventing a workaround. There is no shell, no terminal and no unrestricted background work.',
      '- Never show tool tags in your final answer.'
    );
    if (options.context) {
      lines.push('', 'Relevant library context:', '"""', options.context, '"""');
    }
    if (options.documents) {
      lines.push('', 'Passages from the user\'s own documents (search results, ranked locally):', '"""', options.documents, '"""',
        'When you use these, say which document the answer came from. If they do not contain the answer, say so.');
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
