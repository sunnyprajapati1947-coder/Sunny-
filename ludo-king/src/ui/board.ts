/**
 * Board renderer.
 *
 * The static board is one responsive SVG (viewBox 0 0 15 15) so it stays crisp
 * at any size; the tokens are HTML elements positioned as percentages of the
 * board, which gives free responsive layout plus cheap CSS transitions for the
 * hop-by-hop movement, capture flings and stacking.
 */

import {
  SEAT_GEOMETRY,
  TRACK,
  cellCenter,
  centerHomeSpot,
  crossShapePath,
  movementPath,
  progressCenter,
  seatGeometry,
  type Vec,
} from '../core/geometry';
import {
  HOME_PROGRESS,
  SEATS,
  TOKENS_PER_PLAYER,
  YARD,
  type GameState,
  type Move,
  type PlayerColor,
} from '../core/types';
import { COLOR_META } from '../core/setup';
import { clear, el, svg } from './dom';

const BOARD_UNITS = 15;

type Pos = { x: number; y: number; scale: number };

function colorIndexOf(color: PlayerColor): number {
  return SEATS.indexOf(color);
}

function pct(value: number): string {
  return `${(value / BOARD_UNITS) * 100}%`;
}

export interface BoardOptions {
  onTokenClick?: (seat: number, token: number) => void;
  onBoardClick?: () => void;
}

export interface SpeedProfile {
  hop: number;
  settle: number;
}

export class BoardView {
  readonly root: HTMLElement;
  private art: SVGSVGElement;
  private layer: HTMLElement;
  private tokens: HTMLElement[][] = [];
  private ghost: HTMLElement;
  private state: GameState | null = null;
  private generation = 0;
  private busy = false;

