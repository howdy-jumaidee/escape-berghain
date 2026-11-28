// The glass help box: a small frosted-glass panel, top left. Teaches the basics right after
// the intro lands, then keeps one next-memory hint and the five memories in view, quietly.
// All player-facing words come from content/story.json under `help`.
import { bus, state, type FragmentId } from '../contracts';
import { t, list } from './text';

const TIP_MS = 6000;
const FLASH_MS = 4000;
const PULSE_MS = 3000;
const REMIND_AFTER_MS = 90000;
const STORE_KEY = 'eb-help-open';

// Fragment Mono includes both (U+2713 CHECK MARK, U+25CB WHITE CIRCLE), so the list can use them directly.
const MARK_FOUND = '\u2713';
const MARK_OPEN = '\u25CB';

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
  const head = el('div', 'eb-help-head', panel);
  const label = el('div', 'eb-help-label', head);
  const count = el('div', 'eb-help-count', head);
  const tip = el('p', 'eb-help-tip', panel);
  const kicker = el('div', 'eb-help-kicker', panel);
  kicker.textContent = t('story:help.find_next');
  const mission = el('p', 'eb-help-mission', panel);
  const listEl = el('div', 'eb-help-list', panel);
  const tab = el('div', 'eb-help-tab', wrap);
  tab.textContent = t('story:help.tab');

  const tips = list('story:help.tips');
  const hints = list('story:help.hints');
  const foundTag = t('story:help.found');
  const recoveredWord = t('story:help.recovered');
  // Checklist rows in order; row i is fragment i + 1.
  const rows = list('story:help.memories').map((name) => {
    const row = el('div', 'eb-help-item', listEl);
    const mark = el('span', 'tick', row);
    const nameEl = el('span', 'name', row);
    nameEl.textContent = name;
    return { row, mark, nameEl, name };
  });
  const total = rows.length;

  let open = readStoredOpen();
  let tipsActive = false;
  let ended = false;
  let tipTimer = 0;
  let flashTimer = 0;
  let pulseTimer = 0;
  let lastFoundAt = 0;

  const allFound = () => state.finale || (total > 0 && state.fragments.length >= total);

  /** Header count, one hint for the first memory still missing, and a mark on every row. */
  const paint = () => {
    const found = new Set(state.fragments);
    let next = -1;
    rows.forEach((r, i) => {
      const isFound = found.has((i + 1) as FragmentId);
      r.row.classList.toggle('done', isFound);
      r.mark.textContent = isFound ? MARK_FOUND : MARK_OPEN;
      r.nameEl.textContent = isFound ? `${r.name} ${foundTag}` : r.name;
      if (!isFound && next < 0) next = i;
    });
    count.textContent = `${Math.min(state.fragments.length, total)} / ${total} ${recoveredWord}`;
    mission.textContent = next < 0 || allFound() ? t('story:help.mission_done') : (hints[next] ?? t('story:help.mission'));
  };

  const setOpen = (v: boolean) => {
    open = v;
    wrap.classList.toggle('closed', !v);
    storeOpen(v);
  };
  setOpen(open);
  paint();

  /** Tips done: switch the box to the standing mission view. */
  const toMission = () => {
    tipsActive = false;
    window.clearTimeout(tipTimer);
    wrap.classList.remove('tips');
    label.textContent = t('story:help.label_mission');
    paint();
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

  bus.on('fragment:found', () => {
    lastFoundAt = performance.now();
    paint();
    wrap.classList.add('live');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      if (!tipsActive) wrap.classList.remove('live');
    }, FLASH_MS);
  });

  bus.on('game:finale', () => paint());

  bus.on('ending:show', () => {
    ended = true;
    wrap.classList.add('off');
    window.clearTimeout(tipTimer);
    window.clearTimeout(flashTimer);
    window.clearTimeout(pulseTimer);
  });

  // Reminder: nothing found for a while. Pulse the box so the one FIND NEXT line gets another look.
  window.setInterval(() => {
    if (ended || !open || tipsActive || state.ending || root.classList.contains('talking')) return;
    if (performance.now() - lastFoundAt < REMIND_AFTER_MS) return;
    if (allFound()) return;
    lastFoundAt = performance.now();
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
