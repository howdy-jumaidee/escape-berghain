// The intro (issue #17). Minimal: pitch black, the lines one by one ("There are no mirrors in here"),
// then a slow white swirl that tightens and drops you on the dance floor as the horse. Space skips.
import { list, t } from './text';

const LINE_SECONDS = 2.3;
const SWIRL_SECONDS = 2.6;

export function playIntro(cover: HTMLElement, done: () => void): void {
  const lines = list('story:intro');
  const canvas = document.createElement('canvas');
  canvas.className = 'eb-swirl';
  const text = el('div', 'eb-intro');
  const skip = el('div', 'eb-skip');
  skip.textContent = t('story:start.skip');
  cover.replaceChildren(canvas, text, skip);

  let finished = false;
  let raf = 0;
  let timer = 0;
  let i = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onSkip);
    cover.removeEventListener('click', finish);
    done();
  };

  const swirl = () => {
    text.style.opacity = '0';
    const g = canvas.getContext('2d');
    const start = performance.now();
    const frame = (now: number) => {
      const k = (now - start) / 1000 / SWIRL_SECONDS;
      if (k >= 1 || !g) return finish();
      drawSwirl(canvas, g, k, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };

  const next = () => {
    if (i >= lines.length) return swirl();
    text.style.opacity = '0';
    timer = window.setTimeout(() => {
      text.textContent = lines[i++];
      text.style.opacity = '1';
      timer = window.setTimeout(next, LINE_SECONDS * 1000);
    }, 250);
  };

  const onSkip = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') finish();
  };
  // Let the click that started the game land first.
  setTimeout(() => {
    addEventListener('keydown', onSkip);
    cover.addEventListener('click', finish);
  }, 300);
  next();
}

/** Thin white spiral arms turning and tightening into the centre, fading out as they close. */
function drawSwirl(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, k: number, s: number): void {
  const w = (canvas.width = innerWidth);
  const h = (canvas.height = innerHeight);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const reach = Math.hypot(w, h) * 0.6 * (1 - k * 0.85);
  const arms = 5;
  g.strokeStyle = '#e8e8e8';
  g.lineWidth = 1;
  g.globalAlpha = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.8;
  for (let a = 0; a < arms; a++) {
    g.beginPath();
    for (let step = 0; step <= 140; step++) {
      const u = step / 140;
      const r = u * reach;
      const ang = (a / arms) * Math.PI * 2 + s * (1.5 + k * 6) + u * (5 + k * 9);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 0.8;
      if (step === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
