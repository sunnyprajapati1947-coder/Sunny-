/* Jarvis Pocket — chat screen: streaming, tools, memory, history. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Pack = window.JarvisPack;
  var MD = window.JarvisMarkdown;
  var LLM = window.JarvisLLM;
  var Voice = window.JarvisVoice;
  var Memory = window.JarvisMemory;

  var MAX_CHATS = 30;
  var state = { chats: null, generating: false, controller: null, pending: null, stick: true };
  var els = {};
  var liveRenderTimer = null;
  var lastRenderAt = 0;

  /* ---------------------------------------------------------------- store */

  function loadStore() {
    if (state.chats) return state.chats;
    var stored = UI.storeGet('chats', null);
    if (!stored || !Array.isArray(stored.list) || !stored.list.length) {
      var chat = createChat();
      state.chats = { active: chat.id, list: [chat] };
    } else {
      state.chats = stored;
      if (!state.chats.list.filter(function (c) { return c.id === state.chats.active; }).length) {
        state.chats.active = state.chats.list[0].id;
      }
    }
    return state.chats;
  }

  function createChat() {
    return {
      id: UI.uid('chat'),
      title: 'New chat',
      created: Date.now(),
      updated: Date.now(),
      messages: []
    };
  }

  function activeChat() {
    var store = loadStore();
    var chat = store.list.filter(function (item) { return item.id === store.active; })[0];
    if (!chat) {
      chat = store.list[0];
      store.active = chat.id;
    }
    return chat;
  }

  function persist() {
    var store = loadStore();
    store.list.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    store.list = store.list.slice(0, MAX_CHATS);
    var ok = UI.storeSet('chats', store);
    if (!ok) {
      store.list = store.list.slice(0, 6);
      store.list.forEach(function (chat) {
        if (chat.messages.length > 30) chat.messages = chat.messages.slice(-30);
      });
      UI.storeSet('chats', store);
    }
  }

  function newChat(announce) {
    var store = loadStore();
    var existing = store.list[0];
    if (existing && !existing.messages.length) {
      store.active = existing.id;
      persist();
      if (announce) render();
      return existing;
    }
    var chat = createChat();
    store.list.unshift(chat);
    store.active = chat.id;
    persist();
    if (announce) {
      render();
      scrollBottom(true);
    }
    return chat;
  }

  /* ---------------------------------------------------------------- render */

  function emptyState() {
    var ready = LLM.isReady();
    var stats = Pack.stats();
    var suggestions = [
      'What can you do?',
      'Make me a plan for a voice assistant',
      'Name the 3 best skills for coding',
      'What does the library say about memory?'
    ];
    return '' +
      '<div class="empty-chat">' +
        '<div class="orb orb-lg" aria-hidden="true"></div>' +
        '<h1>Hello, I am Jarvis</h1>' +
        '<p>' + (ready
          ? 'Ask me anything — I answer from ' + stats.items + ' skills, agents and guides across your ' + stats.packs + ' repos.'
          : 'I answer from the library right now. Install the on-device brain and I can think for myself — fully offline.') + '</p>' +
        (ready ? '' :
          '<a class="btn btn-primary" href="#/local">' +
            UI.icon('brain') + 'install the on-device brain</a>') +
        '<div class="suggestions">' + suggestions.map(function (text) {
          return '<button class="suggestion" data-suggest="' + UI.esc(text) + '">' + UI.esc(text) + '</button>';
        }).join('') + '</div>' +
        '<p class="empty-foot">' + stats.items + ' items · ' + stats.packs + ' packs · offline library</p>' +
      '</div>';
  }

  function sourceChips(ids) {
    if (!ids || !ids.length) return '';
    var chips = ids.map(function (id) {
      var item = Pack.getItem(id);
      if (!item) return '';
      return '<a class="src-chip" href="#/item/' + encodeURIComponent(id) + '">' +
        UI.icon('book') + '<span>' + UI.esc(item.t) + '</span></a>';
    }).filter(Boolean).slice(0, 3).join('');
    return chips ? '<div class="msg-src"><span>Sources</span>' + chips + '</div>' : '';
  }

  function messageHtml(message, index) {
    if (message.r === 'u') {
      return '<div class="msg msg-u" data-mid="' + index + '"><div class="bubble">' + UI.esc(message.t) + '</div></div>';
    }
    if (message.r === 'e') {
      return '<div class="msg msg-a" data-mid="' + index + '">' +
        '<div class="avatar avatar-warn">' + UI.icon('alert') + '</div>' +
        '<div class="msg-body"><div class="bubble bubble-error">' + UI.esc(message.t) + '</div>' +
        '<div class="msg-actions"><button data-act="retry">' + UI.icon('refresh') + '<span>Retry</span></button>' +
        '<a href="#/settings">' + UI.icon('settings') + '<span>Settings</span></a></div></div></div>';
    }
    var body = message.t ? MD.render(message.t, null) : '<p class="muted">…</p>';
    return '<div class="msg msg-a" data-mid="' + index + '">' +
      '<div class="avatar">' + UI.icon('spark') + '</div>' +
      '<div class="msg-body">' +
        '<div class="bubble md">' + body + '</div>' +
        '<div class="msg-actions">' +
          '<button data-act="copy" data-index="' + index + '">' + UI.icon('copy') + '<span>Copy</span></button>' +
          '<button data-act="speak" data-index="' + index + '">' + UI.icon('volume') + '<span>Speak</span></button>' +
          '<button data-act="share" data-index="' + index + '">' + UI.icon('share') + '<span>Share</span></button>' +
        '</div>' +
        sourceChips(message.src) +
      '</div></div>';
  }

  function renderMessages() {
    var chat = activeChat();
    if (!chat.messages.length) {
      els.scroll.innerHTML = emptyState();
      els.scroll.classList.add('is-empty');
    } else {
      els.scroll.classList.remove('is-empty');
      els.scroll.innerHTML = chat.messages.map(messageHtml).join('');
    }
    updateStatus();
  }

  function render() {
    if (!els.scroll) return;
    renderMessages();
    scrollBottom(true);
  }

  function scrollBottom(force) {
    if (!els.scroll) return;
    if (!force && !state.stick) return;
    requestAnimationFrame(function () {
      els.scroll.scrollTop = els.scroll.scrollHeight;
    });
  }

  function updateStatus() {
    if (!els.note) return;
    var config = LLM.settings();
    var provider = LLM.providerOf(config);
    var ready = LLM.isReady(config);
    els.note.textContent = ready ? (provider.label + ' · ' + config.model) : 'library mode (brain not loaded)';
    els.note.classList.toggle('is-off', !ready);
    if (els.speakToggle) els.speakToggle.checked = !!UI.storeGet('voice.speak', false);
  }

  function screen() {
    var stats = Pack.stats();
    return '' +
      '<section class="chat-screen">' +
        '<div class="chat-status">' +
          '<a class="status-chip" href="#/settings">' + UI.icon('spark') + '<span id="chatNote">' + UI.esc(stats.items) + ' items ready</span></a>' +
          '<div class="chat-status-actions">' +
            '<button class="icon-btn" data-act="history" aria-label="Chat history">' + UI.icon('clock') + '</button>' +
            '<button class="icon-btn" data-act="new" aria-label="New chat">' + UI.icon('plus') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chat-scroll" id="chatScroll" role="log" aria-live="polite"></div>' +
        '<div class="composer">' +
          '<div class="composer-inner">' +
            '<textarea id="chatInput" rows="1" placeholder="Ask Jarvis anything…" enterkeyhint="send" autocomplete="off"></textarea>' +
            '<button class="composer-btn" id="micBtn" aria-label="Voice input">' + UI.icon('mic') + '</button>' +
            '<button class="send-btn" id="sendBtn" aria-label="Send message">' + UI.icon('send') + '</button>' +
          '</div>' +
          '<div class="composer-foot">' +
            '<label class="switch"><input type="checkbox" id="speakToggle"><span>' + UI.icon('volume') + 'Speak answers</span></label>' +
            '<span class="composer-hint" id="composerHint">Voice · markdown · offline</span>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function mount() {
    els.view = document.getElementById('view');
    els.scroll = document.getElementById('chatScroll');
    els.input = document.getElementById('chatInput');
    els.send = document.getElementById('sendBtn');
    els.mic = document.getElementById('micBtn');
    els.note = document.getElementById('chatNote');
    els.speakToggle = document.getElementById('speakToggle');
    if (!els.scroll) return;

    renderMessages();
    scrollBottom(true);
    autoGrow();
    bind();
    if (state.pending) {
      var question = state.pending;
      state.pending = null;
      send(question);
    }
  }

  function autoGrow() {
    if (!els.input) return;
    els.input.style.height = 'auto';
    var height = Math.min(140, els.input.scrollHeight);
    els.input.style.height = height + 'px';
  }

  function setBusy(busy) {
    state.generating = busy;
    if (!els.send) return;
    els.send.classList.toggle('is-stop', busy);
    els.send.innerHTML = busy ? UI.icon('stop') : UI.icon('send');
    els.send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message');
    if (els.mic) els.mic.disabled = busy;
  }

  var docBound = false;

  function bind() {
    els.input.addEventListener('input', autoGrow);
    els.input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && window.innerWidth >= 760) {
        event.preventDefault();
        submit();
      }
    });
    els.send.addEventListener('click', function () {
      if (state.generating) stopGenerating();
      else submit();
    });
    els.mic.addEventListener('click', toggleMic);

    els.speakToggle.addEventListener('change', function () {
      UI.storeSet('voice.speak', els.speakToggle.checked);
      if (!els.speakToggle.checked) Voice.stopSpeaking();
    });

    els.scroll.addEventListener('scroll', function () {
      var distance = els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight;
      state.stick = distance < 120;
    });

    if (docBound) return;
    docBound = true;

    document.addEventListener('click', function (event) {
      var suggest = event.target.closest('[data-suggest]');
      if (suggest) {
        var text = suggest.getAttribute('data-suggest');
        if (els.input) {
          els.input.value = text;
          autoGrow();
        }
        submit();
        return;
      }
      var action = event.target.closest('[data-act]');
      if (!action || !els.scroll || !els.scroll.contains(action)) return;
      var kind = action.getAttribute('data-act');
      var index = Number(action.getAttribute('data-index'));
      var chat = activeChat();
      var message = chat.messages[index];
      if (kind === 'copy' && message) UI.copyAndToast(message.t, 'Answer');
      if (kind === 'speak' && message) {
        Voice.speak(message.t, { voiceURI: UI.storeGet('voice.uri', ''), rate: UI.storeGet('voice.rate', 1) });
      }
      if (kind === 'share' && message) {
        UI.share({ title: 'Jarvis', text: message.t, url: location.href });
      }
      if (kind === 'retry') retry();
    }, true);

    document.addEventListener('click', function (event) {
      var action = event.target.closest('[data-act="history"], [data-act="new"]');
      if (!action) return;
      if (action.getAttribute('data-act') === 'history') openHistory();
      else {
        newChat(true);
        if (els.input) els.input.focus();
      }
    });
  }

  function submit() {
    var value = els.input ? els.input.value.trim() : '';
    if (!value || state.generating) return;
    els.input.value = '';
    autoGrow();
    send(value);
  }

  function toggleMic() {
    if (Voice.isListening()) {
      Voice.stop();
      els.mic.classList.remove('is-live');
      return;
    }
    Voice.stopSpeaking();
    var lang = UI.storeGet('voice.lang', '') || navigator.language || 'en-IN';
    els.mic.classList.add('is-live');
    Voice.start({
      lang: lang,
      onPartial: function (text) {
        if (!els.input) return;
        els.input.value = text;
        autoGrow();
      },
      onFinal: function (text) {
        els.mic.classList.remove('is-live');
        if (els.input) els.input.value = text;
        autoGrow();
        if (UI.storeGet('voice.autoSend', true)) setTimeout(submit, 260);
      },
      onError: function (message) {
        els.mic.classList.remove('is-live');
        UI.toast(message, { tone: 'warn', icon: 'mic' });
      },
      onEnd: function () {
        els.mic.classList.remove('is-live');
      }
    });
  }

  /* ----------------------------------------------------------------- chat */

  function modelMessages(chat, upTo) {
    var end = typeof upTo === 'number' ? upTo : chat.messages.length;
    return chat.messages
      .slice(0, end)
      .filter(function (message) { return (message.r === 'u' || message.r === 'a') && message.t; })
      .slice(-12)
      .map(function (message) {
        return { role: message.r === 'u' ? 'user' : 'assistant', content: message.t };
      });
  }

  function extractTools(text) {
    var tools = [];
    var pattern = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      try {
        var parsed = JSON.parse(match[1]);
        if (parsed && parsed.name) tools.push(parsed);
      } catch (error) { /* ignore malformed tool call */ }
    }
    return tools.slice(0, 3);
  }

  function stripTools(text) {
    return String(text || '')
      .replace(/<tool>[\s\S]*?<\/tool>/g, '')
      .replace(/<tool>[\s\S]*$/, '')
      .replace(/<tool_result>[\s\S]*?<\/tool_result>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function execTool(tool) {
    var name = String(tool.name || '').toLowerCase();
    if (name === 'kb_search') {
      var hits = Pack.searchScored(tool.query || '', 6);
      if (!hits.length) return Promise.resolve('No library matches for "' + (tool.query || '') + '".');
      return Promise.resolve(hits.map(function (hit) {
        var pack = Pack.packOf(hit.item);
        return '- id:' + hit.item.i + ' | ' + hit.item.t + ' | ' + Pack.typeOf(hit.item) + ' | ' + (pack ? pack.name : '') + ' | ' + (hit.item.d || '').slice(0, 90);
      }).join('\n'));
    }
    if (name === 'kb_open') {
      var item = Pack.getItem(tool.id || '');
      if (!item) return Promise.resolve('Unknown id. Use kb_search first.');
      return Pack.bodyText(item.i).then(function (body) {
        return 'TITLE: ' + item.t + '\nTYPE: ' + Pack.typeOf(item) + '\nPATH: ' + item.f + '\n\n' + body.slice(0, 3000);
      }).catch(function () {
        return 'Could not load that item.';
      });
    }
    if (name === 'remember') {
      var entry = Memory.add(tool.text || '');
      if (!entry || entry.ok === false) return Promise.resolve((entry && entry.error) || 'Nothing to save.');
      return Promise.resolve('Saved to memory: ' + entry.text);
    }
    if (name === 'task_create') {
      var Tasks = window.JarvisTasks;
      if (!Tasks) return Promise.resolve('The task engine did not load.');
      var task = Tasks.create(tool.goal || tool.text || '', { title: tool.title || '' });
      if (!task) return Promise.resolve('The goal is empty — tell me what to do.');
      Tasks.run(task.id);
      return Promise.resolve('Task queued: "' + task.title + '" (id ' + task.id +
        '). Steps are planned automatically, failures are retried, and progress is shown in the Tasks tab.');
    }
    if (name === 'video_create') {
      if (!window.JarvisVideo) return Promise.resolve('The video studio did not load.');
      return window.JarvisVideo.create(String(tool.prompt || tool.text || tool.goal || '')).then(function (out) {
        return 'Video created: "' + out.title + '" — saved to the phone gallery (Movies/JARVIS).';
      }).catch(function (error) {
        return 'The video was not created: ' + error.message;
      });
    }
    if (name === 'task_status') {
      var queue = window.JarvisTasks ? window.JarvisTasks.list() : [];
      if (tool.id) queue = queue.filter(function (row) { return row.id === tool.id; });
      if (!queue.length) return Promise.resolve('No tasks found.');
      return Promise.resolve(queue.slice(0, 8).map(function (task) {
        return '- ' + task.id + ' | ' + task.status + ' | ' + task.title;
      }).join('\n'));
    }
    if (window.JarvisTools && window.JarvisTools.get(name)) {
      return window.JarvisTools.run(name, tool).then(function (result) {
        var status = result.verified ? 'verified' : 'unverified';
        return 'TOOL ' + name + ' (' + status + '): ' + (result.text || '') +
          (result.evidence ? '\nEVIDENCE: ' + result.evidence : '');
      });
    }
    return Promise.resolve('Unknown tool: ' + name);
  }

  function pushMessage(chat, message) {
    chat.messages.push(message);
    chat.updated = Date.now();
    persist();
  }

  function send(text) {
    var value = String(text || '').trim();
    if (!value || state.generating) return;
    var chat = activeChat();
    if (!chat.messages.length) chat.title = value.slice(0, 44);
    pushMessage(chat, { r: 'u', t: value, ts: Date.now() });
    renderMessages();
    scrollBottom(true);
    respond(chat);
  }

  function respond(chat) {
    setBusy(true);
    Voice.stopSpeaking();
    var userText = '';
    for (var i = chat.messages.length - 1; i >= 0; i -= 1) {
      if (chat.messages[i].r === 'u') {
        userText = chat.messages[i].t;
        break;
      }
    }

    var placeholderIndex = chat.messages.length;
    chat.messages.push({ r: 'a', t: '', ts: Date.now(), pending: true });
    renderMessages();
    scrollBottom(true);

    var liveIndex = placeholderIndex;
    var liveText = '';

    function finishedFromTool(text) {
      state.controller = null;
      setBusy(false);
      chat.messages[liveIndex] = { r: 'a', t: text, ts: Date.now() };
      chat.updated = Date.now();
      persist();
      if (els.scroll) {
        renderMessages();
        scrollBottom(false);
      }
    }

    function paint(force) {
      var now = Date.now();
      if (!force && now - lastRenderAt < 110) return;
      lastRenderAt = now;
      var node = els.scroll && els.scroll.querySelector('[data-mid="' + liveIndex + '"] .bubble');
      if (node) {
        node.innerHTML = liveText ? MD.render(stripTools(liveText), null) : '<p class="muted">Thinking…</p>';
        scrollBottom(false);
      }
    }

    function finish(text, error) {
      state.controller = null;
      setBusy(false);
      var cleaned = stripTools(text);
      if (error) {
        chat.messages[liveIndex] = { r: 'e', t: error, ts: Date.now() };
      } else if (!cleaned) {
        chat.messages[liveIndex] = { r: 'e', t: 'No answer came back. Try again or pick another model.', ts: Date.now() };
      } else {
        chat.messages[liveIndex] = { r: 'a', t: cleaned, ts: Date.now(), src: chat._src || [] };
      }
      chat._src = null;
      chat.updated = Date.now();
      persist();
      if (els.scroll) {
        renderMessages();
        scrollBottom(false);
      }
      if (!error && cleaned && UI.storeGet('voice.speak', false)) {
        Voice.speak(cleaned, {
          voiceURI: UI.storeGet('voice.uri', ''),
          rate: UI.storeGet('voice.rate', 1)
        });
      }
    }

    // Commands that touch the phone run through the verified tool layer first,
    // so they work even before the model is installed.
    var routed = window.JarvisTools && window.JarvisTools.routeCommand
      ? window.JarvisTools.routeCommand(userText) : null;
    if (routed) {
      window.JarvisTools.run(routed.tool, routed.args).then(function (result) {
        var head = result.verified
          ? (result.ok ? '**Done — verified.** ' : '**Not done.** ')
          : (result.ok ? '**Requested (not verifiable by Android).** ' : '**Not done.** ');
        var text = head + (result.text || '') +
          (result.evidence ? '\n\n_' + result.evidence + '_' : '');
        finishedFromTool(text);
      }).catch(function (error) {
        finishedFromTool('**Not done.** ' + error.message);
      });
      return;
    }

    if (!LLM.isReady()) {
      LLM.offlineAnswer(userText).then(function (result) {
        var text = typeof result === 'string' ? result : result.text;
        liveText = text;
        paint(true);
        finish(text);
      }).catch(function () {
        finish('', 'The offline library could not load either. Refresh the page and try again.');
      });
      return;
    }

    state.controller = window.AbortController ? new AbortController() : null;

    Pack.contextFor(userText, 3).then(function (context) {
      var hits = Pack.searchScored(userText, 3).map(function (hit) { return hit.item.i; });
      chat._src = hits;
      var system = LLM.buildSystem({ context: context, memory: Memory.list() });
      var messages = modelMessages(chat, liveIndex);
      if (!messages.length) {
        finish('', 'Message history is empty — send it again.');
        return;
      }

      var step = 0;
      var MAX_STEPS = 3;

      function next() {
        if (step >= MAX_STEPS) {
          finish(liveText);
          return;
        }
        step += 1;
        liveText = '';
        paint(true);
        LLM.complete({
          system: system,
          messages: messages,
          signal: state.controller ? state.controller.signal : undefined,
          onDelta: function (delta) {
            liveText += delta;
            if (els.scroll) {
              var node = els.scroll.querySelector('[data-mid="' + liveIndex + '"] .bubble');
              if (node && !node.querySelector('p.muted')) paint(false);
              else if (node) paint(false);
            }
          }
        }).then(function (text) {
          var finalText = text || liveText;
          var tools = extractTools(finalText);
          if (!tools.length) {
            finish(finalText);
            return;
          }
          liveText = stripTools(finalText);
          paint(true);
          messages.push({ role: 'assistant', content: finalText });
          var queue = Promise.resolve();
          tools.forEach(function (tool) {
            queue = queue.then(function () {
              return execTool(tool).then(function (result) {
                messages.push({ role: 'user', content: '<tool_result>\n' + result + '\n</tool_result>' });
              });
            });
          });
          queue.then(next);
        }).catch(function (error) {
          if (error && error.name === 'AbortError') {
            var partial = stripTools(liveText);
            if (partial) finish(partial + '\n\n_stopped_');
            else finish('', 'Stopped. Send it again when you are ready.');
            return;
          }
          finish('', error.message || 'The request failed.');
        });
      }

      next();
    }).catch(function () {
      finish('', 'The library could not load.');
    });
  }

  function stopGenerating() {
    if (state.controller) {
      try { state.controller.abort(); } catch (error) { /* ignore */ }
    }
  }

  function retry() {
    var chat = activeChat();
    while (chat.messages.length && chat.messages[chat.messages.length - 1].r !== 'u') {
      chat.messages.pop();
    }
    if (!chat.messages.length) return;
    chat.messages.pop();
    persist();
    renderMessages();
    respond(chat);
  }

  function openHistory() {
    var store = loadStore();
    var rows = store.list.map(function (chat) {
      var preview = '';
      for (var i = chat.messages.length - 1; i >= 0; i -= 1) {
        if (chat.messages[i].r === 'u') {
          preview = chat.messages[i].t;
          break;
        }
      }
      return '<button class="row' + (chat.id === store.active ? ' is-active' : '') + '" data-chat="' + chat.id + '">' +
        '<span class="row-icon">' + UI.icon('chat') + '</span>' +
        '<span class="row-main"><strong>' + UI.esc(chat.title || 'Chat') + '</strong>' +
        '<small>' + UI.esc((preview || 'Empty chat').slice(0, 70)) + ' · ' + UI.relativeTime(chat.updated) + '</small></span>' +
        '<span class="row-action" data-del="' + chat.id + '" role="button" aria-label="Delete chat">' + UI.icon('trash') + '</span>' +
        '</button>';
    }).join('');
    var host = UI.sheet('Chats', '<div class="rows">' + (rows || '<p class="muted">No chats yet.</p>') + '</div>');
    if (!host) return;
    host.addEventListener('click', function (event) {
      var del = event.target.closest('[data-del]');
      if (del) {
        event.stopPropagation();
        var id = del.getAttribute('data-del');
        store.list = store.list.filter(function (chat) { return chat.id !== id; });
        if (store.active === id) store.active = store.list[0] ? store.list[0].id : null;
        if (!store.list.length) store.list.push(createChat());
        if (!store.active) store.active = store.list[0].id;
        persist();
        UI.closeSheet();
        render();
        return;
      }
      var row = event.target.closest('[data-chat]');
      if (!row) return;
      store.active = row.getAttribute('data-chat');
      persist();
      UI.closeSheet();
      render();
    });
  }

  function askAboutText(text) {
    var question = String(text || '').trim();
    if (!question) return;
    if (location.hash === '#/' || location.hash === '' || !location.hash) {
      if (els.scroll) send(question);
      else {
        state.pending = question;
        location.hash = '#/';
      }
    } else {
      state.pending = question;
      location.hash = '#/';
    }
  }

  function askAbout(itemId) {
    var item = Pack.getItem(itemId);
    if (!item) return;
    state.pending = 'Explain this library item and tell me how to use it: "' + item.t + '" (id: ' + item.i + ')';
    if (location.hash === '#/' || location.hash === '') {
      if (els.scroll) {
        var text = state.pending;
        state.pending = null;
        send(text);
      }
    } else {
      location.hash = '#/';
    }
  }

  function speakLatest() {
    var chat = activeChat();
    var last = chat.messages[chat.messages.length - 1];
    if (last && last.r === 'a') Voice.speak(last.t, { voiceURI: UI.storeGet('voice.uri', '') });
  }

  window.JarvisChat = {
    screen: screen,
    mount: mount,
    send: send,
    newChat: newChat,
    askAbout: askAbout,
    askAboutText: askAboutText,
    openHistory: openHistory,
    speakLatest: speakLatest,
    isGenerating: function () { return state.generating; },
    activeTitle: function () { return activeChat().title; },
    exportAll: function () {
      var store = loadStore();
      return store.list.map(function (chat) {
        var lines = ['# ' + chat.title, ''];
        chat.messages.forEach(function (message) {
          var who = message.r === 'u' ? 'You' : message.r === 'e' ? 'Error' : 'Jarvis';
          lines.push('**' + who + ':** ' + message.t, '');
        });
        return lines.join('\n');
      }).join('\n\n---\n\n');
    }
  };
})();
