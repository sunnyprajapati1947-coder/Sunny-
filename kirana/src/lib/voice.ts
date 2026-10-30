/** Hindi voice search using the Web Speech API (Chrome/Android). */

interface SpeechRecognitionResultLike {
  transcript: string
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike> & { isFinal: boolean }>
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export function voiceSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition)
}

export interface VoiceSearchController {
  stop: () => void
}

export function startVoiceSearch(
  onResult: (text: string, isFinal: boolean) => void,
  options: { lang?: string; onError?: (message: string) => void; onEnd?: () => void } = {},
): VoiceSearchController | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) {
    options.onError?.('Voice search is not supported on this browser')
    return null
  }
  const recognition = new Ctor()
  recognition.lang = options.lang ?? 'hi-IN'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    let text = ''
    let final = false
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      text += result[0]?.transcript ?? ''
      if (result.isFinal) final = true
    }
    onResult(text.trim(), final)
  }
  recognition.onerror = (event) => {
    const code = (event as unknown as { error?: string }).error ?? 'unknown'
    options.onError?.(code === 'not-allowed' ? 'Mic permission chahiye' : `Voice error: ${code}`)
  }
  recognition.onend = () => options.onEnd?.()

  try {
    recognition.start()
  } catch {
    options.onError?.('Voice search could not start')
    return null
  }
  return { stop: () => recognition.stop() }
}

/** "do kilo chawal" → { qty: 2, unit: 'kg', text: 'chawal' } */
export interface SpokenQuantity {
  qty: number | null
  unit: string | null
  text: string
}

const HINDI_NUMBERS: Record<string, number> = {
  aadha: 0.5,
  आधा: 0.5,
  adha: 0.5,
  ek: 1,
  एक: 1,
  do: 2,
  दो: 2,
  teen: 3,
  तीन: 3,
  char: 4,
  चार: 4,
  paanch: 5,
  पांच: 5,
  पाँच: 5,
  chhah: 6,
  छह: 6,
  saat: 7,
  सात: 7,
  aath: 8,
  आठ: 8,
  nau: 9,
  नौ: 9,
  das: 10,
  दस: 10,
  dedh: 1.5,
  डेढ़: 1.5,
  dhai: 2.5,
  ढाई: 2.5,
}

export function parseSpokenQuantity(transcript: string): SpokenQuantity {
  const text = transcript.toLowerCase().trim()
  let qty: number | null = null
  let unit: string | null = null

  const numeric = text.match(/(\d+(?:\.\d+)?)/)
  if (numeric) qty = Number(numeric[1])

  if (qty === null) {
    for (const [word, value] of Object.entries(HINDI_NUMBERS)) {
      if (new RegExp(`(^|\\s)${word}(\\s|$)`).test(text)) {
        qty = value
        break
      }
    }
  }

  if (/किलो|kilo|kg|केजी/.test(text)) unit = 'kg'
  else if (/ग्राम|gram|gm|g\b/.test(text)) unit = 'g'
  else if (/लीटर|litre|liter|ltr/.test(text)) unit = 'litre'
  else if (/पैकेट|packet|pkt/.test(text)) unit = 'packet'
  else if (/नग|pcs|piece/.test(text)) unit = 'pcs'

  return { qty, unit, text }
}
