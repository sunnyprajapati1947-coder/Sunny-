/* Jarvis Pocket — speech input (Web Speech API) and spoken replies. */
(function () {
  'use strict';

  var UI = window.JarvisUI;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var recognition = null;
  var listening = false;
  var handlers = {};
  var cachedVoices = [];

  function sttSupported() {
    return !!Recognition;
  }

  function ttsSupported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  function refreshVoices() {
    if (!ttsSupported()) return [];
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch (error) {
      cachedVoices = [];
    }
    return cachedVoices;
  }

  if (ttsSupported() && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }
  refreshVoices();

  function voices() {
    if (!cachedVoices.length) refreshVoices();
    return cachedVoices.slice();
  }

  function defaultVoice() {
    var all = voices();
    var lang = (navigator.language || 'en-IN').toLowerCase();
    var exact = all.filter(function (voice) { return voice.lang && voice.lang.toLowerCase() === lang; });
    if (exact.length) return exact[0];
    var base = lang.slice(0, 2);
    var family = all.filter(function (voice) { return voice.lang && voice.lang.toLowerCase().indexOf(base) === 0; });
    if (family.length) return family[0];
    var english = all.filter(function (voice) { return /^en/i.test(voice.lang || ''); });
    return english[0] || all[0] || null;
  }

  function start(options) {
    if (!sttSupported()) {
      UI.toast('This browser has no voice input. Try Chrome or Safari.', { tone: 'warn' });
      return false;
    }
    if (listening) stop();
    handlers = options || {};
    try {
      recognition = new Recognition();
    } catch (error) {
      UI.toast('The microphone did not start', { tone: 'warn' });
      return false;
    }
    recognition.lang = handlers.lang || 'en-IN';
    recognition.continuous = !!handlers.continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      listening = true;
      if (handlers.onStart) handlers.onStart();
    };
    recognition.onresult = function (event) {
      var interim = '';
      var finalText = '';
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var result = event.results[i];
        var transcript = result[0] && result[0].transcript ? result[0].transcript : '';
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (interim && handlers.onPartial) handlers.onPartial(interim);
      if (finalText) {
        if (handlers.onFinal) handlers.onFinal(finalText.trim());
      }
    };
    recognition.onerror = function (event) {
      listening = false;
      var code = event.error || 'error';
      var message = code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Microphone permission is needed. Allow it in browser settings.'
        : code === 'no-speech'
          ? 'I did not hear anything — say it again.'
          : code === 'network'
            ? 'Voice input needs internet (the browser speech service).'
            : 'Voice error: ' + code;
      if (handlers.onError) handlers.onError(message, code);
    };
    recognition.onend = function () {
      listening = false;
      if (handlers.onEnd) handlers.onEnd();
    };

    try {
      recognition.start();
      return true;
    } catch (error) {
      listening = false;
      UI.toast('The microphone did not start', { tone: 'warn' });
      return false;
    }
  }

  function stop() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (error) { /* ignore */ }
    listening = false;
  }

  function stripForSpeech(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' code block. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/[*_>|]+/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2200);
  }

  function speak(text, options) {
    if (!ttsSupported()) {
      UI.toast('This browser has no voice output.', { tone: 'warn' });
      return false;
    }
    var plain = stripForSpeech(text);
    if (!plain) return false;
    stopSpeaking();
    var config = options || {};
    var utterance = new SpeechSynthesisUtterance(plain);
    var chosen = null;
    if (config.voiceURI) {
      chosen = voices().filter(function (voice) { return voice.voiceURI === config.voiceURI; })[0] || null;
    }
    if (!chosen) chosen = defaultVoice();
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = config.lang || navigator.language || 'en-IN';
    }
    utterance.rate = config.rate || 1;
    utterance.pitch = config.pitch || 1;
    utterance.onstart = function () { if (config.onStart) config.onStart(); };
    utterance.onend = function () { if (config.onEnd) config.onEnd(); };
    utterance.onerror = function () { if (config.onEnd) config.onEnd(); };
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      return false;
    }
  }

  function stopSpeaking() {
    if (!ttsSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch (error) { /* ignore */ }
  }

  function isListening() {
    return listening;
  }

  window.JarvisVoice = {
    sttSupported: sttSupported,
    ttsSupported: ttsSupported,
    start: start,
    stop: stop,
    speak: speak,
    stopSpeaking: stopSpeaking,
    voices: voices,
    defaultVoice: defaultVoice,
    isListening: isListening,
    stripForSpeech: stripForSpeech
  };
})();
