/** Lightweight canvas confetti for victories (no dependencies, auto-cleans up). */

export interface ConfettiOptions {
  colors?: string[];
  count?: number;
  duration?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  life: number;
}

const DEFAULT_COLORS = ['#e63a45', '#22a06b', '#f2b705', '#2f6fed', '#ffd95e', '#ffffff'];

export function burstConfetti(options: ConfettiOptions = {}): () => void {
  const colors = options.colors ?? DEFAULT_COLORS;
  const count = options.count ?? 140;
  const duration = options.duration ?? 3200;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  };
  resize();
  window.addEventListener('resize', resize);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }
  ctx.scale(dpr, dpr);

  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 90,
    vy: 110 + Math.random() * 220,
    size: 5 + Math.random() * 7,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 8,
    color: colors[Math.floor(Math.random() * colors.length)]!,
    life: 1,
  }));

  const start = performance.now();
  let frame = 0;
  let disposed = false;

  const tick = (now: number) => {
    if (disposed) return;
    const elapsed = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.vy += 240 * 0.016;
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.rotation += p.spin * 0.016;
      p.life = Math.max(0, 1 - elapsed / duration);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < duration) {
      frame = requestAnimationFrame(tick);
    } else {
      dispose();
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };

  frame = requestAnimationFrame(tick);
  return dispose;
}
