/**
 * Application shell: navigation, persistence wiring and match lifecycle.
 */

import { createGame } from '../core/engine';
import { randomSeed } from '../core/rng';
import { buildConfig, type SetupOptions } from '../core/setup';
import {
  clearMatch,
  loadMatch,
  loadSettings,
  loadStats,
  recordMatch,
  resetStats,
  saveMatch,
  saveSettings,
  type LifetimeStats,
  type Settings,
} from '../core/persistence';
import { HOME_PROGRESS, type GameState } from '../core/types';
import { audio } from './audio';
import { burstConfetti } from './confetti';
import { clear } from './dom';
import { GameScreen } from './game';
import {
  homeScreen,
  resultScreen,
  rulesScreen,
  settingsScreen,
  setupScreen,
} from './screens';

type ScreenName = 'home' | 'setup' | 'settings' | 'rules' | 'game';

export class App {
  private settings: Settings;
  private stats: LifetimeStats;
  private draft: SetupOptions;
  private screen: ScreenName = 'home';
  private gameScreen: GameScreen | null = null;
  private resultOverlay: HTMLElement | null = null;
  private disposeConfetti: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    this.settings = loadSettings();
    this.stats = loadStats();
    this.draft = {
      mode: this.settings.mode,
      humans: 1,
      difficulty: this.settings.difficulty,
      playerName: this.settings.playerName,
      rulesPreset: this.settings.rulesPreset,
    };
    audio.setSound(this.settings.sound);
    audio.setMusic(this.settings.music);

    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // Auto-pause when the app goes to the background mid-match.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (this.screen !== 'game' || !this.gameScreen || this.gameScreen.isPaused) return;
      this.gameScreen.pause();
      if (this.currentState) saveMatch(this.currentState);
    });

    this.render();
  }

  private currentState: GameState | null = null;

  private render(): void {
    clear(this.root);
    this.resultOverlay = null;
    switch (this.screen) {
      case 'home': {
        this.destroyGame();
        const saved = loadMatch();
        this.root.append(
          homeScreen({
            hasSave: saved !== null,
            stats: this.stats,
            settings: this.settings,
            onPlay: () => this.goSetup(),
            onContinue: () => this.continueMatch(),
            onRules: () => this.go('rules'),
            onSettings: () => this.go('settings'),
          }),
        );
        break;
      }
      case 'setup':
        this.destroyGame();
        this.root.append(
          setupScreen({
            draft: this.draft,
            onChange: (draft) => {
              this.draft = draft;
              this.persistPreferences();
            },
            onStart: () => this.startNewMatch(),
            onBack: () => this.go('home'),
          }),
        );
        break;
      case 'settings':
        this.destroyGame();
        this.root.append(
          settingsScreen({
            settings: this.settings,
            stats: this.stats,
            onChange: (settings) => {
              this.settings = settings;
              saveSettings(settings);
              audio.setSound(settings.sound);
              audio.setMusic(settings.music);
              this.draft = { ...this.draft, difficulty: settings.difficulty, playerName: settings.playerName };
            },
            onBack: () => this.go('home'),
            onResetStats: () => {
              this.stats = resetStats();
              audio.play('click');
              this.go('settings');
            },
          }),
        );
        break;
      case 'rules':
        this.destroyGame();
        this.root.append(rulesScreen({ onBack: () => this.go('home') }));
        break;
      case 'game':
        break;
    }
  }

  private go(screen: ScreenName): void {
    audio.play('click');
    this.screen = screen;
    this.render();
  }

  private goSetup(): void {
    audio.play('open');
    this.screen = 'setup';
    this.render();
  }

  private persistPreferences(): void {
    this.settings = {
      ...this.settings,
      mode: this.draft.mode,
      difficulty: this.draft.difficulty,
      playerName: this.draft.playerName,
      rulesPreset: (this.draft.rulesPreset as Settings['rulesPreset']) ?? 'classic',
    };
    saveSettings(this.settings);
  }

  private mountGame(state: GameState): void {
    this.destroyGame();
    clear(this.root);
    this.screen = 'game';
    this.currentState = state;
    this.gameScreen = new GameScreen(this.root, {
      onPause: () => {
        this.gameScreen?.pause();
      },
      onGameOver: (finalState) => this.handleGameOver(finalState),
      onStateChanged: (next) => {
        this.currentState = next;
        saveMatch(next);
      },
      onQuit: () => {
        if (this.currentState) saveMatch(this.currentState);
        audio.duckMusic(false);
        this.go('home');
      },
      onRestart: () => this.rematch(),
      getSettings: () => this.settings,
    });
    this.gameScreen.start(state);
  }

  private startNewMatch(): void {
    this.persistPreferences();
    if (this.draft.humans === 0) {
      // A demo match still needs readable names.
      this.draft.playerName = this.draft.playerName || 'Player 1';
    }
    const config = buildConfig(this.draft);
    const state = createGame(config, randomSeed());
    saveMatch(state);
    audio.unlock();
    audio.play('open');
    this.mountGame(state);
  }

  private continueMatch(): void {
    const saved = loadMatch();
    if (!saved) {
      this.startNewMatch();
      return;
    }
    audio.unlock();
    audio.play('open');
    this.mountGame(saved.state);
  }

  private rematch(): void {
    const previous = this.currentState;
    if (previous) {
      const config = {
        seats: previous.config.seats.map((seat) => ({ ...seat })),
        rules: { ...previous.config.rules },
        safeTrackIndices: [...previous.config.safeTrackIndices],
      };
      const state = createGame(config, randomSeed());
      saveMatch(state);
      this.dismissResult();
      this.mountGame(state);
      return;
    }
    this.startNewMatch();
  }

  private handleGameOver(state: GameState): void {
    this.currentState = state;
    const winner = state.winner ?? 0;
    const seat = state.config.seats[winner]!;
    const isHumanWinner = seat.kind === 'human';
    this.stats = recordMatch({
      won: isHumanWinner,
      captures: state.tokens[winner]!.length ? state.stats.captures : 0,
      tokensHome: state.tokens[winner]!.filter((p) => p === HOME_PROGRESS).length,
    });
    clearMatch();
    audio.play(isHumanWinner ? 'win' : 'home');
    if (isHumanWinner) {
      this.disposeConfetti?.();
      this.disposeConfetti = burstConfetti({ count: 180, duration: 3600 });
    }
    const overlay = resultScreen({
      winnerName: seat.name,
      winnerColor: seat.color,
      stateColorLabel: seat.color,
      isHumanWinner,
      stats: {
        rolls: state.stats.rolls,
        captures: state.stats.captures,
        turns: state.stats.turns,
      },
      finishedTokens: state.tokens[winner]!.filter((p) => p === HOME_PROGRESS).length,
      onRematch: () => this.rematch(),
      onHome: () => {
        this.dismissResult();
        this.go('home');
      },
      onBoard: () => {
        this.resultOverlay?.classList.remove('is-open');
      },
    });
    this.resultOverlay = overlay;
    this.root.append(overlay);
  }

  private dismissResult(): void {
    this.resultOverlay?.remove();
    this.resultOverlay = null;
    this.disposeConfetti?.();
    this.disposeConfetti = null;
  }

  private destroyGame(): void {
    this.gameScreen?.destroy();
    this.gameScreen = null;
    audio.duckMusic(false);
  }
}
