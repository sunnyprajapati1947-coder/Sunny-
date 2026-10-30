/**
 * Game screen controller: HUD, dice dock, turn loop and animation sequencing.
 *
 * The screen is a pure projection of the engine state. It never mutates the
 * state itself — every change comes back from core/engine.ts.
 */

import {
  chooseMove,
  thinkingDelay,
} from '../core/ai';
import { playMove, roll as rollDice } from '../core/engine';
import { HOME_PROGRESS, TOKENS_PER_PLAYER, YARD, type GameState, type Move } from '../core/types';
import type { Settings } from '../core/persistence';
import { audio, type AudioEngine } from './audio';
import { BoardView, type SpeedProfile } from './board';
import { DiceView } from './dice';
import { clear, el, sleep } from './dom';

export interface GameScreenCallbacks {
  onPause: () => void;
  onGameOver: (state: GameState) => void;
  onStateChanged: (state: GameState) => void;
  onQuit: () => void;
  onRestart: () => void;
  getSettings: () => Settings;
}

export interface SpeedKit {
  hop: number;
  settle: number;
  dice: number;
  cpuThink: number;
}

export function speedKit(settings: Settings): SpeedKit {
  const difficultyScale = 1;
  switch (settings.speed) {
    case 'slow':
      return { hop: 250, settle: 320, dice: 1150, cpuThink: 1.15 * difficultyScale };
    case 'fast':
      return { hop: 95, settle: 130, dice: 520, cpuThink: 0.55 * difficultyScale };
    default:
      return { hop: 165, settle: 220, dice: 800, cpuThink: 0.8 * difficultyScale };
  }
}

export class GameScreen {
  readonly root: HTMLElement;
  private boardHolder: HTMLElement;
  private diceHolder: HTMLElement;
  private board: BoardView;
  private dice: DiceView;
  private state: GameState | null = null;
  private runId = 0;
  private paused = false;
  private destroyed = false;
  private rolling = false;
  private hints: HTMLElement;
  private rail: HTMLElement;
  private logList: HTMLElement;
  private toast: HTMLElement;
  private rollButton: HTMLButtonElement;
  private soundButton: HTMLButtonElement;
  private readonly audio: AudioEngine = audio;

  constructor(container: HTMLElement, private callbacks: GameScreenCallbacks) {
    this.root = el('div', { class: 'screen screen--game' });
    this.boardHolder = el('div', { class: 'board-holder' });
    this.diceHolder = el('div', { class: 'dock__dice' });
    this.hints = el('div', { class: 'game-status__hint', 'aria-live': 'polite' });
    this.rail = el('div', { class: 'player-rail' });
    this.logList = el('ol', { class: 'log-list' });
    this.toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.rollButton = el('button', {
      class: 'btn btn--primary btn--roll',
      type: 'button',
      'data-action': 'roll',
    }, 'Roll') as HTMLButtonElement;
    this.soundButton = el('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Toggle sound',
      'data-action': 'sound',
    }, '🔊') as HTMLButtonElement;

    const topbar = el(
      'header',
      { class: 'gamebar' },
      el(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Pause menu', 'data-action': 'pause' },
        '⏸',
      ),
      el('div', { class: 'game-status' },
        el('div', { class: 'game-status__turn' }, ''),
        this.hints,
      ),
      this.soundButton,
    );

    const dock = el(
      'footer',
      { class: 'dock' },
      el('div', { class: 'dock__feed' },
        el('span', { class: 'dock__feed-label' }, 'Match feed'),
        this.logList,
      ),
      el('div', { class: 'dock__action' }, this.diceHolder, this.rollButton),
    );

    this.root.append(
      topbar,
      el('main', { class: 'game-main' },
        this.rail,
        this.boardHolder,
        dock,
      ),
      this.toast,
      this.buildPauseOverlay(),
    );
    container.append(this.root);

    this.board = new BoardView(this.boardHolder, {
      onTokenClick: (seat, token) => void this.handleTokenTap(seat, token),
      onBoardClick: () => this.onBoardTapped(),
    });
    this.dice = new DiceView(this.diceHolder, { onRollRequest: () => void this.handleRollRequest() });

