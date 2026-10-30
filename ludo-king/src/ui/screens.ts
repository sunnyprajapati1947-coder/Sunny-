/**
 * Menu screens: home, match setup, settings, how-to-play and the result screen.
 * Each screen is a plain function returning a DOM node; App owns navigation.
 */

import type { Difficulty } from '../core/types';
import { HOME_PROGRESS, TOKENS_PER_PLAYER } from '../core/types';
import { RULE_PRESETS, COLOR_META, type SetupOptions, type GameMode, type HumanSeatCount } from '../core/setup';
import type { Settings, LifetimeStats, SpeedSetting } from '../core/persistence';
import { el, svg } from './dom';

export const APP_VERSION = '1.0.0';

export function crest(size = 96): SVGSVGElement {
  const node = svg('svg', {
    class: 'crest',
    viewBox: '0 0 100 100',
    width: size,
    height: size,
    'aria-hidden': 'true',
  });
  node.append(
    svg('defs', {},
      svg('linearGradient', { id: 'crestGold', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#ffe89a' }),
        svg('stop', { offset: '45%', 'stop-color': '#f2b705' }),
        svg('stop', { offset: '100%', 'stop-color': '#a97b00' }),
      ),
      svg('radialGradient', { id: 'crestBg', cx: '0.35', cy: '0.25', r: '0.9' },
        svg('stop', { offset: '0%', 'stop-color': '#2f2117' }),
        svg('stop', { offset: '100%', 'stop-color': '#150e08' }),
      ),
    ),
    svg('circle', { cx: 50, cy: 50, r: 47, fill: 'url(#crestBg)', stroke: 'url(#crestGold)', 'stroke-width': 3 }),
  );
  // Crown
  node.append(
    svg('path', {
      d: 'M 26 62 L 30 34 L 41 47 L 50 28 L 59 47 L 70 34 L 74 62 Z',
      fill: 'url(#crestGold)',
      stroke: '#7a5600',
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    svg('rect', { x: 27, y: 63, width: 46, height: 7, rx: 3.5, fill: 'url(#crestGold)', stroke: '#7a5600', 'stroke-width': 1 }),
  );
  // Four colour gems
  const gems: Array<[number, number, string]> = [
    [38, 57, '#e63a45'],
    [50, 54, '#22a06b'],
    [62, 57, '#f2b705'],
    [50, 68, '#2f6fed'],
  ];
  for (const [x, y, fill] of gems) {
    node.append(svg('circle', { cx: x, cy: y, r: 3.4, fill, stroke: 'rgba(255,255,255,0.8)', 'stroke-width': 0.9 }));
  }
  node.append(
    svg('path', { d: 'M 32 78 Q 50 90 68 78', fill: 'none', stroke: 'rgba(255,232,154,0.55)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  );
  return node;
}

function screenShell(className: string, ...children: Array<Node | string>): HTMLElement {
  return el('div', { class: `screen ${className}` }, el('div', { class: 'screen__inner' }, ...children));
}

function topBar(title: string, _onBack: () => void): HTMLElement {
  return el(
    'header',
    { class: 'subbar' },
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', 'data-action': 'back' }, '←'),
    el('h1', { class: 'subbar__title' }, title),
    el('span', { class: 'subbar__spacer' }),
  );
}

export interface HomeOptions {
  hasSave: boolean;
  stats: LifetimeStats;
  settings: Settings;
  onPlay: () => void;
  onContinue: () => void;
  onRules: () => void;
  onSettings: () => void;
}

export function homeScreen(options: HomeOptions): HTMLElement {
  const winRate = options.stats.matches > 0
    ? Math.round((options.stats.wins / options.stats.matches) * 100)
    : 0;

  const root = screenShell(
    'screen--home',
    el('div', { class: 'hero' },
      el('div', { class: 'hero__crest' }, crest(110)),
      el('h1', { class: 'hero__title' },
        el('span', { class: 'hero__title-top' }, 'LUDO'),
        el('span', { class: 'hero__title-bottom' }, 'ROYALE'),
      ),
      el('p', { class: 'hero__tagline' }, 'Four kingdoms. One crown. Roll with honour.'),
    ),
    el('div', { class: 'home-actions' },
      el('button', { class: 'btn btn--hero', type: 'button', 'data-action': 'play' },
        el('span', { class: 'btn__label' }, 'Play'),
        el('span', { class: 'btn__sub' }, 'New match'),
      ),
      options.hasSave
        ? el('button', { class: 'btn btn--wide', type: 'button', 'data-action': 'continue' }, 'Continue saved match')
        : null,
      el('div', { class: 'home-actions__row' },
        el('button', { class: 'btn btn--ghost', type: 'button', 'data-action': 'rules' }, 'How to play'),
        el('button', { class: 'btn btn--ghost', type: 'button', 'data-action': 'settings' }, 'Settings'),
      ),
    ),
    el('footer', { class: 'home-footer' },
      el('div', { class: 'stat-strip' },
        stat('Matches', String(options.stats.matches)),
        stat('Wins', String(options.stats.wins)),
        stat('Win rate', `${winRate}%`),
        stat('Captures', String(options.stats.captures)),
      ),
      el('p', { class: 'fineprint' },
        'Original clean-room game · all artwork and audio generated for this project · offline ready'),
    ),
  );

  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  q('[data-action="play"]')?.addEventListener('click', options.onPlay);
  q('[data-action="continue"]')?.addEventListener('click', options.onContinue);
  q('[data-action="rules"]')?.addEventListener('click', options.onRules);
  q('[data-action="settings"]')?.addEventListener('click', options.onSettings);
  void options.settings;
  return root;
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'stat' },
    el('span', { class: 'stat__value' }, value),
    el('span', { class: 'stat__label' }, label),
  );
}

export interface SetupScreenOptions {
  draft: SetupOptions;
  onChange: (draft: SetupOptions) => void;
  onStart: () => void;
  onBack: () => void;
}

export function setupScreen(options: SetupScreenOptions): HTMLElement {
  const draft = { ...options.draft };
  const root = screenShell(
    'screen--setup',
    topBar('New match', options.onBack),
    el('div', { class: 'panel' },
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'Board size'),
        segmented<GameMode>(
          [
            { value: '2p', label: '2 Player Duel', sub: 'Red vs Yellow' },
            { value: '4p', label: '4 Player Classic', sub: 'All four kingdoms' },
          ],
          draft.mode,
          (mode) => {
            draft.mode = mode;
            if (mode === '2p' && draft.humans === 2) draft.humans = 1;
            emit();
          },
        ),
      ),
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'Players on this device'),
        segmented<HumanSeatCount>(
          [
            { value: 1, label: '1 human', sub: 'vs CPU rivals' },
            { value: 2, label: '2 humans', sub: 'pass & play' },
            { value: 0, label: 'Watch', sub: 'CPU vs CPU' },
          ],
          draft.humans,
          (humans) => {
            draft.humans = humans;
            emit();
          },
        ),
      ),
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'CPU difficulty'),
        segmented<Difficulty>(
          [
            { value: 'easy', label: 'Easy', sub: 'Forgiving' },
            { value: 'medium', label: 'Medium', sub: 'Balanced' },
            { value: 'hard', label: 'Hard', sub: 'Ruthless' },
          ],
          draft.difficulty,
          (difficulty) => {
            draft.difficulty = difficulty;
            emit();
          },
        ),
      ),
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'Rules'),
        el('div', { class: 'rule-cards' },
          ...RULE_PRESETS.map((preset) =>
            el('button', {
              class: `rule-card ${draft.rulesPreset === preset.id ? 'is-selected' : ''}`,
              type: 'button',
              'data-rule': preset.id,
            },
              el('span', { class: 'rule-card__title' }, preset.label),
              el('span', { class: 'rule-card__desc' }, preset.description),
            ),
          ),
        ),
      ),
      el('div', { class: 'field' },
        el('label', { class: 'field__label', for: 'player-name' }, 'Your name'),
        el('input', {
          class: 'input',
          id: 'player-name',
          type: 'text',
          maxlength: '16',
          autocomplete: 'off',
          value: draft.playerName,
        }),
      ),
    ),
    el('div', { class: 'setup-footer' },
      el('button', { class: 'btn btn--hero', type: 'button', 'data-action': 'start' },
        el('span', { class: 'btn__label' }, 'Start match'),
        el('span', { class: 'btn__sub' }, draft.mode === '2p' ? '2 players · 4 tokens each' : '4 players · 4 tokens each'),
      ),
    ),
  );

  const emit = () => {
    options.onChange({ ...draft });
  };

  root.querySelectorAll<HTMLElement>('[data-rule]').forEach((button) => {
    button.addEventListener('click', () => {
      draft.rulesPreset = button.dataset.rule ?? 'classic';
      root.querySelectorAll('[data-rule]').forEach((b) => b.classList.remove('is-selected'));
      button.classList.add('is-selected');
      emit();
    });
  });
  root.querySelector<HTMLInputElement>('#player-name')?.addEventListener('input', (event) => {
    draft.playerName = (event.target as HTMLInputElement).value;
    emit();
  });
  root.querySelector<HTMLElement>('[data-action="back"]')?.addEventListener('click', options.onBack);
  root.querySelector<HTMLElement>('[data-action="start"]')?.addEventListener('click', options.onStart);
  return root;
}

