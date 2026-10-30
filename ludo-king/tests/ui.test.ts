// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/app';
import { clearAll, loadMatch, loadSettings } from '../src/core/persistence';

/**
 * End-to-end UI tests: mount the real application in jsdom and drive it the way
 * a player would (taps on menus, dice, tokens). This catches wiring bugs that
 * pure engine tests cannot see.
 *
 * jsdom has no Web Audio, so the audio engine must degrade silently — these
 * tests effectively assert that too.
 */

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  new App(root);
  return root;
}

function click(node: Element | null): void {
  expect(node).not.toBeNull();
  (node as HTMLElement).click();
}

const q = (root: ParentNode, selector: string) => root.querySelector(selector);
const qh = <T extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector(selector) as T | null;
const qa = (root: ParentNode, selector: string) => Array.from(root.querySelectorAll(selector));

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  clearAll();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  if (!('vibrate' in navigator)) {
    Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
  }
});

describe('home screen', () => {
  it('renders the title, actions and stats', () => {
    const root = mount();
    expect(q(root, '.hero__title-top')?.textContent).toBe('LUDO');
    expect(q(root, '[data-action="play"]')).not.toBeNull();
    expect(q(root, '[data-action="rules"]')).not.toBeNull();
    expect(q(root, '[data-action="settings"]')).not.toBeNull();
    // No saved match yet, so "continue" must be hidden.
    expect(q(root, '[data-action="continue"]')).toBeNull();
    expect(qa(root, '.stat')).toHaveLength(4);
  });

  it('navigates to every menu and back without errors', () => {
    const root = mount();
    click(q(root, '[data-action="rules"]'));
    expect(q(root, '.screen--rules')).not.toBeNull();
    expect(qa(root, '.panel--prose h2').length).toBeGreaterThan(4);
    click(q(root, '[data-action="back"]'));
    expect(q(root, '.screen--home')).not.toBeNull();

    click(q(root, '[data-action="settings"]'));
    expect(q(root, '.screen--settings')).not.toBeNull();
    click(q(root, '[data-action="back"]'));
    expect(q(root, '.screen--home')).not.toBeNull();
  });

  it('persists sound and speed settings', () => {
    const root = mount();
    click(q(root, '[data-action="settings"]'));
    const switches = qa(root, '.switch');
    expect(switches.length).toBe(3);
    click(switches[0]!); // sound off
    expect(loadSettings().sound).toBe(false);
    const speed = qa(root, '.segmented__item').find((n) => n.textContent?.includes('Fast'));
    click(speed!);
    expect(loadSettings().speed).toBe('fast');
  });
});

describe('match setup', () => {
  it('lets the player choose a mode and start a match', () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    expect(q(root, '.screen--setup')).not.toBeNull();

    const twoPlayer = qa(root, '.segmented__item').find((n) => n.textContent?.includes('2 Player Duel'));
    click(twoPlayer!);
    click(q(root, '[data-action="start"]'));

    expect(q(root, '.screen--game')).not.toBeNull();
    // Two-player duel: exactly two player cards and eight tokens.
    expect(qa(root, '.player-card')).toHaveLength(2);
    expect(qa(root, '.token')).toHaveLength(8);
    expect(loadMatch()).not.toBeNull();
  });

  it('starts a four-player match with 16 tokens', () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    click(q(root, '[data-action="start"]'));
    expect(qa(root, '.player-card')).toHaveLength(4);
    expect(qa(root, '.token')).toHaveLength(16);
  });
});

describe('gameplay', () => {
  it('rolls the dice on tap and either moves or passes the turn', async () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    click(q(root, '[data-action="start"]'));

    const rollButton = qh<HTMLButtonElement>(root, '[data-action="roll"]')!;
    expect(rollButton.disabled).toBe(false);
    rollButton.click();
    await flush(3000);

    // Something must have happened: a value on the die and a legal-move state.
    const die = q(root, '.die')!;
    expect(die.getAttribute('data-value')).toMatch(/^[1-6]$/);
    const state = loadMatch()!.state;
    expect(state.stats.rolls).toBeGreaterThanOrEqual(1);
  });

  it('plays a full automated match to a victory screen', async () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    const twoPlayer = qa(root, '.segmented__item').find((n) => n.textContent?.includes('2 Player Duel'));
    click(twoPlayer!);
    // "Watch" mode: every seat is a CPU, so the match runs on its own.
    const watch = qa(root, '.segmented__item').find((n) => n.textContent?.includes('Watch'));
    click(watch!);
    const fast = q(root, '[data-action="start"]')!;
    click(fast);

    // Drive the clock; the CPU loop should finish the match.
    for (let i = 0; i < 4000; i += 1) {
      await flush(250);
      if (q(root, '.overlay--result')) break;
    }

    const result = q(root, '.overlay--result');
    expect(result).not.toBeNull();
    expect(q(root, '.result-card__title')?.textContent).toMatch(/wins!/);
    expect(qa(root, '.result-grid__item')).toHaveLength(4);
  }, 30000);

  it('lets the player tap a token to move it', async () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    const twoPlayer = qa(root, '.segmented__item').find((n) => n.textContent?.includes('2 Player Duel'));
    click(twoPlayer!);
    click(q(root, '[data-action="start"]'));

    let moved = false;
    for (let attempt = 0; attempt < 60 && !moved; attempt += 1) {
      const playable = qa(root, '.token.is-playable');
      if (playable.length > 0) {
        // Several legal moves: the game must wait for a token tap.
        click(playable[0]!);
        await flush(2500);
        const state = loadMatch()?.state;
        // Either the match has ended or at least one token left the yard.
        if (state && state.tokens[0]!.some((p) => p >= 0)) moved = true;
        break;
      }
      const rollButton = qh<HTMLButtonElement>(root, '[data-action="roll"]');
      if (rollButton && !rollButton.disabled) rollButton.click();
      await flush(2500);
    }

    expect(moved).toBe(true);
  }, 30000);

  it('honours the pause, resume and restart controls', async () => {
    const root = mount();
    click(q(root, '[data-action="play"]'));
    click(q(root, '[data-action="start"]'));

    click(q(root, '[data-action="pause"]'));
    expect(q(root, '.overlay[data-overlay="pause"]')?.classList.contains('is-open')).toBe(true);

    click(q(root, '[data-action="resume"]'));
    expect(q(root, '.overlay[data-overlay="pause"]')?.classList.contains('is-open')).toBe(false);

    click(q(root, '[data-action="pause"]'));
    click(q(root, '[data-action="restart"]'));
    await flush(500);
    expect(q(root, '.screen--game')).not.toBeNull();
    const state = loadMatch()!.state;
    expect(state.stats.moves).toBe(0);
    expect(state.tokens.flat().every((p) => p === -1)).toBe(true);
  });
});