  constructor(container: HTMLElement, private options: BoardOptions = {}) {
    this.root = el('div', { class: 'board', role: 'grid', 'aria-label': 'Ludo board' });
    this.art = svg('svg', { class: 'board__art', viewBox: '0 0 15 15', 'aria-hidden': 'true' });
    this.layer = el('div', { class: 'board__tokens' });
    this.ghost = el('div', { class: 'ghost', 'aria-hidden': 'true' });
    this.layer.append(this.ghost);
    this.root.append(this.art, this.layer);
    container.append(this.root);

    this.layer.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-seat]');
      if (!target) return;
      const seat = Number(target.dataset.seat);
      const token = Number(target.dataset.token);
      if (Number.isNaN(seat) || Number.isNaN(token)) return;
      this.options.onTokenClick?.(seat, token);
    });
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root || event.target === this.art) this.options.onBoardClick?.();
    });
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /** Builds (or rebuilds) the static board art for a match configuration. */
  build(state: GameState): void {
    this.state = state;
    const active = new Set(state.config.seats.map((s) => s.color));
    clear(this.art);
    this.art.append(this.defs(active));

    // Board plate + cross-shaped playing field.
    this.art.append(
      svg('rect', { x: 0, y: 0, width: 15, height: 15, rx: 0.7, fill: 'url(#plate)' }),
      svg('path', { d: crossShapePath(), fill: 'url(#field)', stroke: 'rgba(70,45,25,0.35)', 'stroke-width': 0.06 }),
    );

    // Yards first (they sit under the track arms).
    SEAT_GEOMETRY.forEach((g) => this.art.append(this.yard(g, active.has(g.color))));

    // Track squares.
    const safe = new Set(state.config.safeTrackIndices);
    TRACK.forEach((cell, index) => {
      const isStart = SEAT_GEOMETRY.some((g) => g.startOffset === index);
      const startSeat = SEAT_GEOMETRY.find((g) => g.startOffset === index);
      const fill = startSeat && active.has(startSeat.color)
        ? `url(#g-${startSeat.color})`
        : 'url(#cell)';
      this.art.append(
        svg('rect', {
          x: cell.x + 0.06,
          y: cell.y + 0.06,
          width: 0.88,
          height: 0.88,
          rx: 0.16,
          fill,
          stroke: 'rgba(90,62,35,0.28)',
          'stroke-width': 0.035,
          class: 'cell',
        }),
      );
      if (safe.has(index) && !isStart) {
        this.art.append(this.star(cell.x + 0.5, cell.y + 0.5, 0.3, 'rgba(120,86,44,0.55)'));
      }
      if (isStart && startSeat) {
        this.art.append(this.star(cell.x + 0.5, cell.y + 0.5, 0.26, 'rgba(255,255,255,0.85)'));
      }
    });

    // Home lanes.
    SEAT_GEOMETRY.forEach((g) => {
      const dim = !active.has(g.color);
      g.lane.forEach((cell, i) => {
        this.art.append(
          svg('rect', {
            x: cell.x + 0.08,
            y: cell.y + 0.08,
            width: 0.84,
            height: 0.84,
            rx: 0.14,
            fill: `url(#g-${g.color})`,
            opacity: dim ? 0.28 : 1,
            stroke: 'rgba(60,40,20,0.25)',
            'stroke-width': 0.03,
            class: 'lane-cell',
          }),
        );
        // Directional chevrons pointing at the centre.
        if (i === 1 || i === 3) {
          this.art.append(this.chevron(g, cell, dim));
        }
      });
    });

    // Centre home triangles.
    this.art.append(this.centre(active));

    // Gloss + inner border for a premium, slightly 3D finish.
    this.art.append(
      svg('path', {
        d: crossShapePath(),
        fill: 'none',
        stroke: 'rgba(255,255,255,0.35)',
        'stroke-width': 0.05,
        'stroke-linejoin': 'round',
      }),
    );
    this.art.append(
      svg('rect', {
        x: 0.12,
        y: 0.12,
        width: 14.76,
        height: 14.76,
        rx: 0.6,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.18)',
        'stroke-width': 0.06,
      }),
    );

    this.buildTokens(state);
  }

  private defs(active: Set<PlayerColor>): SVGDefsElement {
    const defs = svg('defs');
    defs.append(
      svg('linearGradient', { id: 'plate', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#3c2a1c' }),
        svg('stop', { offset: '100%', 'stop-color': '#22160d' }),
      ),
      svg('linearGradient', { id: 'field', x1: '0', y1: '0', x2: '1', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#fbf6e9' }),
        svg('stop', { offset: '55%', 'stop-color': '#f2ead6' }),
        svg('stop', { offset: '100%', 'stop-color': '#e6dbc2' }),
      ),
      svg('linearGradient', { id: 'cell', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#fffdf7' }),
        svg('stop', { offset: '100%', 'stop-color': '#f6efdd' }),
      ),
    );
    for (const color of SEATS) {
      const meta = COLOR_META[color];
      defs.append(
        svg('linearGradient', { id: `g-${color}`, x1: '0', y1: '0', x2: '0.6', y2: '1' },
          svg('stop', { offset: '0%', 'stop-color': meta.light }),
          svg('stop', { offset: '45%', 'stop-color': meta.hex }),
          svg('stop', { offset: '100%', 'stop-color': meta.deep }),
        ),
        svg('radialGradient', { id: `yard-${color}`, cx: '0.32', cy: '0.22', r: '0.95' },
          svg('stop', { offset: '0%', 'stop-color': meta.light }),
          svg('stop', { offset: '55%', 'stop-color': meta.hex }),
          svg('stop', { offset: '100%', 'stop-color': meta.deep }),
        ),
      );
    }
    defs.append(
      svg('filter', { id: 'softShadow', x: '-30%', y: '-30%', width: '160%', height: '160%' },
        svg('feDropShadow', { dx: '0', dy: '0.12', stdDeviation: '0.12', 'flood-color': 'rgba(0,0,0,0.35)' }),
      ),
    );
    void active;
    return defs;
  }

  private yard(g: (typeof SEAT_GEOMETRY)[number], active: boolean): SVGGElement {
    const group = svg('g', { class: `yard yard--${g.color}`, 'data-yard': g.color, opacity: active ? 1 : 0.45 });
    const { x, y, size } = g.yardRect;
    group.append(
      svg('rect', {
        x: x + 0.16,
        y: y + 0.16,
        width: size - 0.32,
        height: size - 0.32,
        rx: 0.75,
        fill: `url(#yard-${g.color})`,
        stroke: 'rgba(0,0,0,0.28)',
        'stroke-width': 0.06,
        filter: 'url(#softShadow)',
        class: 'yard__panel',
      }),
      svg('rect', {
        x: x + 0.6,
        y: y + 0.6,
        width: size - 1.2,
        height: size - 1.2,
        rx: 0.55,
        fill: 'rgba(255,255,255,0.16)',
        stroke: 'rgba(255,255,255,0.28)',
        'stroke-width': 0.045,
      }),
      svg('rect', {
        x: x + 0.78,
        y: y + 0.78,
        width: size - 1.56,
        height: size - 1.56,
        rx: 0.5,
        fill: 'rgba(0,0,0,0.14)',
      }),
    );
    for (const spot of g.yardSpots) {
      group.append(
        svg('circle', {
          cx: spot.x,
          cy: spot.y,
          r: 0.44,
          fill: 'rgba(0,0,0,0.20)',
          stroke: 'rgba(255,255,255,0.45)',
          'stroke-width': 0.05,
        }),
        svg('circle', { cx: spot.x, cy: spot.y - 0.05, r: 0.3, fill: 'rgba(255,255,255,0.10)' }),
      );
    }
    return group;
  }

  private centre(active: Set<PlayerColor>): SVGGElement {
    const group = svg('g', { class: 'centre' });
    // Each home lane enters the centre square from one side, so the centre is
    // split into four triangles that meet at 7.5,7.5.
    const triangles: Array<{ color: PlayerColor; points: string }> = [
      { color: 'red', points: '6,6 6,9 7.5,7.5' },
      { color: 'green', points: '6,6 9,6 7.5,7.5' },
      { color: 'yellow', points: '9,6 9,9 7.5,7.5' },
      { color: 'blue', points: '6,9 9,9 7.5,7.5' },
    ];
    for (const { color, points } of triangles) {
      group.append(
        svg('path', {
          d: `M ${points.split(' ').join(' L ')} Z`,
          fill: `url(#g-${color})`,
          opacity: active.has(color) ? 1 : 0.35,
          stroke: 'rgba(40,25,12,0.32)',
          'stroke-width': 0.05,
        }),
      );
    }
    // Inner shadow ring so the crown disc reads as raised.
    group.append(
      svg('circle', { cx: 7.5, cy: 7.5, r: 1.12, fill: 'rgba(0,0,0,0.22)' }),
      svg('circle', {
        cx: 7.5,
        cy: 7.5,
        r: 0.98,
        fill: 'rgba(255,253,246,0.96)',
        stroke: 'rgba(70,45,20,0.5)',
        'stroke-width': 0.06,
        filter: 'url(#softShadow)',
      }),
    );
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      group.append(
        svg('circle', {
          cx: 7.5 + Math.cos(angle) * 0.82,
          cy: 7.5 + Math.sin(angle) * 0.82,
          r: 0.045,
          fill: 'rgba(150,110,55,0.45)',
        }),
      );
    }
    group.append(this.star(7.5, 7.5, 0.52, '#c99a2e'));
    group.append(this.star(7.5, 7.5, 0.3, 'rgba(255,255,255,0.95)'));
    return group;
  }

  private star(cx: number, cy: number, r: number, fill: string): SVGPathElement {
    const points: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      points.push(`${(cx + Math.cos(angle) * radius).toFixed(3)},${(cy + Math.sin(angle) * radius).toFixed(3)}`);
    }
    return svg('path', { d: `M ${points.join(' L ')} Z`, fill, opacity: 0.9 });
  }

  private chevron(g: (typeof SEAT_GEOMETRY)[number], cell: { x: number; y: number }, dim: boolean): SVGPathElement {
    const size = 0.17;
    const cx = cell.x + 0.5;
    const cy = cell.y + 0.5;
    let d: string;
    // Arrows always point the way the token travels: toward the centre.
    switch (g.centerSide) {
      case 'left': // lane runs left -> right
        d = `M ${cx - size} ${cy - size} L ${cx + size} ${cy} L ${cx - size} ${cy + size}`;
        break;
      case 'right': // lane runs right -> left
        d = `M ${cx + size} ${cy - size} L ${cx - size} ${cy} L ${cx + size} ${cy + size}`;
        break;
      case 'top': // lane runs top -> bottom
        d = `M ${cx - size} ${cy - size} L ${cx} ${cy + size} L ${cx + size} ${cy - size}`;
        break;
      case 'bottom': // lane runs bottom -> top
        d = `M ${cx - size} ${cy + size} L ${cx} ${cy - size} L ${cx + size} ${cy + size}`;
        break;
    }
    return svg('path', {
      d,
      fill: 'none',
      stroke: 'rgba(255,255,255,0.75)',
      'stroke-width': 0.075,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: dim ? 0.4 : 1,
    });
  }

  private buildTokens(state: GameState): void {
    for (const child of Array.from(this.layer.children)) {
      if (child !== this.ghost) child.remove();
    }
    this.tokens = state.config.seats.map((seat, seatIndex) =>
      Array.from({ length: TOKENS_PER_PLAYER }, (_, token) => {
        const node = el(
          'button',
          {
            class: `token token--${seat.color}`,
            type: 'button',
            'data-seat': seatIndex,
            'data-token': token,
            'aria-label': `${seat.name} token ${token + 1}`,
          },
          el('span', { class: 'token__shadow' }),
          el('span', { class: 'token__body' }),
          el('span', { class: 'token__cap' }),
          el('span', { class: 'token__shine' }),
        );
        this.layer.append(node);
        return node;
      }),
    );
    this.setState(state, true);
  }

  /** Places every token according to the current state. */
  setState(state: GameState, instant = false): void {
    this.state = state;
    this.root.classList.toggle('is-busy', this.busy);
    if (instant) this.root.classList.add('no-transition');
    const positions = this.computePositions(state);
    state.tokens.forEach((row, seat) => {
      row.forEach((_, token) => {
        const node = this.tokens[seat]?.[token];
        if (!node) return;
        const pos = positions.get(`s${seat}t${token}`);
        if (!pos) return;
        node.style.left = pct(pos.x);
        node.style.top = pct(pos.y);
        node.style.setProperty('--token-scale', String(pos.scale));
        node.classList.toggle('is-home', state.tokens[seat]![token] === HOME_PROGRESS);
        node.classList.toggle('is-yard', state.tokens[seat]![token] === YARD);
        (node as HTMLButtonElement).disabled = false;
        node.removeAttribute('aria-disabled');
      });
    });
    // Active-seat glow on the yard.
    this.art.querySelectorAll<SVGGElement>('.yard').forEach((yard) => {
      const color = yard.dataset.yard as PlayerColor | undefined;
      const seatConfig = state.config.seats.find((s) => s.color === color);
      const active = seatConfig ? state.config.seats.indexOf(seatConfig) === state.turn : false;
      yard.classList.toggle('is-active', active && state.phase !== 'game-over');
    });
    if (instant) {
      // Force a reflow so the transition suppression only lasts one frame.
      void this.root.offsetWidth;
      requestAnimationFrame(() => this.root.classList.remove('no-transition'));
    }
  }

  private computePositions(state: GameState): Map<string, Pos> {
    const result = new Map<string, Pos>();
    const buckets = new Map<string, Array<{ seat: number; token: number }>>();

    state.config.seats.forEach((seat, seatIndex) => {
      const colorIndex = colorIndexOf(seat.color);
      state.tokens[seatIndex]!.forEach((progress, token) => {
        let key: string;
        if (progress === YARD) key = `yard:${seatIndex}:${token}`;
        else if (progress === HOME_PROGRESS) key = `home:${seatIndex}`;
        else if (progress <= 50) key = `track:${(seatGeometry(colorIndex).startOffset + progress) % 52}`;
        else key = `lane:${seatIndex}:${progress}`;
        const list = buckets.get(key) ?? [];
        list.push({ seat: seatIndex, token });
        buckets.set(key, list);
      });
    });

    for (const [key, members] of buckets) {
      const [kind] = key.split(':');
      if (kind === 'yard') {
        const [, seatRaw, tokenRaw] = key.split(':');
        const seat = Number(seatRaw);
        const token = Number(tokenRaw);
        const g = seatGeometry(colorIndexOf(state.config.seats[seat]!.color));
        const spot = g.yardSpots[token] ?? g.yardSpots[0]!;
        result.set(`s${seat}t${token}`, { x: spot.x, y: spot.y, scale: 1 });
        continue;
      }
      if (kind === 'home') {
        const [, seatRaw] = key.split(':');
        const seat = Number(seatRaw);
        members.forEach((m, index) => {
          const spot = centerHomeSpot(
            colorIndexOf(state.config.seats[seat]!.color),
            index,
            members.length,
          );
          result.set(`s${m.seat}t${m.token}`, { x: spot.x, y: spot.y, scale: 0.78 });
        });
        continue;
      }

      const base = this.basePosition(state, key);
      if (!base) continue;
      const count = members.length;
      members.forEach((m, index) => {
        const offset = clusterOffset(index, count);
        result.set(`s${m.seat}t${m.token}`, {
          x: base.x + offset.x,
          y: base.y + offset.y,
          scale: count === 1 ? 1 : count === 2 ? 0.72 : 0.68,
        });
      });
    }
    return result;
  }

  private basePosition(state: GameState, key: string): Vec | null {
    const parts = key.split(':');
    if (parts[0] === 'track') {
      const cell = TRACK[Number(parts[1])];
      return cell ? cellCenter(cell) : null;
    }
    if (parts[0] === 'lane') {
      const seat = Number(parts[1]);
      const progress = Number(parts[2]);
      const g = seatGeometry(colorIndexOf(state.config.seats[seat]!.color));
      const cell = g.lane[progress - 51];
      return cell ? cellCenter(cell) : null;
    }
    return null;
  }

  /** Highlights the tokens the current player may move and shows target markers. */
  setMoveHints(moves: Move[] | null): void {
    for (const row of this.tokens) {
      for (const node of row) node.classList.remove('is-playable');
    }
    this.ghost.classList.remove('is-visible');
    if (!moves || moves.length === 0) {
      this.root.classList.remove('has-hints');
      return;
    }
    this.root.classList.add('has-hints');
    for (const move of moves) {
      const node = this.tokens[move.seat]?.[move.token];
      node?.classList.add('is-playable');
    }
    // Show a marker on the destination of the single unambiguous move.
    const first = moves[0]!;
    const state = this.state;
    if (state) {
      const colorIndex = colorIndexOf(state.config.seats[first.seat]!.color);
      const target = progressCenter(colorIndex, first.to);
      this.ghost.style.left = pct(target.x);
      this.ghost.style.top = pct(target.y);
      this.ghost.classList.add('is-visible');
      this.ghost.dataset.seat = String(first.seat);
      this.ghost.className = `ghost is-visible ghost--${state.config.seats[first.seat]!.color}`;
      this.ghost.style.left = pct(target.x);
      this.ghost.style.top = pct(target.y);
    }
  }

  /** Animates a move hop by hop; resolves when the token has settled. */
  async animateMove(
    before: GameState,
    move: Move,
    after: GameState,
    speed: SpeedProfile,
  ): Promise<void> {
    const generation = ++this.generation;
    this.busy = true;
    this.root.classList.add('is-busy');
    const node = this.tokens[move.seat]?.[move.token];
    if (!node) {
      this.setState(after, true);
      this.busy = false;
      return;
    }
    const colorIndex = colorIndexOf(before.config.seats[move.seat]!.color);
    const g = seatGeometry(colorIndex);
    const path = movementPath(move.from, move.to);

    node.classList.add('is-moving');
    node.style.zIndex = '30';
    if (move.from === YARD) {
      const start = progressCenter(colorIndex, 0);
      await this.hopTo(node, start, speed.hop * 1.3, generation);
    } else {
      let last = move.from;
      for (const step of path) {
        if (generation !== this.generation) break;
        const pos = progressCenter(colorIndex, step);
        await this.hopTo(node, pos, speed.hop, generation);
        last = step;
      }
      void last;
    }
    node.classList.remove('is-moving');
    node.style.zIndex = '';

    if (generation !== this.generation) {
      this.busy = false;
      return;
    }

    // Sync every token to the authoritative state (stacks, homes, victims).
    this.setState(after, true);
    this.busy = false;
    this.root.classList.remove('is-busy');
    void g;
    if (generation === this.generation && before.phase === 'awaiting-move') {
      // A very short beat so the landing reads clearly.
      await new Promise((resolve) => setTimeout(resolve, Math.round(speed.settle * 0.4)));
    }
  }

  /** Flings captured tokens back to their yard. */
  async animateCaptures(victims: Array<{ seat: number; token: number }>, speed: SpeedProfile): Promise<void> {
    const generation = this.generation;
    await Promise.all(
      victims.map(async (victim) => {
        const node = this.tokens[victim.seat]?.[victim.token];
        if (!node) return;
        const colorIndex = colorIndexOf(this.state!.config.seats[victim.seat]!.color);
        const spot = seatGeometry(colorIndex).yardSpots[victim.token] ?? seatGeometry(colorIndex).yardSpots[0]!;
        node.classList.add('is-captured');
        await this.hopTo(node, spot, Math.round(speed.hop * 2.4), generation);
        node.classList.remove('is-captured');
      }),
    );
  }

  private hopTo(node: HTMLElement, target: Vec, duration: number, generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    node.style.transitionDuration = `${duration}ms`;
    node.style.left = pct(target.x);
    node.style.top = pct(target.y);
    node.classList.remove('is-hopping');
    void node.offsetWidth;
    node.classList.add('is-hopping');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        node.classList.remove('is-hopping');
        resolve();
      }, duration);
    });
  }

  /** Pulses the winning seat and lets confetti fly (handled by the caller). */
  celebrate(seat: number): void {
    const nodes = this.tokens[seat] ?? [];
    nodes.forEach((node, index) => {
      node.style.animationDelay = `${index * 90}ms`;
      node.classList.add('is-celebrating');
    });
  }

  clearHints(): void {
    this.setMoveHints(null);
  }

  /** Cancels any in-flight animation (used by restart / quit). */
  cancelAnimations(): void {
    this.generation += 1;
    this.busy = false;
    this.root.classList.remove('is-busy');
  }

  destroy(): void {
    this.cancelAnimations();
    this.root.remove();
  }
}

function clusterOffset(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  // Two tokens sit side by side; three or four fan out around the square.
  if (count === 2) {
    return index === 0 ? { x: -0.27, y: -0.08 } : { x: 0.27, y: 0.08 };
  }
  const radius = count === 3 ? 0.19 : 0.22;
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
