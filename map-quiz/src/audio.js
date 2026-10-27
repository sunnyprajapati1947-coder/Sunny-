/* Sound effects (WebAudio) + speech (SpeechSynthesis). Both are optional and
 * fail silently on browsers that block them. */

let ctx = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, startDelay, duration, gain = 0.07, type = "sine") {
  const ac = audioContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const at = ac.currentTime + startDelay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function beep(kind = "tap") {
  try {
    if (kind === "good") {
      tone(660, 0, 0.1);
      tone(990, 0.075, 0.14);
    } else if (kind === "bad") {
      tone(210, 0, 0.16, 0.06, "triangle");
      tone(150, 0.08, 0.2, 0.05, "triangle");
    } else if (kind === "win") {
      tone(523, 0, 0.11);
      tone(659, 0.09, 0.11);
      tone(784, 0.18, 0.16);
      tone(1046, 0.28, 0.26, 0.05);
    } else {
      tone(440, 0, 0.05, 0.035);
    }
  } catch {
    /* no audio available */
  }
}

export function speak(text, lang = "en-IN") {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.94;
    const voices = synth.getVoices?.() || [];
    const match = voices.find((v) => v.lang?.toLowerCase() === lang.toLowerCase());
    if (match) utter.voice = match;
    synth.speak(utter);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
