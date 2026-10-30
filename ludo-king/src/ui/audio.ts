/**
 * Procedural audio.
 *
 * Every sound effect and the background music loop are synthesised at runtime
 * with the Web Audio API, so the game ships with zero third-party audio assets
 * and no licensing obligations. The context is created lazily on the first user
 * gesture (browser autoplay policy) and can be muted independently for effects
 * and music.
 */

export type Sfx =
  | 'click'
  | 'roll'
  | 'step'
  | 'capture'
  | 'home'
  | 'win'
  | 'turn'
  | 'invalid'
  | 'six'
  | 'open';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicGeneration = 0;

  soundEnabled = true;
  musicEnabled = true;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.soundEnabled ? 0.85 : 0;
      this.sfx.connect(this.master);

      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicEnabled ? 0.16 : 0;
      this.music.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicEnabled) this.startMusic();
  }

  setSound(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (this.sfx && this.ctx) {
      this.sfx.gain.setTargetAtTime(enabled ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  setMusic(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (this.music && this.ctx) {
      this.music.gain.setTargetAtTime(enabled ? 0.16 : 0, this.ctx.currentTime, 0.2);
    }
    if (enabled) this.startMusic();
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(options: {
    freq: number;
    type?: OscillatorType;
    start?: number;
    duration?: number;
    gain?: number;
    glideTo?: number;
    destination?: GainNode | null;
  }): void {
    if (!this.ctx) return;
    const dest = options.destination ?? this.sfx;
    if (!dest) return;
    const t0 = this.now() + (options.start ?? 0);
    const dur = options.duration ?? 0.16;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = options.type ?? 'triangle';
    osc.frequency.setValueAtTime(options.freq, t0);
    if (options.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, options.glideTo), t0 + dur);
    const peak = options.gain ?? 0.25;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(options: {
    start?: number;
    duration?: number;
    gain?: number;
    filter?: number;
    filterType?: BiquadFilterType;
  }): void {
    if (!this.ctx || !this.sfx) return;
    const dur = options.duration ?? 0.2;
    const t0 = this.now() + (options.start ?? 0);
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = options.filterType ?? 'bandpass';
    filter.frequency.value = options.filter ?? 1400;
    filter.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.value = options.gain ?? 0.3;
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start(t0);
  }

  play(name: Sfx, detail?: number): void {
    if (!this.ctx || !this.soundEnabled) return;
    switch (name) {
      case 'click':
        this.tone({ freq: 660, duration: 0.06, gain: 0.12, type: 'square' });
        break;
      case 'open':
        this.tone({ freq: 420, duration: 0.12, gain: 0.12 });
        this.tone({ freq: 630, duration: 0.14, gain: 0.1, start: 0.05 });
        break;
      case 'roll':
        this.noise({ duration: 0.34, gain: 0.22, filter: 2200 });
        for (let i = 0; i < 5; i += 1) {
          this.tone({
            freq: 180 + i * 90,
            type: 'square',
            start: i * 0.06,
            duration: 0.05,
            gain: 0.07,
          });
        }
        break;
      case 'step':
        this.tone({
          freq: 420 + (detail ?? 0) * 26,
          duration: 0.09,
          gain: 0.14,
          type: 'sine',
        });
        break;
      case 'six':
        [660, 880, 1180].forEach((freq, i) => {
          this.tone({ freq, duration: 0.12, gain: 0.14, start: i * 0.055, type: 'triangle' });
        });
        break;
      case 'capture':
        this.tone({ freq: 520, glideTo: 90, duration: 0.34, gain: 0.24, type: 'sawtooth' });
        this.noise({ duration: 0.3, gain: 0.24, filter: 900, filterType: 'lowpass' });
        break;
      case 'home':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          this.tone({ freq, duration: 0.22, gain: 0.16, start: i * 0.08 });
        });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
          this.tone({ freq, duration: 0.5, gain: 0.18, start: i * 0.12, type: 'triangle' });
        });
        this.tone({ freq: 130.81, duration: 1.1, gain: 0.13, start: 0.1, type: 'sine' });
        break;
      case 'turn':
        this.tone({ freq: 392, duration: 0.16, gain: 0.1, type: 'sine' });
        this.tone({ freq: 587.33, duration: 0.18, gain: 0.08, start: 0.06, type: 'sine' });
        break;
      case 'invalid':
        this.tone({ freq: 150, duration: 0.16, gain: 0.14, type: 'square' });
        break;
    }
  }

  /** A gentle four-chord loop. Uses a look-ahead scheduler driven by a timer. */
  private startMusic(): void {
    if (!this.ctx || !this.music || this.musicTimer !== null) return;
    this.musicGeneration += 1;
    const generation = this.musicGeneration;
    const chords = [
      [220, 261.63, 329.63], // Am
      [174.61, 220, 261.63], // F
      [196, 246.94, 293.66], // G
      [261.63, 329.63, 392], // C
    ];
    const beat = 0.55;
    const tick = () => {
      if (generation !== this.musicGeneration || !this.ctx || !this.music) return;
      const chord = chords[this.musicStep % chords.length]!;
      // Pad
      chord.forEach((freq) => {
        this.tone({
          freq,
          type: 'sine',
          duration: beat * 3.6,
          gain: 0.05,
          destination: this.music,
        });
      });
      // Soft bell arpeggio on top
      const melody = [chord[2]! * 2, chord[1]! * 2, chord[0]! * 2.5, chord[1]! * 2];
      melody.forEach((freq, i) => {
        this.tone({
          freq,
          type: 'triangle',
          start: i * beat * 0.9,
          duration: 0.5,
          gain: 0.035,
          destination: this.music,
        });
      });
      this.musicStep += 1;
      this.musicTimer = window.setTimeout(tick, beat * 4 * 1000 * 0.98);
    };
    tick();
  }

  stopMusic(): void {
    this.musicGeneration += 1;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Fade the music down while a match is paused. */
  duckMusic(duck: boolean): void {
    if (!this.music || !this.ctx) return;
    this.music.gain.setTargetAtTime(duck ? 0.05 : this.musicEnabled ? 0.16 : 0, this.ctx.currentTime, 0.2);
  }
}

export const audio = new AudioEngine();
