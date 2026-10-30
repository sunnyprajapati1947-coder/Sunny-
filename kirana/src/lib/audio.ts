/** Scan feedback: beep + vibration. Kept dependency-free so it works offline. */
let ctx: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function getContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export interface BeepOptions {
  frequency?: number
  duration?: number
  volume?: number
  type?: OscillatorType
}

export function beep({ frequency = 1180, duration = 0.075, volume = 0.16, type = 'sine' }: BeepOptions = {}): void {
  const audio = getContext()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0, audio.currentTime)
  gain.gain.linearRampToValueAtTime(volume, audio.currentTime + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + duration + 0.02)
}

export function beepSuccess(): void {
  beep({ frequency: 1240, duration: 0.06 })
  window.setTimeout(() => beep({ frequency: 1680, duration: 0.07, volume: 0.12 }), 65)
}

export function beepError(): void {
  beep({ frequency: 220, duration: 0.28, type: 'square', volume: 0.1 })
}

/**
 * Must be called once from a user gesture (Android blocks audio otherwise).
 */
export function unlockAudio(): void {
  getContext()
}

export type HapticPattern = 'scan' | 'success' | 'error' | 'tap'

export function vibrate(pattern: HapticPattern = 'tap'): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  switch (pattern) {
    case 'scan':
      navigator.vibrate(28)
      break
    case 'success':
      navigator.vibrate([24, 40, 24])
      break
    case 'error':
      navigator.vibrate([90, 60, 90])
      break
    default:
      navigator.vibrate(12)
  }
}

export function scanFeedback(ok = true): void {
  if (ok) beepSuccess()
  else beepError()
  vibrate(ok ? 'scan' : 'error')
}
