// Landscape touch controls for phones and tablets: frosted-glass virtual stick + action cluster.
// Talks to existing systems by emitting standard KeyboardEvent keydown/keyup codes on window.
import { bus, state } from '../contracts';
import { t } from './text';

const DEADZONE = 0.22;
const STICK_MAX_PX = 38;

function isTouchCapable(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('touch')) return true;
  if (params.has('desktop')) return false;
  return (
    /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
}

function emitKey(code: string, down: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
}

function tapKey(code: string): void {
  emitKey(code, true);
  window.setTimeout(() => emitKey(code, false), 45);
}

export function startTouch(root: HTMLElement): void {
  if (!isTouchCapable()) return;
  root.classList.add('touch');

  const wrap = el('div', 'eb-touch off', root);

  // Left: virtual thumb stick for WASD steering.
  const stick = el('div', 'eb-stick', wrap);
  const knob = el('div', 'eb-stick-knob', stick);
  const held = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
  let stickPtr: number | null = null;
  let originX = 0;
  let originY = 0;

  const setKey = (code: keyof typeof held, on: boolean) => {
    if (held[code] === on) return;
    held[code] = on;
    emitKey(code, on);
  };

  const releaseStick = () => {
    stickPtr = null;
    knob.style.transform = '';
    stick.classList.remove('active');
    setKey('KeyW', false);
    setKey('KeyS', false);
    setKey('KeyA', false);
    setKey('KeyD', false);
  };

  const updateStick = (clientX: number, clientY: number) => {
    const dx = clientX - originX;
    const dy = clientY - originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, STICK_MAX_PX);
    const angle = Math.atan2(dy, dx);
    const ox = dist > 0 ? Math.cos(angle) * clamped : 0;
    const oy = dist > 0 ? Math.sin(angle) * clamped : 0;
    knob.style.transform = `translate(${ox}px, ${oy}px)`;
    const nx = ox / STICK_MAX_PX;
    const ny = oy / STICK_MAX_PX;
    setKey('KeyW', ny < -DEADZONE);
    setKey('KeyS', ny > DEADZONE);
    setKey('KeyA', nx < -DEADZONE);
    setKey('KeyD', nx > DEADZONE);
  };

  stick.addEventListener('pointerdown', (e) => {
    if (stickPtr !== null) return;
    e.preventDefault();
    stickPtr = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const rect = stick.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    stick.classList.add('active');
    updateStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickPtr) return;
    e.preventDefault();
    updateStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointerup', (e) => {
    if (e.pointerId === stickPtr) releaseStick();
  });
  stick.addEventListener('pointercancel', (e) => {
    if (e.pointerId === stickPtr) releaseStick();
  });

  // Right: ergonomic action buttons (Grab/Talk, Stomp, Look).
  const pad = el('div', 'eb-pad', wrap);
  const lookBtn = mkBtn(pad, 'eb-tbtn', t('story:touch.look'), () => tapKey('KeyQ'));
  const stompBtn = mkBtn(pad, 'eb-tbtn', t('story:touch.stomp'), () => tapKey('KeyE'));
  const actBtn = mkBtn(pad, 'eb-tbtn primary', t('story:touch.act'), () => tapKey('Space'));
  void lookBtn;
  void stompBtn;

  // Highlight the primary button when an NPC or pickup is in Space range.
  let npcTalk = false;
  let worldGrab = false;
  const paintAct = () => {
    const hot = (npcTalk || worldGrab) && state.started && !state.ending;
    actBtn.classList.toggle('hot', hot);
    actBtn.textContent = t(npcTalk ? 'story:interact.talk' : worldGrab ? 'story:interact.grab' : 'story:touch.act');
  };
  bus.on('player:near', ({ by, near, kind }) => {
    if (!state.started || state.ending) {
      npcTalk = false;
      worldGrab = false;
      return paintAct();
    }
    if (by === 'npc') npcTalk = near && kind === 'talk';
    else worldGrab = near && kind === 'grab';
    paintAct();
  });

  // Top-right: Fullscreen, View & Mute pills during play, Leave pill during conversations.
  const tools = el('div', 'eb-top-tools', wrap);
  const fullBtn = mkBtn(tools, 'eb-tpill', t('story:touch.fullscreen'), () => toggleFullscreen());
  mkBtn(tools, 'eb-tpill', t('story:touch.view'), () => tapKey('KeyV'));
  const muteBtn = mkBtn(tools, 'eb-tpill', t('story:touch.mute'), () => {
    muteBtn.classList.toggle('active');
    tapKey('KeyM');
  });
  mkBtn(wrap, 'eb-tpill eb-leave', t('story:touch.leave'), () => tapKey('Escape'));

  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
  const fsDoc = document as FsDoc;
  const fsRoot = document.documentElement as FsEl;
  const isNativeFs = () => !!(document.fullscreenElement || fsDoc.webkitFullscreenElement);
  let zenFallback = false;

  const paintFs = () => {
    const on = isNativeFs() || zenFallback;
    fullBtn.classList.toggle('active', on);
    fullBtn.textContent = t(on ? 'story:touch.exit_full' : 'story:touch.fullscreen');
    root.classList.toggle('zen', zenFallback);
  };

  const toggleFullscreen = () => {
    if (isNativeFs()) {
      const exit = document.exitFullscreen?.bind(document) ?? fsDoc.webkitExitFullscreen?.bind(fsDoc);
      Promise.resolve(exit?.()).catch(() => {});
      return;
    }
    const req = fsRoot.requestFullscreen?.bind(fsRoot) ?? fsRoot.webkitRequestFullscreen?.bind(fsRoot);
    if (req) {
      Promise.resolve(req())
        .then(() => {
          zenFallback = false;
          paintFs();
        })
        .catch(() => {
          // iOS Safari/Chrome blocks element fullscreen: fall back to clean zen mode + nudge browser bar.
          zenFallback = !zenFallback;
          window.scrollTo(0, 1);
          paintFs();
        });
    } else {
      zenFallback = !zenFallback;
      window.scrollTo(0, 1);
      paintFs();
    }
  };
  document.addEventListener('fullscreenchange', paintFs);
  document.addEventListener('webkitfullscreenchange', paintFs);

  bus.on('intro:land', () => {
    if (!state.ending) wrap.classList.remove('off');
    paintAct();
  });
  bus.on('npc:focus', releaseStick);
  bus.on('player:caught', releaseStick);
  bus.on('trip:max', releaseStick);
  bus.on('ending:show', () => {
    releaseStick();
    wrap.classList.add('off');
  });
  window.addEventListener('blur', releaseStick);
  window.addEventListener('resize', () => {
    if (window.innerHeight >= window.innerWidth) releaseStick();
  });
}

function mkBtn(parent: HTMLElement, cls: string, label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.classList.add('down');
    onTap();
  });
  const up = () => b.classList.remove('down');
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
  parent.appendChild(b);
  return b;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