    this.rollButton.addEventListener('click', () => void this.handleRollRequest());
    this.soundButton.addEventListener('click', () => {
      const settings = this.callbacks.getSettings();
      this.audio.setSound(!settings.sound);
      this.syncSoundButton();
    });
    this.root.querySelectorAll<HTMLElement>('[data-action="pause"]')[0]?.addEventListener('click', () => {
      this.callbacks.onPause();
    });
    this.root.querySelector<HTMLElement>('[data-action="resume"]')?.addEventListener('click', () => {
      this.resume();
    });
    this.root.querySelector<HTMLElement>('[data-action="restart"]')?.addEventListener('click', () => {
      this.callbacks.onRestart();
    });
    this.root.querySelector<HTMLElement>('[data-action="quit"]')?.addEventListener('click', () => {
      this.callbacks.onQuit();
    });
    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === ' ' || event.key === 'Enter' || event.key === 'r' || event.key === 'R') {
        if (!this.state || this.state.phase !== 'awaiting-roll' || !this.humanTurn()) return;
        event.preventDefault();
        void this.handleRollRequest();
      } else if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        if (this.paused) this.resume();
        else this.callbacks.onPause();
      } else if (/^[1-4]$/.test(event.key) && this.state?.phase === 'awaiting-move' && this.humanTurn()) {
        // Number keys pick the nth legal move (desktop convenience).
        const move = this.state.legalMoves[Number(event.key) - 1];
        if (move) {
          event.preventDefault();
          void this.performMove(move, this.runId);
        }
      }
    };
    window.addEventListener('keydown', this.onKeyDown);

    this.root.querySelector<HTMLElement>('[data-action="pause-sound"]')?.addEventListener('click', (event) => {
      const settings = this.callbacks.getSettings();
      this.audio.setSound(!settings.sound);
      (event.currentTarget as HTMLElement).textContent = settings.sound ? '🔇 Sound off' : '🔊 Sound on';
    });
  }

  private buildPauseOverlay(): HTMLElement {
    return el(
      'div',
      { class: 'overlay', 'data-overlay': 'pause', role: 'dialog', 'aria-label': 'Paused' },
      el(
        'div',
        { class: 'overlay__card' },
        el('h2', { class: 'overlay__title' }, 'Game paused'),
        el('p', { class: 'overlay__sub' }, 'Your match is saved automatically.'),
        el('div', { class: 'overlay__actions' },
          el('button', { class: 'btn btn--primary', type: 'button', 'data-action': 'resume' }, 'Resume'),
          el('button', { class: 'btn', type: 'button', 'data-action': 'restart' }, 'Restart match'),
          el('button', { class: 'btn', type: 'button', 'data-action': 'pause-sound' }, '🔊 Sound'),
          el('button', { class: 'btn btn--ghost', type: 'button', 'data-action': 'quit' }, 'Quit to menu'),
        ),
      ),
    );
  }

  /** Attaches a match (fresh or restored) and starts driving turns. */
  start(state: GameState): void {
    this.runId += 1;
    this.paused = false;
    this.rolling = false;
    this.state = state;
    this.applySpeedVars();
    this.board.build(state);
    this.syncSoundButton();
    this.render();
    void this.tick(this.runId);
  }

  pause(): void {
    this.paused = true;
    this.audio.duckMusic(true);
    this.root.querySelector<HTMLElement>('[data-overlay="pause"]')?.classList.add('is-open');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.audio.duckMusic(false);
    this.root.querySelector<HTMLElement>('[data-overlay="pause"]')?.classList.remove('is-open');
    void this.tick(this.runId);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private get settings(): Settings {
    return this.callbacks.getSettings();
  }

  private get speed(): SpeedKit {
    return speedKit(this.settings);
  }

  /** Exposes the animation pace to CSS (token transitions, dice tumble). */
  private applySpeedVars(): void {
    const kit = this.speed;
    this.root.style.setProperty('--hop', `${kit.hop}ms`);
    this.root.style.setProperty('--dice-dur', `${kit.dice}ms`);
    this.root.dataset.speed = this.settings.speed;
  }

  private syncSoundButton(): void {
    const on = this.settings.sound;
    this.soundButton.textContent = on ? '🔊' : '🔇';
    this.soundButton.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    const pauseSound = this.root.querySelector<HTMLElement>('[data-action="pause-sound"]');
    if (pauseSound) pauseSound.textContent = on ? '🔊 Sound off' : '🔇 Sound on';
  }

  private humanTurn(): boolean {
    if (!this.state) return false;
    return this.state.config.seats[this.state.turn]?.kind === 'human';
  }

  /** The turn loop: decide who acts next and let CPU players act on a timer. */
  private async tick(runId: number): Promise<void> {
    if (!this.state || this.destroyed || runId !== this.runId) return;
    if (this.paused) return;
    const state = this.state;

    if (state.phase === 'game-over') {
      this.render();
      this.callbacks.onGameOver(state);
      return;
    }

    const seat = state.config.seats[state.turn]!;
    const isCpu = seat.kind === 'cpu';

    if (state.phase === 'awaiting-roll') {
      this.render();
      if (isCpu) {
        this.setRollEnabled(false);
        this.setHint(`${seat.name} is thinking…`);
        await sleep(thinkingDelay(seat.difficulty) * this.speed.cpuThink);
        if (this.destroyed || runId !== this.runId || this.paused || !this.state) return;
        if (this.state.phase !== 'awaiting-roll' || this.state.turn !== state.turn) return;
        await this.performRoll(runId);
      } else {
        this.setRollEnabled(true);
        this.setHint('Tap the dice to roll');
      }
      return;
    }

    if (state.phase === 'awaiting-move') {
      this.setRollEnabled(false);
      this.render();
      if (isCpu) {
        await sleep(Math.round(420 * this.speed.cpuThink));
        if (this.destroyed || runId !== this.runId || this.paused || !this.state) return;
        if (this.state.phase !== 'awaiting-move') return;
        const cpuSeat = this.state.config.seats[this.state.turn]!;
        const move = chooseMove(this.state, this.state.turn, cpuSeat.difficulty);
        await this.performMove(move, runId);
      } else {
        this.board.setMoveHints(state.legalMoves);
        const count = state.legalMoves.length;
        if (count === 1) {
          // With a single legal move there is nothing to decide, so play it
          // automatically (this is what players expect from Ludo apps).
          this.setHint('Moving…');
          await sleep(280);
          if (this.destroyed || runId !== this.runId || this.paused || !this.state) return;
          if (this.state.phase !== 'awaiting-move') return;
          await this.performMove(this.state.legalMoves[0]!, runId);
          return;
        }
        this.setHint(`Tap a glowing token (${count} moves)`);
      }
    }
  }

  private async handleRollRequest(): Promise<void> {
    if (!this.state || this.paused || this.rolling) return;
    if (this.state.phase !== 'awaiting-roll' || !this.humanTurn()) {
      this.dice.shake();
      return;
    }
    await this.performRoll(this.runId);
  }

  private onBoardTapped(): void {
    if (!this.state || this.paused) return;
    if (this.state.phase === 'awaiting-roll' && this.humanTurn()) {
      void this.handleRollRequest();
    }
  }

  private async performRoll(runId: number): Promise<void> {
    if (!this.state || runId !== this.runId) return;
    this.rolling = true;
    this.setRollEnabled(false);
    const seat = this.state.turn;
    const predicted = this.peekDice();
    this.audio.play('roll');
    this.haptic(18);
    await this.dice.roll(predicted, this.speed.dice);
    if (!this.state || runId !== this.runId || this.destroyed) {
      this.rolling = false;
      return;
    }
    const { state, events } = rollDice(this.state);
    this.state = state;
    if (events.some((e) => e.type === 'roll' && e.value === 6)) this.audio.play('six');
    for (const event of events) {
      if (event.type === 'no-moves') {
        this.showToast(`${this.seatName(event.seat)} has no move with ${event.value}`);
      }
      if (event.type === 'three-sixes') {
        this.showToast('Three sixes! Turn forfeited.');
        this.audio.play('invalid');
      }
    }
    if (state.turn !== seat) this.audio.play('turn');
    this.rolling = false;
    this.afterStateChange();
    await this.tick(runId);
  }

  /** Rolls the dice value without advancing the state (for the animation). */
  private peekDice(): number {
    // The engine owns the seeded dice; ask it for the value it will produce by
    // simulating a roll on a throwaway clone.
    if (!this.state) return 1;
    try {
      const preview = rollDice(this.state);
      return preview.events.find((e) => e.type === 'roll')?.value ?? 1;
    } catch {
      return 1;
    }
  }

  private async handleTokenTap(seat: number, token: number): Promise<void> {
    if (!this.state || this.paused) return;
    if (this.state.phase !== 'awaiting-move' || this.state.turn !== seat) return;
    const move = this.state.legalMoves.find((m) => m.token === token);
    if (!move) {
      this.audio.play('invalid');
      this.showToast('That token cannot move');
      return;
    }
    await this.performMove(move, this.runId);
  }

  private async performMove(move: Move, runId: number): Promise<void> {
    if (!this.state || runId !== this.runId) return;
    const before = this.state;
    this.board.setMoveHints(null);
    const { state: after, events } = playMove(before, move);
    this.state = after;

    const speed: SpeedProfile = { hop: this.speed.hop, settle: this.speed.settle };
    const victims = move.captures.map((c) => ({ seat: c.seat, token: c.token }));

    this.audio.play('step', 2);
    const moving = this.board.animateMove(before, move, after, speed);
    // Play a tick per hop.
    const hops = Math.max(1, move.to - Math.max(move.from, 0));
    const stepGap = this.speed.hop;
    for (let i = 1; i <= Math.min(hops, 8); i += 1) {
      setTimeout(() => {
        if (!this.destroyed && runId === this.runId) this.audio.play('step', i);
      }, stepGap * i);
    }
    await moving;
    if (this.destroyed || runId !== this.runId) return;
    if (victims.length > 0) {
      this.haptic([12, 40, 22]);
      this.audio.play('capture');
      this.showToast(`Captured! ${this.seatName(move.seat)} gets a bonus roll`);
      await this.board.animateCaptures(victims, speed);
    }
    if (events.some((e) => e.type === 'home')) {
      this.audio.play('home');
      this.showToast(`${this.seatName(move.seat)} brought a token home!`);
    }
    if (events.some((e) => e.type === 'extra-turn')) {
      if (!victims.length) this.showToast(`${this.seatName(move.seat)} rolls again`);
    }
    if (after.phase === 'game-over') {
      this.board.celebrate(after.winner ?? move.seat);
      this.render();
      this.callbacks.onGameOver(after);
      return;
    }
    this.afterStateChange();
    await this.tick(runId);
  }

  private afterStateChange(): void {
    if (!this.state) return;
    this.board.setState(this.state);
    this.render();
    this.callbacks.onStateChanged(this.state);
  }

  private seatName(index: number): string {
    return this.state?.config.seats[index]?.name ?? `Player ${index + 1}`;
  }

  private setRollEnabled(enabled: boolean): void {
    this.rollButton.disabled = !enabled;
    this.rollButton.classList.toggle('is-ready', enabled);
    this.dice.setEnabled(enabled);
  }

  private setHint(text: string): void {
    this.hints.textContent = text;
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-visible'), 2400);
  }

  private toastTimer = 0;

  private haptic(pattern: number | number[]): void {
    if (!this.settings.haptics) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* unsupported */
      }
    }
  }

  /** Repaints the HUD from the current state. */
  private render(): void {
    const state = this.state;
    if (!state) return;
    this.dice.setValue(state.dice);

    const turnLabel = this.root.querySelector<HTMLElement>('.game-status__turn');
    const current = state.config.seats[state.turn]!;
    if (turnLabel) {
      turnLabel.innerHTML = '';
      turnLabel.append(
        el('span', { class: `chip chip--${current.color}` }),
        el('span', { class: 'game-status__name' }, state.phase === 'game-over' ? 'Match over' : current.name),
        el('span', { class: 'game-status__badge' }, current.kind === 'cpu' ? `CPU · ${current.difficulty}` : 'You'),
      );
    }

    clear(this.rail);
    state.config.seats.forEach((seat, index) => {
      const tokens = state.tokens[index]!;
      const finished = tokens.filter((p) => p === HOME_PROGRESS).length;
      const inYard = tokens.filter((p) => p === YARD).length;
      const card = el(
        'div',
        {
          class: [
            'player-card',
            `player-card--${seat.color}`,
            index === state.turn && state.phase !== 'game-over' ? 'is-active' : '',
            seat.kind === 'cpu' ? 'is-cpu' : 'is-human',
          ].join(' '),
        },
        el('span', { class: 'player-card__dot' }),
        el('div', { class: 'player-card__body' },
          el('span', { class: 'player-card__name' }, seat.name),
          el('span', { class: 'player-card__meta' },
            `${finished}/${TOKENS_PER_PLAYER} home · ${inYard} in yard`),
        ),
        el('div', { class: 'player-card__pips' },
          ...tokens.map((p) =>
            el('span', {
              class: `pip ${p === HOME_PROGRESS ? 'is-home' : p === YARD ? 'is-yard' : 'is-out'}`,
            }),
          ),
        ),
      );
      this.rail.append(card);
    });

    clear(this.logList);
    for (const entry of state.log.slice(-4)) {
      this.logList.append(
        el('li', { class: `log-entry log-entry--${entry.tone}` },
          el('span', { class: `log-entry__dot log-entry__dot--${state.config.seats[entry.seat]?.color ?? 'red'}` }),
          el('span', {}, entry.text),
        ),
      );
    }
  }

  private onKeyDown: ((event: KeyboardEvent) => void) | null = null;

  destroy(): void {
    this.destroyed = true;
    this.runId += 1;
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.board.destroy();
    this.root.remove();
  }
}
