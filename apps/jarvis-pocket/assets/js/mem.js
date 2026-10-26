/* JARVIS — memory budget guard.
 *
 * Phones reclaim memory without asking: an 8 GB OPPO still kills a WebView that
 * grows past what the system is willing to give it. This module measures the
 * device at runtime (ActivityManager through the native plugin, with a browser
 * fallback), enforces a user-configurable budget, refuses a model load that
 * cannot fit, and recovers by releasing the engine instead of letting the
 * process die.
 *
 * Every number here is either measured or marked unknown — nothing is invented.
 */
(function () {
  'use strict';

  var UI = window.JarvisUI;

  var KEY_BUDGET = 'mem.budgetMb';
  var CAP_MB = 10240;          // 10 GB: the ceiling the 1.0 spec allows
  var FLOOR_MB = 512;
  var SAFETY_MB = 220;         // keep this much free for the rest of Android
  var SAMPLE_MS = 15000;

  var state = {
    snapshot: null,
    at: 0,
    timer: null,
    listeners: [],
    lastReleaseAt: 0
  };

  function clamp(value, low, high) {
    value = Number(value);
    if (!isFinite(value) || value <= 0) return low;
    return Math.max(low, Math.min(high, Math.round(value)));
  }

  /* --------------------------------------------------------------- budget */

  function budgetMb() {
    var stored = Number(UI.storeGet(KEY_BUDGET, 0) || 0);
    if (stored && stored > 0) return clamp(stored, FLOOR_MB, CAP_MB);
    // Default: half of what the phone reports, never more than the 10 GB cap.
    var total = state.snapshot && state.snapshot.totalMb;
    if (total) return clamp(total * 0.5, FLOOR_MB, CAP_MB);
    return 4096;
  }

  function setBudget(mb) {
    var value = clamp(mb, FLOOR_MB, CAP_MB);
    UI.storeSet(KEY_BUDGET, value);
    return value;
  }

  /* -------------------------------------------------------------- measure */

  function nativeBridge() {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    return plugins.JarvisTools || null;
  }

  function heuristic() {
    var gb = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);
    return {
      source: gb ? 'browser hint (navigator.deviceMemory)' : 'unknown',
      native: false,
      totalMb: gb ? Math.round(gb * 1024) : 0,
      availMb: 0,
      lowMemory: false,
      thresholdMb: 0,
      cores: cores || 0,
      measured: false
    };
  }

  function sample() {
    var bridge = nativeBridge();
    var pending;
    if (bridge && typeof bridge.deviceStats === 'function') {
      pending = Promise.resolve(bridge.deviceStats({})).then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'device stats failed');
        return {
          source: 'ActivityManager',
          native: true,
          totalMb: Math.round(data.totalRamMb || 0),
          availMb: Math.round(data.availRamMb || 0),
          lowMemory: !!data.lowMemory,
          thresholdMb: Math.round(data.thresholdMb || 0),
          cores: Number(data.cores || 0),
          measured: true,
          device: data.device || '',
          android: data.android || '',
          sdk: Number(data.sdk || 0),
          batteryPct: data.batteryPct == null ? null : Number(data.batteryPct),
          charging: !!data.charging,
          freeStorageMb: Math.round(data.freeStorageMb || 0),
          totalStorageMb: Math.round(data.totalStorageMb || 0)
        };
      }).catch(function () { return heuristic(); });
    } else {
      pending = Promise.resolve(heuristic());
    }
    return pending.then(function (next) {
      next.budgetMb = budgetMb();
      next.capMb = CAP_MB;
      next.needHeadroomMb = SAFETY_MB;
      next.at = Date.now();
      state.snapshot = next;
      state.at = next.at;
      state.listeners.forEach(function (listener) {
        try { listener(next); } catch (error) { /* a listener must not break sampling */ }
      });
      return next;
    });
  }

  function statusSync() {
    return state.snapshot || heuristic();
  }

  /* ---------------------------------------------------------------- guard */

  function check(needMb) {
    var snap = state.snapshot || heuristic();
    var budget = budgetMb();
    var need = Math.max(0, Math.round(Number(needMb) || 0));
    var required = need + SAFETY_MB;
    var out = { needMb: need, requiredMb: required, budgetMb: budget, snapshot: snap, ok: false, reason: '', advice: '' };

    if (requirementTooBig()) {
      out.reason = 'budget';
      out.advice = 'The model needs about ' + need + ' MB but the JARVIS memory budget is ' + budget +
        ' MB. Raise the budget in Dashboard → Memory, or pick a smaller build.';
      return out;
    }
    function requirementTooBig() { return need > 0 && required > budget; }

    if (!snap.measured) {
      // No native reading: allow the attempt, but say clearly that it is a guess.
      out.ok = true;
      out.reason = 'unknown';
      out.advice = 'The phone did not report free memory, so this load was not pre-checked. If it fails, close other apps and retry.';
      return out;
    }
    if (snap.lowMemory) {
      out.reason = 'low-memory';
      out.advice = 'Android already reports a low-memory state. Close a few apps, then load the brain again.';
      return out;
    }
    if (snap.availMb && snap.availMb < required) {
      out.reason = 'insufficient';
      out.advice = 'Only ' + snap.availMb + ' MB is free and the brain needs about ' + required +
        ' MB. Close heavy apps (camera, games, Chrome tabs) and try again.';
      return out;
    }
    out.ok = true;
    out.advice = snap.availMb
      ? snap.availMb + ' MB free, about ' + required + ' MB needed.'
      : 'Enough memory reported.';
    return out;
  }

  /* -------------------------------------------------------------- recovery */

  function releaseBrain() {
    var B = window.JarvisLocalBrain;
    if (!B || typeof B.release !== 'function') return Promise.resolve(false);
    return Promise.resolve(B.release()).then(function () { return true; }).catch(function () { return false; });
  }

  function dropTransientCaches() {
    var B = window.JarvisLocalBrain;
    return Promise.resolve().then(function () {
      // Only the engine's own transient objects are dropped; the model files in
      // CacheStorage are deliberately kept, otherwise recovery would mean
      // re-downloading half a gigabyte.
      if (B && typeof B.clearTransient === 'function') return B.clearTransient();
      return null;
    }).catch(function () { return null; });
  }

  function recover(reason) {
    return Promise.all([releaseBrain(), dropTransientCaches()]).then(function (results) {
      return sample().then(function (snap) {
        state.lastReleaseAt = Date.now();
        return {
          released: !!results[0],
          reason: reason || 'memory pressure',
          snapshot: snap,
          advice: 'The on-device brain was unloaded to free memory. Chat, tools, memory and the ' +
            'library keep working; reload the brain from Settings → Local brain when you are ready.'
        };
      });
    });
  }

  function shouldRecover(error) {
    var message = String((error && error.message) || error || '');
    if (!/out of memory|OOM|Allocation failed|memory access out of bounds|Array buffer allocation|RangeError/i.test(message)) {
      return '';
    }
    // Do not thrash: one automatic release per two minutes.
    if (Date.now() - state.lastReleaseAt < 120000) return '';
    return message;
  }

  /* ---------------------------------------------------------------- watch */

  function notify(snap) {
    state.listeners.forEach(function (listener) {
      try { listener(snap); } catch (error) { /* ignore */ }
    });
  }

  function startWatch(onChange) {
    if (typeof onChange === 'function') state.listeners.push(onChange);
    if (state.timer) return state.timer;
    state.timer = setInterval(function () {
      sample().then(notify).catch(function () {});
    }, SAMPLE_MS);
    if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
    return state.timer;
  }

  function stopWatch(onChange) {
    if (typeof onChange === 'function') {
      state.listeners = state.listeners.filter(function (item) { return item !== onChange; });
    }
    if (!state.listeners.length && state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  window.JarvisMem = {
    CAP_MB: CAP_MB,
    FLOOR_MB: FLOOR_MB,
    SAFETY_MB: SAFETY_MB,
    status: sample,
    statusSync: statusSync,
    budgetMb: budgetMb,
    setBudget: setBudget,
    check: check,
    recover: recover,
    shouldRecover: shouldRecover,
    startWatch: startWatch,
    stopWatch: stopWatch,
    reset: function () {
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      state.listeners = [];
      state.snapshot = null;
      state.lastReleaseAt = 0;
    }
  };
})();
