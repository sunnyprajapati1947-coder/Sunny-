/**
 * 3D dice view.
 *
 * A CSS 3D cube with real pip faces. During a roll the cube tumbles on two
 * axes and settles showing the requested face (the rotation maths lives in
 * core/dice.ts). Screen-reader text mirrors the value.
 */

import { FACE_ROTATION, PIP_LAYOUT } from '../core/dice';
import { el } from './dom';

const FACE_CLASS: Record<number, string> = {
  1: 'front',
  2: 'top',
  3: 'right',
  4: 'left',
  5: 'bottom',
  6: 'back',
};

export interface DiceOptions {
  onRollRequest?: () => void;
  size?: number;
}

export class DiceView {
  readonly root: HTMLButtonElement;
  private cube: HTMLElement;
  private faces = new Map<number, HTMLElement>();
  private value = 1;
  private rolling = false;

  constructor(container: HTMLElement, private options: DiceOptions = {}) {
    this.cube = el('div', { class: 'die__cube' });
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const node = el('div', { class: `die__face die__face--${FACE_CLASS[face]}` });
      for (let i = 0; i < 9; i += 1) {
        const pip = el('span', { class: 'die__pip' });
        if (!PIP_LAYOUT[face]!.includes(i)) pip.classList.add('is-empty');
        node.append(pip);
      }
      this.faces.set(face, node);
      this.cube.append(node);
    }
    this.root = el(
      'button',
      {
        class: 'die',
        type: 'button',
        'aria-label': 'Roll the dice',
        title: 'Roll the dice',
      },
      el('span', { class: 'die__stage' }, this.cube),
      el('span', { class: 'die__shadow' }),
    );
    this.root.addEventListener('click', () => {
      if (this.rolling) return;
      this.options.onRollRequest?.();
    });
    container.append(this.root);
    this.applyFace(1);
  }

  get isRolling(): boolean {
    return this.rolling;
  }

  setEnabled(enabled: boolean): void {
    this.root.classList.toggle('is-enabled', enabled);
    this.root.disabled = !enabled;
    this.root.setAttribute('aria-disabled', String(!enabled));
  }

  private applyFace(value: number): void {
    this.value = value;
    const rotation = FACE_ROTATION[value] ?? { x: 0, y: 0 };
    this.cube.style.transform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
    this.root.dataset.value = String(value);
    this.root.setAttribute('aria-label', `Dice shows ${value}. Roll the dice.`);
  }

  /** Rolls to `value`; resolves after the animation finishes. */
  async roll(value: number, durationMs: number): Promise<void> {
    if (this.rolling) return;
    this.rolling = true;
    this.root.classList.add('is-rolling');
    const target = FACE_ROTATION[value] ?? { x: 0, y: 0 };
    // Spin several full turns on both axes before settling on the target face.
    const spinX = target.x + 360 * (2 + Math.floor(Math.random() * 2));
    const spinY = target.y + 360 * (2 + Math.floor(Math.random() * 3));
    this.cube.style.transitionDuration = `${durationMs}ms`;
    this.cube.style.transform = `rotateX(${spinX}deg) rotateY(${spinY}deg)`;

    await new Promise((resolve) => setTimeout(resolve, durationMs));

    // Settle on the canonical rotation for the face (no leftover full turns).
    this.cube.style.transitionDuration = '160ms';
    this.cube.style.transform = `rotateX(${target.x}deg) rotateY(${target.y}deg)`;
    this.value = value;
    this.root.dataset.value = String(value);
    this.root.setAttribute('aria-label', `Dice shows ${value}.`);
    this.root.classList.toggle('is-six', value === 6);
    this.root.classList.remove('is-rolling');
    this.root.classList.add('is-settled');
    setTimeout(() => this.root.classList.remove('is-settled'), 320);
    await new Promise((resolve) => setTimeout(resolve, 170));
    this.rolling = false;
  }

  /** Restores a saved dice value without animating. */
  setValue(value: number | null): void {
    if (value === null) {
      this.root.classList.remove('is-six');
      this.applyFace(this.value);
      return;
    }
    this.applyFace(value);
    this.root.classList.toggle('is-six', value === 6);
  }

  shake(): void {
    this.root.classList.add('is-nudged');
    setTimeout(() => this.root.classList.remove('is-nudged'), 380);
  }

  get current(): number {
    return this.value;
  }
}
