/**
 * Renders the real board component (same code the game runs) into a standalone
 * SVG file, so artwork changes can be reviewed without a browser.
 *
 *   npx vite-node scripts/render-preview.ts -- docs/board-preview.svg
 *
 * The script mounts jsdom, builds a BoardView with a representative mid-match
 * state, and serialises the resulting DOM (static art + positioned tokens)
 * back into SVG/HTML that any image viewer can open.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { createGame } from '../src/core/engine';
import { DEFAULT_CONFIG } from '../src/core/engine';
import type { GameState, PlayerColor } from '../src/core/types';
import { SEAT_GEOMETRY } from '../src/core/geometry';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as unknown as Record<string, unknown>;
const expose = (key: string, value: unknown) => {
  // Some globals (navigator) are getter-only in Node, so redefine instead of assign.
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
};
expose('window', window);
expose('document', window.document);
expose('navigator', window.navigator);
expose('requestAnimationFrame', (cb: (t: number) => void) => window.setTimeout(() => cb(0), 0));
expose('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
expose('HTMLElement', window.HTMLElement);
expose('SVGElement', window.SVGElement);
expose('Node', window.Node);
void g;

const { BoardView } = await import('../src/ui/board');

const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
const config = {
  ...DEFAULT_CONFIG,
  seats: colors.map((color, index) => ({
    color,
    kind: index === 0 ? ('human' as const) : ('cpu' as const),
    name: ['You', 'CPU 2', 'CPU 3', 'CPU 4'][index]!,
    difficulty: 'medium' as const,
  })),
};

const state: GameState = createGame(config, 4242);
// A representative mid-game snapshot: tokens spread across the board, some in
// the home lane, one finished, one stacked pair.
state.tokens = [
  [12, 26, 51, -1],
  [0, 7, 33, 55],
  [26, 26, -1, 49],
  [-1, 18, 56, 44],
];

const host = window.document.getElementById('host')!;
const view = new BoardView(host);
view.build(state);
view.setMoveHints([
  { seat: 0, token: 0, from: 12, to: 15, kind: 'advance', steps: 3, captures: [] },
]);

const root = host.querySelector('.board')!;
const art = root.querySelector('.board__art')!;
const tokenNodes = Array.from(root.querySelectorAll<HTMLElement>('.token'));

const colorVars: Record<string, { hex: string; deep: string; light: string }> = {
  red: { hex: '#e63a45', deep: '#9c1620', light: '#ff8a90' },
  green: { hex: '#22a06b', deep: '#0d6b45', light: '#6ee7b7' },
  yellow: { hex: '#f2b705', deep: '#a97b00', light: '#ffd95e' },
  blue: { hex: '#2f6fed', deep: '#1a3f96', light: '#8fb5ff' },
};

function tokenSvg(node: HTMLElement): string {
  const left = parseFloat(node.style.left) / 100;
  const top = parseFloat(node.style.top) / 100;
  const scale = Number(node.style.getPropertyValue('--token-scale') || 1);
  const colorClass = Array.from(node.classList).find((c) => c.startsWith('token--')) ?? 'token--red';
  const color = colorVars[colorClass.replace('token--', '')] ?? colorVars.red!;
  const cx = left * 15;
  const cy = top * 15;
  const r = 0.36 * scale;
  const playable = node.classList.contains('is-playable');
  return [
    `<g>`,
    `<ellipse cx="${cx.toFixed(3)}" cy="${(cy + r * 0.72).toFixed(3)}" rx="${(r * 0.92).toFixed(3)}" ry="${(r * 0.34).toFixed(3)}" fill="rgba(0,0,0,0.34)"/>`,
    playable
      ? `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(r * 1.5).toFixed(3)}" fill="none" stroke="rgba(255,236,160,0.95)" stroke-width="0.06"/>`
      : '',
    `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r.toFixed(3)}" fill="url(#t-${colorClass.replace('token--', '')})" stroke="rgba(255,255,255,0.55)" stroke-width="0.035"/>`,
    `<circle cx="${(cx - r * 0.24).toFixed(3)}" cy="${(cy - r * 0.3).toFixed(3)}" r="${(r * 0.36).toFixed(3)}" fill="rgba(255,255,255,0.72)"/>`,
    `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(r * 0.42).toFixed(3)}" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="0.03"/>`,
    `</g>`,
  ].join('');
}

const tokenDefs = Object.entries(colorVars)
  .map(
    ([name, c]) => `<radialGradient id="t-${name}" cx="0.34" cy="0.26" r="0.85">
      <stop offset="0" stop-color="${c.light}"/>
      <stop offset="0.46" stop-color="${c.hex}"/>
      <stop offset="1" stop-color="${c.deep}"/>
    </radialGradient>`,
  )
  .join('\n');

const artMarkup = art.innerHTML;
const svgOut = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" width="900" height="900">
  <defs>${tokenDefs}</defs>
  <g>${artMarkup}</g>
  <g>${tokenNodes.map(tokenSvg).join('\n')}</g>
</svg>`;

const target = resolve(process.argv[2] ?? 'docs/board-preview.svg');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, svgOut);

console.log(`wrote ${target}`);
console.log(
  'seat yards:',
  SEAT_GEOMETRY.map((s) => `${s.color}@${s.yardRect.x},${s.yardRect.y}`).join(' '),
);