interface SegmentOption<T> {
  value: T;
  label: string;
  sub?: string;
}

function segmented<T extends string | number>(
  options: SegmentOption<T>[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = el('div', { class: 'segmented', role: 'group' });
  for (const option of options) {
    const button = el('button', {
      class: `segmented__item ${option.value === value ? 'is-selected' : ''}`,
      type: 'button',
      'aria-pressed': String(option.value === value),
    },
      el('span', { class: 'segmented__label' }, option.label),
      option.sub ? el('span', { class: 'segmented__sub' }, option.sub) : null,
    );
    button.addEventListener('click', () => {
      group.querySelectorAll('.segmented__item').forEach((node) => {
        node.classList.remove('is-selected');
        node.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
      onChange(option.value);
    });
    group.append(button);
  }
  return group;
}

export interface SettingsScreenOptions {
  settings: Settings;
  stats: LifetimeStats;
  onChange: (settings: Settings) => void;
  onBack: () => void;
  onResetStats: () => void;
}

export function settingsScreen(options: SettingsScreenOptions): HTMLElement {
  const settings = { ...options.settings };
  const root = screenShell(
    'screen--settings',
    topBar('Settings', options.onBack),
    el('div', { class: 'panel' },
      el('div', { class: 'settings-group' },
        el('h2', { class: 'settings-group__title' }, 'Audio'),
        toggle('Sound effects', 'Dice, tokens, captures', settings.sound, (value) => {
          settings.sound = value;
          emit();
        }),
        toggle('Background music', 'Gentle generated soundtrack', settings.music, (value) => {
          settings.music = value;
          emit();
        }),
        toggle('Haptics', 'Vibration on supported devices', settings.haptics, (value) => {
          settings.haptics = value;
          emit();
        }),
      ),
      el('div', { class: 'settings-group' },
        el('h2', { class: 'settings-group__title' }, 'Pace'),
        el('span', { class: 'field__label' }, 'Animation speed'),
        segmented<SpeedSetting>(
          [
            { value: 'slow', label: 'Slow' },
            { value: 'normal', label: 'Normal' },
            { value: 'fast', label: 'Fast' },
          ],
          settings.speed,
          (speed) => {
            settings.speed = speed;
            emit();
          },
        ),
        el('span', { class: 'field__label' }, 'Default CPU difficulty'),
        segmented<Difficulty>(
          [
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ],
          settings.difficulty,
          (difficulty) => {
            settings.difficulty = difficulty;
            emit();
          },
        ),
      ),
      el('div', { class: 'settings-group' },
        el('h2', { class: 'settings-group__title' }, 'Profile'),
        el('label', { class: 'field__label', for: 'settings-name' }, 'Display name'),
        el('input', {
          class: 'input',
          id: 'settings-name',
          type: 'text',
          maxlength: '16',
          value: settings.playerName,
        }),
      ),
      el('div', { class: 'settings-group' },
        el('h2', { class: 'settings-group__title' }, 'Data'),
        el('p', { class: 'settings-note' },
          `${options.stats.matches} matches played · ${options.stats.wins} wins · ${options.stats.captures} captures`),
        el('button', { class: 'btn btn--ghost btn--danger', type: 'button', 'data-action': 'reset' }, 'Reset lifetime stats'),
      ),
      el('div', { class: 'settings-group' },
        el('h2', { class: 'settings-group__title' }, 'About'),
        el('p', { class: 'settings-note' },
          `Ludo Royale ${APP_VERSION} — an original clean-room Ludo game. Rules engine, artwork and audio were written for this project; no assets from any commercial app are used.`),
        el('p', { class: 'settings-note' }, 'Not affiliated with, endorsed by, or derived from Ludo King or any other trademark.'),
      ),
    ),
  );

  const emit = () => options.onChange({ ...settings });
  root.querySelector<HTMLElement>('[data-action="back"]')?.addEventListener('click', options.onBack);
  root.querySelector<HTMLElement>('[data-action="reset"]')?.addEventListener('click', options.onResetStats);
  root.querySelector<HTMLInputElement>('#settings-name')?.addEventListener('input', (event) => {
    settings.playerName = (event.target as HTMLInputElement).value;
    emit();
  });
  return root;
}

function toggle(label: string, hint: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  let current = value;
  const button = el('button', {
    class: `switch ${current ? 'is-on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': String(current),
    'aria-label': label,
  }, el('span', { class: 'switch__thumb' }));
  const row = el('div', { class: 'toggle-row' },
    el('div', { class: 'toggle-row__text' },
      el('span', { class: 'toggle-row__label' }, label),
      el('span', { class: 'toggle-row__hint' }, hint),
    ),
    button,
  );
  button.addEventListener('click', () => {
    current = !current;
    button.classList.toggle('is-on', current);
    button.setAttribute('aria-checked', String(current));
    onChange(current);
  });
  return row;
}

export function rulesScreen(options: { onBack: () => void }): HTMLElement {
  const root = screenShell(
    'screen--rules',
    topBar('How to play', options.onBack),
    el('div', { class: 'panel panel--prose' },
      el('h2', {}, 'The goal'),
      el('p', {}, 'Be the first to bring all four of your tokens from your yard, around the board, and into the crown at the centre.'),
      el('h2', {}, 'Rolling'),
      el('p', {}, 'Tap the dice on your turn. Rolling a six releases a token from your yard and grants another roll. Three sixes in a row forfeits the turn.'),
      el('h2', {}, 'Moving'),
      el('p', {}, 'A token moves exactly the number rolled. Only the glowing tokens can move — if nothing can move, your turn passes automatically.'),
      el('h2', {}, 'Safe stars'),
      el('p', {}, 'Squares marked with a star, and every coloured start square, are safe: tokens resting there cannot be captured and may share the square.'),
      el('h2', {}, 'Captures'),
      el('p', {}, 'Land on a square holding an opponent token and it is sent back to its yard. You then earn a bonus roll. Two or more opponent tokens on one square form a blockade you cannot attack (Chaos rules allow it).'),
      el('h2', {}, 'Home column'),
      el('p', {}, 'After a full lap, a token enters its own coloured column. With Classic rules the final step must land exactly on the crown; Quick Match rules let the last step overshoot.'),
      el('h2', {}, 'Winning'),
      el('p', {}, 'The first player with all four tokens home wins the match.'),
      el('h2', {}, 'Controls'),
      el('p', {}, 'Tap the dice or the Roll button to roll, then tap a glowing token to move it. Pause any time from the top-left button — your match is saved automatically.'),
    ),
  );
  root.querySelector<HTMLElement>('[data-action="back"]')?.addEventListener('click', options.onBack);
  return root;
}

export interface ResultOptions {
  winnerName: string;
  winnerColor: keyof typeof COLOR_META;
  stateColorLabel: string;
  isHumanWinner: boolean;
  stats: { rolls: number; captures: number; turns: number };
  finishedTokens: number;
  onRematch: () => void;
  onHome: () => void;
  onBoard: () => void;
}

export function resultScreen(options: ResultOptions): HTMLElement {
  const meta = COLOR_META[options.winnerColor];
  const root = el(
    'div',
    { class: 'overlay is-open overlay--result', role: 'dialog', 'aria-label': 'Match result' },
    el('div', { class: 'overlay__card result-card' },
      el('div', {
        class: 'result-card__trophy',
        style: `--winner:${meta.hex};--winner-deep:${meta.deep}`,
      }, '🏆'),
      el('p', { class: 'result-card__eyebrow' }, options.isHumanWinner ? 'Victory' : 'Match complete'),
      el('h2', { class: 'result-card__title' }, `${options.winnerName} wins!`),
      el('p', { class: 'result-card__sub' }, `${options.stateColorLabel} crowned with all ${TOKENS_PER_PLAYER} tokens home`),
      el('div', { class: 'result-grid' },
        resultStat('Rolls', String(options.stats.rolls)),
        resultStat('Captures', String(options.stats.captures)),
        resultStat('Turns', String(options.stats.turns)),
        resultStat('Tokens home', `${options.finishedTokens}/${TOKENS_PER_PLAYER}`),
      ),
      el('div', { class: 'overlay__actions' },
        el('button', { class: 'btn btn--primary', type: 'button', 'data-action': 'rematch' }, 'Rematch'),
        el('button', { class: 'btn', type: 'button', 'data-action': 'board' }, 'View board'),
        el('button', { class: 'btn btn--ghost', type: 'button', 'data-action': 'home' }, 'Main menu'),
      ),
    ),
  );
  root.querySelector<HTMLElement>('[data-action="rematch"]')?.addEventListener('click', options.onRematch);
  root.querySelector<HTMLElement>('[data-action="home"]')?.addEventListener('click', options.onHome);
  root.querySelector<HTMLElement>('[data-action="board"]')?.addEventListener('click', options.onBoard);
  void HOME_PROGRESS;
  return root;
}

function resultStat(label: string, value: string): HTMLElement {
  return el('div', { class: 'result-grid__item' },
    el('span', { class: 'result-grid__value' }, value),
    el('span', { class: 'result-grid__label' }, label),
  );
}
