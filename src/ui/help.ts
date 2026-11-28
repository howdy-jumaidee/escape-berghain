// The glass help box: a small frosted-glass panel, top left. Teaches the basics right after
// the intro lands, then keeps the mission and the five memories in view, quietly.
// All player-facing words come from content/story.json under `help`.
import { bus, state } from '../contracts';
import { t, list } from './text';

const TIP_MS = 6000;
const FLASH_MS = 4000;
const PULSE_MS = 3000;
const REMIND_AFTER_MS = 90000;
const STORE_KEY = 'eb-help-open';

/** The open/closed choice lives in localStorage. Private mode can throw, so wrap it. */
function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

function storeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORE_KEY, open ? '1' : '0');
  } catch {
    /* storage unavailable: the box just stays open for this session */
  }
}

export function startHelp(root: HTMLElement): void {
  const wrap = el('div', 'eb-help off', root);
  const panel = el('div', 'eb-help-panel', wrap);
  const label = el('div', 'eb-help-label', panel);
  const tip = el('p', 'eb-help-tip', panel);
  const mission = el('p', 'eb-help-mission', panel);
  const listEl = el('div', 'eb-help-list', panel);
  const hint = el('p', 'eb-help-hint', panel);
  const tab = el('div', 'eb-help-tab', wrap);
  tab.textContent = t('story:help.tab');

  const tips = list('story:help.tips');
  const hints = list('story:help.hints');
  const nexts = list('story:help.next');
  // Checklist rows in order; row i is fragment i + 1.
  const rows = list('story:help.memories').map((name) => {
    const row = el('div', 'eb-help-item', listEl);
    el('span', 'tick', row).textContent = '✓';
    el('span', '', row).textContent = name;
    return row;
  });

  let open = readStoredOpen();
  let tipsActive = false;
  let ended = false;
  let tipTimer = 0;
  let flashTimer = 0;
  let pulseTimer = 0;
  let lastFoundAt = 0;

  const allFound = () =>
    state.finale || state.fragments.length >= 5 || (rows.length > 0 && rows.every((r) => r.classList.contains('done')));

  /** The mission line is always the one next step: the first memory not ticked yet. */
  const paintMission = () => {
    if (allFound()) {
      mission.textContent = t('story:help.mission_done');
      return;
    }
    const next = rows.findIndex((r) => !r.classList.contains('done'));
    mission.textContent = nexts[next] ?? t('story:help.mission');
  };

  const setOpen = (v: boolean) => {
    open = v;
    wrap.classList.toggle('closed', !v);
    storeOpen(v);
  };
  setOpen(open);

  /** Tips done: switch the box to the standing mission view. */
  const toMission = () => {
    tipsActive = false;
    window.clearTimeout(tipTimer);
    wrap.classList.remove('tips');
    label.textContent = t('story:help.label_mission');
    paintMission();
    wrap.classList.remove('live');
  };

  bus.on('intro:land', () => {
    if (ended) return;
    wrap.classList.remove('off');
    lastFoundAt = performance.now();
    label.textContent = t('story:help.label');
    wrap.classList.add('tips', 'live');
    tipsActive = true;
    const showTip = (i: number): void => {
      if (ended) return;
      if (i >= tips.length) {
        toMission();
        return;
      }
      tip.textContent = tips[i];
      tipTimer = window.setTimeout(() => showTip(i + 1), TIP_MS);
    };
    showTip(0);
  });

  bus.on('fragment:found', ({ id }) => {
    lastFoundAt = performance.now();
    hint.classList.remove('on');
    rows[id - 1]?.classList.add('done');
    paintMission();
    wrap.classList.add('live');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      if (!tipsActive) wrap.classList.remove('live');
    }, FLASH_MS);
  });

  bus.on('game:finale', () => paintMission());

  bus.on('ending:show', () => {
    ended = true;
    wrap.classList.add('off');
    window.clearTimeout(tipTimer);
    window.clearTimeout(flashTimer);
    window.clearTimeout(pulseTimer);
  });

  // Reminder: nothing found for a while. Pulse the box and hint the next memory.
  window.setInterval(() => {
    if (ended || !open || tipsActive || state.ending || root.classList.contains('talking')) return;
    if (performance.now() - lastFoundAt < REMIND_AFTER_MS) return;
    const next = rows.findIndex((r) => !r.classList.contains('done'));
    if (next < 0) return;
    lastFoundAt = performance.now();
    hint.textContent = hints[next] ?? '';
    hint.classList.add('on');
    wrap.classList.add('live');
    window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => wrap.classList.remove('live'), PULSE_MS);
  }, 1000);

  // H toggles the box at any time.
  addEventListener('keydown', (e) => {
    if (e.repeat || e.code !== 'KeyH') return;
    setOpen(!open);
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
