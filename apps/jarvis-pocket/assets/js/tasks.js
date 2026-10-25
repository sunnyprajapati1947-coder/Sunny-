/* JARVIS — task queue with planning, retries and background continuation. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var LLM = window.JarvisLLM;
  var N = window.JarvisNative || { available: false };

  var KEY = 'tasks';
  var MAX_RETRIES = 2;
  var running = false;
  var active = {};

  function list() {
    var items = UI.storeGet(KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function save(items) {
    UI.storeSet(KEY, items.slice(0, 60));
  }

  function find(id) {
    return list().filter(function (task) { return task.id === id; })[0] || null;
  }

  function patch(id, changes) {
    var items = list();
    var task = items.filter(function (row) { return row.id === id; })[0];
    if (!task) return null;
    Object.keys(changes).forEach(function (key) { task[key] = changes[key]; });
    task.updated = Date.now();
    save(items);
    return task;
  }

  function create(goal, options) {
    options = options || {};
    var text = String(goal || '').trim();
    if (!text) return null;
    var steps = (options.steps || []).map(function (step) {
      return { title: String(step).slice(0, 300), status: 'pending', tries: 0, result: '' };
    });
    var task = {
      id: 'tsk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: String(options.title || text).slice(0, 90),
      goal: text.slice(0, 4000),
      steps: steps,
      status: steps.length ? 'PENDING' : 'PENDING',
      created: Date.now(),
      updated: Date.now(),
      error: ''
    };
    var items = list();
    items.unshift(task);
    save(items);
    return task;
  }

  function plan(goal) {
    if (!LLM.isReady()) return Promise.resolve([]);
    var system = 'You plan work for a phone assistant. Reply with JSON only: ' +
      '{"steps":["short imperative step", "..."]}. Use 2 to 5 steps, each doable in one message, ' +
      'no markdown, no extra text, no tool tags.';
    return LLM.complete({
      system: system,
      messages: [{ role: 'user', content: 'Goal: ' + goal.slice(0, 1200) }],
      stream: false
    }).then(function (text) {
      var raw = String(text || '').replace(/```[a-z]*/gi, '').trim();
      var match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          var parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.steps)) {
            return parsed.steps.filter(Boolean).slice(0, 5).map(function (step) {
              return String(step).slice(0, 300);
            });
          }
        } catch (error) { /* fall through to line parsing */ }
      }
      return raw.split('\n').map(function (line) {
        return line.replace(/^\s*[-*\d.)]+\s*/, '').trim();
      }).filter(function (line) { return line.length > 2; }).slice(0, 5);
    }).catch(function () { return []; });
  }

  function notify(title, body, ongoing) {
    if (N.available && N.notify) N.notify(title, body).catch(function () {});
    return null;
  }

  function background(on, text) {
    if (N.available && N.background) N.background(on, text);
  }

  function runStep(task, index) {
    var step = task.steps[index];
    var done = task.steps.slice(0, index).map(function (row, i) {
      return (i + 1) + '. ' + row.title + (row.result ? ' => ' + row.result.slice(0, 200) : '');
    }).join('\n');
    var system = 'You are JARVIS executing one step of a task on the user\'s phone. ' +
      'Do the step now and reply with the concrete result or output. Be brief. ' +
      'If the step needs the user to do something on the phone, say exactly what to do. ' +
      'Never claim you performed an external action you cannot perform; say what is needed.';
    var prompt = 'Task: ' + task.goal + '\n\nCompleted steps:\n' + (done || '(none)') +
      '\n\nNow do step ' + (index + 1) + ': ' + step.title;
    return LLM.complete({
      system: system,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }).then(function (text) {
      var result = String(text || '').trim();
      if (!result) throw new Error('empty result');
      return result.slice(0, 4000);
    });
  }

  function retryDelay(attempt) {
    return new Promise(function (resolve) { setTimeout(resolve, 1200 * attempt); });
  }

  function executeStep(task, index) {
    return runStep(task, index).catch(function (error) {
      var current = find(task.id);
      if (!current || !current.steps[index]) throw error;
      var step = current.steps[index];
      step.tries = (step.tries || 0) + 1;
      var giveUp = step.tries > MAX_RETRIES;
      step.status = giveUp ? 'failed' : 'pending';
      step.error = String(error && error.message || error).slice(0, 300);
      patch(task.id, { steps: current.steps });
      render();
      if (giveUp) throw error;
      return retryDelay(step.tries).then(function () { return executeStep(task, index); });
    });
  }

  function run(id) {
    if (active[id]) return active[id];
    var promise = start(id);
    active[id] = promise;
    var release = function () { delete active[id]; };
    promise.then(release, release);
    return promise;
  }

  function start(id) {
    var task = find(id);
    if (!task) return Promise.resolve(null);
    if (!LLM.isReady()) {
      patch(id, { status: 'BLOCKED', error: 'AI key set nahi hai — Settings → AI provider.' });
      render();
      return Promise.resolve(null);
    }
    return Promise.resolve().then(function () {
      return ensurePlan(task);
    }).then(function (fresh) {
      var steps = fresh.steps.map(function (step) {
        return step.status === 'done' ? step : { title: step.title, status: 'pending', tries: step.tries || 0, result: '' };
      });
      patch(id, { status: 'RUNNING', error: '', steps: steps });
      render();
      background(true, 'Task chal raha hai: ' + fresh.title);
      var chain = Promise.resolve();
      fresh.steps.forEach(function (step, index) {
        chain = chain.then(function () {
          if (step.status === 'done') return null;
          return executeStep(fresh, index).then(function (result) {
            var current = find(id);
            current.steps[index].status = 'done';
            current.steps[index].result = result;
            current.steps[index].tries = 0;
            patch(id, { steps: current.steps });
            render();
            return null;
          });
        });
      });
      return chain.then(function () {
        patch(id, { status: 'DONE' });
        notify('JARVIS task done ✅', fresh.title);
        return find(id);
      }).catch(function (error) {
        var current = find(id);
        var failedIndex = current.steps.map(function (row) { return row.status; }).indexOf('pending');
        if (failedIndex >= 0) current.steps[failedIndex].status = 'failed';
        patch(id, { status: 'FAILED', error: String(error && error.message || error).slice(0, 300), steps: current.steps });
        notify('JARVIS task failed', fresh.title + ' — retry karo');
        return find(id);
      }).then(function (result) {
        background(false);
        render();
        return result;
      });
    });
  }

  function ensurePlan(task) {
    if (task.steps && task.steps.length) return Promise.resolve(task);
    return plan(task.goal).then(function (steps) {
      if (!steps.length) steps = [task.goal.slice(0, 300)];
      var mapped = steps.map(function (title) {
        return { title: title, status: 'pending', tries: 0, result: '' };
      });
      patch(task.id, { steps: mapped });
      return find(task.id);
    });
  }

  function pump() {
    if (running) return;
    var next = list().filter(function (task) {
      return (task.status === 'PENDING' || task.status === 'RUNNING') && !active[task.id];
    }).pop();
    if (!next) {
      background(false);
      return;
    }
    running = true;
    run(next.id).then(function () {
      running = false;
      setTimeout(pump, 800);
    }).catch(function () {
      running = false;
    });
  }

  function redo(id) {
    var task = find(id);
    if (!task) return;
    patch(id, {
      status: 'PENDING',
      error: '',
      steps: task.steps.map(function (step) {
        return step.status === 'done' ? step : { title: step.title, status: 'pending', tries: 0, result: '' };
      })
    });
    render();
    run(id);
  }

  /* ------------------------------------------------------------------- UI */

  var STATUS_TONE = { DONE: 'ok', FAILED: 'bad', RUNNING: '', PENDING: 'warn', BLOCKED: 'warn' };

  function screen() {
    var items = list();
    var form = '<div class="card">' +
      '<div class="card-head"><h2>' + UI.icon('spark') + 'Naya kaam</h2></div>' +
      '<label class="field"><span>Kya karna hai?</span>' +
      '<textarea id="taskGoal" rows="2" placeholder="Jaise: is hafte ke liye 3 YouTube video ideas banao aur unke titles + hooks likho"></textarea></label>' +
      '<div class="card-actions">' +
      '<button class="btn btn-primary" id="taskAdd">' + UI.icon('bolt') + 'Plan & start</button>' +
      (items.some(function (t) { return t.status === 'FAILED'; })
        ? '<button class="btn btn-ghost" id="taskRetryAll">Retry failed</button>' : '') +
      '</div>' +
      (LLM.isReady() ? '' : '<p class="muted small">Planning ke liye Settings me AI key daalo. Bina key ke task ek hi step me chalega.</p>') +
      '</div>';

    var rows = items.map(function (task) {
      var done = task.steps.filter(function (step) { return step.status === 'done'; }).length;
      var tone = STATUS_TONE[task.status] || '';
      var steps = task.steps.map(function (step, index) {
        return '<li class="task-step ' + step.status + '">' +
          '<span class="task-step-n">' + (step.status === 'done' ? '✓' : (index + 1)) + '</span>' +
          '<span class="task-step-t">' + UI.esc(step.title) + '</span>' +
          (step.result ? '<span class="task-step-r">' + UI.esc(step.result.slice(0, 260)) + '</span>' : '') +
          (step.error ? '<span class="task-step-r">⚠ ' + UI.esc(step.error.slice(0, 200)) + '</span>' : '') +
          '</li>';
      }).join('');
      return '<article class="card task-card" data-task="' + task.id + '">' +
        '<div class="card-head"><h2>' + UI.esc(task.title) + '</h2>' +
        '<span class="pill ' + tone + '">' + UI.esc(task.status) + '</span></div>' +
        '<p class="muted small">' + done + '/' + task.steps.length + ' steps · ' +
        new Date(task.updated || task.created).toLocaleString() + '</p>' +
        (steps ? '<ol class="task-steps">' + steps + '</ol>' : '') +
        (task.error ? '<p class="small" style="color:var(--bad)">' + UI.esc(task.error) + '</p>' : '') +
        '<div class="card-actions">' +
        (task.status === 'DONE' ? '' : '<button class="btn btn-ghost btn-sm" data-run="' + task.id + '">' +
          (task.status === 'FAILED' ? 'Retry' : 'Run') + '</button>') +
        '<button class="btn btn-ghost btn-sm" data-del="' + task.id + '">Delete</button>' +
        '</div></article>';
    }).join('');

    return '<section class="screen tasks-screen">' +
      '<div class="screen-head"><h1>Tasks</h1>' +
      '<p>Bolo kya karna hai — JARVIS steps banata hai, chalata hai, fail ho to dobara try karta hai.</p></div>' +
      form +
      (rows || '<div class="empty-block">' + UI.icon('clock') +
        '<h3>Abhi koi task nahi</h3><p>Upar goal likho aur “Plan & start” dabao.</p></div>') +
      '</section>';
  }

  function render() {
    if (window.JarvisApp && window.JarvisApp.render) window.JarvisApp.render();
  }

  function mount() {
    var add = document.getElementById('taskAdd');
    if (add) {
      add.addEventListener('click', function () {
        var goal = document.getElementById('taskGoal');
        var text = goal ? goal.value.trim() : '';
        if (!text) {
          UI.toast('Pehle batao kya karna hai', { tone: 'warn' });
          return;
        }
        var task = create(text);
        render();
        ensurePlan(task).then(function (fresh) {
          render();
          run(fresh.id);
        });
      });
    }
    var retryAll = document.getElementById('taskRetryAll');
    if (retryAll) {
      retryAll.addEventListener('click', function () {
        list().filter(function (task) { return task.status === 'FAILED'; })
          .forEach(function (task) { redo(task.id); });
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-run]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-run');
        var task = find(id);
        if (task && task.status === 'FAILED') redo(id);
        else run(id);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-del');
        save(list().filter(function (task) { return task.id !== id; }));
        render();
      });
    });
  }

  window.JarvisTasks = {
    create: create,
    plan: plan,
    run: run,
    redo: redo,
    list: list,
    pump: pump,
    screen: screen,
    mount: mount
  };

  window.addEventListener('load', function () {
    setTimeout(function () {
      if (list().some(function (task) {
        return task.status === 'PENDING' || task.status === 'RUNNING';
      })) pump();
    }, 2000);
  });
})();
