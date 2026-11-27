// The intro (issue #17). About 7 seconds, skippable with Space.
// 1. Black, a kick drum through a concrete wall, "Sunday. 06:12."
// 2. Neon tunnel. A human silhouette spins through it and stretches into a horse.
// 3. Flash, thud onto the dance floor. The spirit guide takes over in game.
import { list, t } from './text';

const DATE_SECONDS = 2.4;
const TUNNEL_SECONDS = 4.2;

const HUMAN = `<svg viewBox="0 0 100 220"><circle cx="50" cy="28" r="20"/><rect x="28" y="54" width="44" height="80" rx="16"/><rect x="30" y="128" width="16" height="84" rx="7"/><rect x="54" y="128" width="16" height="84" rx="7"/><rect x="10" y="58" width="14" height="66" rx="7" transform="rotate(-20 17 58)"/><rect x="76" y="58" width="14" height="66" rx="7" transform="rotate(20 83 58)"/></svg>`;
const HORSE = `<svg viewBox="0 0 220 160"><rect x="40" y="50" width="120" height="52" rx="22"/><rect x="138" y="20" width="24" height="56" rx="10" transform="rotate(25 150 48)"/><rect x="150" y="6" width="54" height="24" rx="10" transform="rotate(20 177 18)"/><rect x="48" y="92" width="14" height="62" rx="6"/><rect x="72" y="92" width="14" height="62" rx="6"/><rect x="118" y="92" width="14" height="62" rx="6"/><rect x="140" y="92" width="14" height="62" rx="6"/><path d="M40 62 Q10 70 18 110" stroke="currentColor" stroke-width="9" fill="none" stroke-linecap="round"/></svg>`;

export function playIntro(cover: HTMLElement, done: () => void): void {
  const lines = list('story:intro');
  const stage = el('div', 'eb-tunnel');
  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  const human = el('div', 'eb-morph eb-human');
  human.innerHTML = HUMAN;
  const horse = el('div', 'eb-morph eb-horse');
  horse.innerHTML = HORSE;
  stage.append(human, horse);
  const text = el('div', 'eb-intro');
  text.textContent = lines[0] ?? '';
  const skip = el('div', 'eb-skip');
  skip.textContent = t('story:start.skip');
  const flash = el('div', 'eb-intro-flash');
  cover.replaceChildren(stage, text, skip, flash);

  let finished = false;
  let raf = 0;
  const start = performance.now();
  const g = canvas.getContext('2d');

  const frame = (now: number) => {
    const s = (now - start) / 1000;
    if (s > DATE_SECONDS) {
      text.style.opacity = '0';
      stage.style.opacity = '1';
      const k = Math.min(1, (s - DATE_SECONDS) / TUNNEL_SECONDS);
      drawTunnel(canvas, g, s, k);
      // Spin, then stretch from human into horse.
      const spin = s * (6 + k * 10);
      const morph = Math.max(0, (k - 0.35) / 0.5);
      const m = Math.min(1, morph);
      human.style.opacity = String(1 - m);
      horse.style.opacity = String(m);
      const scale = 0.35 + k * 0.9;
      human.style.transform = `translate(-50%, -50%) scale(${scale * (1 + m * 0.8)}, ${scale * (1 - m * 0.4)}) rotate(${spin * 40}deg)`;
      horse.style.transform = `translate(-50%, -50%) scale(${scale * (0.6 + m * 0.6)}) rotate(${spin * 40 * (1 - m)}deg)`;
      if (k >= 1) return finish();
    }
    raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onSkip);
    cover.removeEventListener('click', finish);
    flash.classList.add('on');
    done();
  };
  const onSkip = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') finish();
  };
  // Let the click that started the game land first.
  setTimeout(() => {
    addEventListener('keydown', onSkip);
    cover.addEventListener('click', finish);
  }, 300);
  raf = requestAnimationFrame(frame);
}

function drawTunnel(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D | null, s: number, k: number): void {
  if (!g) return;
  const w = (canvas.width = innerWidth);
  const h = (canvas.height = innerHeight);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cx = w / 2 + Math.sin(s * 1.7) * w * 0.04;
  const cy = h / 2 + Math.cos(s * 1.3) * h * 0.04;
  const colours = ['#ff1744', '#9c27ff', '#22d3ff', '#ff4fa0'];
  const speed = 1.2 + k * 3;
  for (let i = 0; i < 26; i++) {
    // Rings rush towards you; z wraps from far to near.
    const z = 1 - (((s * speed) / 6 + i / 26) % 1);
    const r = (Math.max(w, h) * 0.04) / Math.max(0.02, z);
    g.strokeStyle = colours[i % colours.length];
    g.globalAlpha = Math.min(1, (1 - z) * 1.6);
    g.lineWidth = 2 + (1 - z) * 10;
    g.shadowBlur = 18;
    g.shadowColor = g.strokeStyle;
    g.beginPath();
    // Squared off rings: concrete tunnel, not a wormhole.
    const twist = s * 0.6 + i * 0.12;
    for (let a = 0; a <= 4; a++) {
      const ang = twist + (a * Math.PI) / 2 + Math.PI / 4;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 0.75;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.shadowBlur = 0;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
