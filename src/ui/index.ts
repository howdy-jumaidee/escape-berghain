// UI: title, intro, HUD, captions, dialogue, riddle, story cards, end flyers and credits. Issues #17 and #18.
// Every word comes from content/ through text.ts. Brutalist: see style.ts.
import { bus, state, lock, unlock, LUNCH, type EndingId } from '../contracts';
import { debug } from '../data';
import { css } from './style';
import { t, list, lookup } from './text';
import { playIntro } from './intro';
import { endArt } from './art';

const INTRO_LINE_SECONDS = 2.8;
const SHAKES_NEEDED = 12;
const FORGET_FROM = 85;

export function startUi(): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = el('div', 'eb-ui');
  document.body.appendChild(root);
  document.getElementById('hud')?.remove();

  // ---------- HUD ----------
  const hud = el('div', 'eb-hud', root);
  const trip = el('div', 'eb-trip slab', hud);
  const tripNum = el('div', 'eb-trip-num', trip);
  el('div', 'eb-trip-label', trip).textContent = t('story:hud.trip');
  const mem = el('div', 'eb-mem slab', hud);
  el('div', 'eb-mem-label', mem).textContent = t('story:hud.memories');
  const boxes = el('div', 'eb-mem-boxes', mem);
  const gems = [1, 2, 3, 4, 5].map(() => el('i', '', boxes));

  const clock = el('div', 'eb-clock slab', root);
  const clockTime = el('div', 'eb-clock-time', clock);
  el('div', 'eb-clock-label', clock).textContent = t('story:clock.lunch');
  const setClock = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    clockTime.textContent = `${t('story:clock.day')} ${pad(h)}:${pad(m % 60)}`;
    clock.classList.toggle('late', m >= LUNCH - 30);
  };
  setClock(state.minutes);
  bus.on('clock:tick', ({ minutes }) => setClock(minutes));

  const help = el('div', 'eb-help', root);
  help.textContent = t('story:controls');

  const setTrip = (v: number) => {
    tripNum.textContent = String(Math.round(v));
    trip.classList.toggle('hot', v >= 70);
  };
  setTrip(state.trip);
  bus.on('trip:changed', ({ trip: v }) => setTrip(v));
  bus.on('fragment:found', () => state.fragments.forEach((id) => gems[id - 1]?.classList.add('on')));

  // Objective tape: the next step of the story. Past trip 85 you start forgetting it.
  const objective = el('div', 'eb-objective', root);
  let objectiveText = '';
  const updateObjective = () => {
    const next = ([1, 2, 3, 4, 5] as const).find((id) => !state.fragments.includes(id));
    objectiveText = t(`story:objectives.${next ?? 'done'}`);
    objective.textContent = objectiveText;
    objective.classList.toggle('run', state.finale);
  };
  bus.on('fragment:found', () => setTimeout(updateObjective, 400));
  bus.on('game:finale', updateObjective);
  setInterval(() => {
    if (!objectiveText) return;
    const forget = Math.max(0, (state.trip - FORGET_FROM) / (100 - FORGET_FROM));
    objective.textContent = forget > 0 ? scramble(objectiveText, forget) : objectiveText;
  }, 250);

  for (const e of [hud, clock, help, objective]) e.style.display = 'none';

  // ---------- Captions: label tape ----------
  const say = el('div', 'eb-say', root);
  let sayTimer = 0;
  bus.on('ui:say', ({ key, seconds = 3 }) => {
    say.textContent = t(key);
    say.classList.add('on');
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => say.classList.remove('on'), seconds * 1000);
  });

  // ---------- Zone signs ----------
  const zone = el('div', 'eb-zone', root);
  let zoneTimer = 0;
  bus.on('zone:entered', ({ zone: z }) => {
    if (!state.started) return;
    zone.textContent = t(`story:zones.${z}`);
    zone.classList.add('on');
    clearTimeout(zoneTimer);
    zoneTimer = window.setTimeout(() => zone.classList.remove('on'), 2200);
  });

  // ---------- Dialogue: gaffer tape ----------
  const talk = el('div', 'eb-talk', root);
  const talkName = el('b', '', talk);
  const talkText = el('p', '', talk);
  const answers = el('div', 'eb-answers', talk);
  let talkTimer = 0;
  let riddleOpen = false;
  const hideTalk = () => {
    if (!riddleOpen) talk.classList.remove('on');
  };
  bus.on('npc:talk', ({ npc, lineId }) => {
    if (riddleOpen) return;
    talkName.textContent = t(`npcs:${npc}.name`);
    talkText.textContent = t(lineId);
    answers.replaceChildren();
    talk.classList.add('on');
    clearTimeout(talkTimer);
    talkTimer = window.setTimeout(hideTalk, 4500);
  });
  bus.on('npc:silent', hideTalk);

  // Riddle: three answers, keys 1 to 3 or click.
  let riddleAnswers: { text: string; correct: boolean }[] = [];
  const answer = (i: number) => {
    const a = riddleAnswers[i];
    if (!riddleOpen || !a) return;
    riddleOpen = false;
    unlock('riddle');
    answers.replaceChildren();
    talk.classList.remove('on');
    bus.emit('riddle:answered', { correct: a.correct });
  };
  bus.on('riddle:show', () => {
    clearTimeout(talkTimer);
    riddleOpen = true;
    lock('riddle');
    riddleAnswers = (lookup('npcs:riddle_horse.riddle.answers') as typeof riddleAnswers | undefined) ?? [];
    talkName.textContent = t('npcs:riddle_horse.name');
    talkText.textContent = t('npcs:riddle_horse.riddle.question');
    answers.replaceChildren(
      ...riddleAnswers.map((a, i) => {
        const b = el('button', '');
        el('kbd', '', b).textContent = String(i + 1);
        b.append(a.text);
        b.addEventListener('click', () => answer(i));
        return b;
      }),
    );
    talk.classList.add('on');
  });
  addEventListener('keydown', (e) => {
    if (riddleOpen && /^Digit[1-9]$/.test(e.code)) answer(Number(e.code.slice(5)) - 1);
  });

  // ---------- Story cards ----------
  const fade = el('div', 'eb-fade', root);
  bus.on('trip:max', () => {
    fade.classList.add('on');
    setTimeout(() => fade.classList.remove('on'), 1200);
  });

  const mirror = el('div', 'eb-flash', root);
  mirror.innerHTML = `<svg viewBox="0 0 100 220" fill="rgba(230,225,211,0.6)"><rect x="32" y="8" width="36" height="40"/><rect x="26" y="54" width="48" height="80"/><rect x="30" y="128" width="16" height="84"/><rect x="54" y="128" width="16" height="84"/><rect x="10" y="58" width="14" height="66"/><rect x="76" y="58" width="14" height="66"/></svg>`;
  bus.on('mirror:seen', () => {
    mirror.classList.add('on');
    setTimeout(() => mirror.classList.remove('on'), 1000);
  });

  const stamp = el('div', 'eb-stamp', root);
  el('b', '', stamp).textContent = t('story:stamp.label');
  el('div', 'eb-stamp-num', stamp).textContent = t('story:stamp.number');

  // The phone in the jacket: the reason to go home.
  const phone = el('div', 'eb-phone', root);
  const phoneHead = el('div', 'eb-phone-head', phone);
  el('span', '', phoneHead).textContent = t('story:phone.from');
  el('span', '', phoneHead).textContent = t('story:phone.time');
  el('p', '', phone).textContent = t('story:phone.text');

  bus.on('fragment:found', ({ id }) => {
    if (id === 2) {
      stamp.classList.add('on');
      setTimeout(() => stamp.classList.remove('on'), 3200);
    }
    if (id === 4) {
      setTimeout(() => phone.classList.add('on'), 1500);
      setTimeout(() => bus.emit('ui:say', { key: 'story:spirit_guide.phone', seconds: 4 }), 5000);
      setTimeout(() => phone.classList.remove('on'), 9000);
    }
  });

  // The jacket: mash Space until the keys fall out.
  const jacket = el('div', 'eb-jacket slab', root);
  el('b', '', jacket).textContent = t('story:jacket.title');
  const jacketIcon = el('div', 'eb-jacket-icon', jacket);
  jacketIcon.innerHTML = `<svg viewBox="0 0 120 120" fill="#2a2a2a" stroke="#e6e1d3" stroke-width="3"><path d="M30 20 L50 12 L60 26 L70 12 L90 20 L108 50 L94 58 L88 46 L88 110 L32 110 L32 46 L26 58 L12 50 Z"/><line x1="60" y1="26" x2="60" y2="110"/><rect x="40" y="70" width="14" height="10"/></svg>`;
  const jacketBar = el('div', 'eb-bar', jacket);
  const jacketFill = el('div', 'eb-bar-fill', jacketBar);
  el('div', 'eb-jacket-hint', jacket).textContent = t('story:jacket.hint');
  let shaking = false;
  let shake = 0;
  let shakeRaf = 0;
  bus.on('jacket:start', () => {
    shaking = true;
    shake = 0;
    lock('jacket');
    jacket.classList.add('on');
    let last = performance.now();
    const tick = (now: number) => {
      if (!shaking) return;
      shake = Math.max(0, shake - ((now - last) / 1000) * 0.07);
      last = now;
      jacketFill.style.width = `${shake * 100}%`;
      shakeRaf = requestAnimationFrame(tick);
    };
    shakeRaf = requestAnimationFrame(tick);
  });
  addEventListener('keydown', (e) => {
    if (!shaking || e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    shake += 1 / SHAKES_NEEDED;
    jacketIcon.classList.remove('jolt');
    void jacketIcon.offsetWidth;
    jacketIcon.classList.add('jolt');
    if (shake < 1) return;
    shaking = false;
    cancelAnimationFrame(shakeRaf);
    jacket.classList.remove('on');
    unlock('jacket');
    bus.emit('jacket:shaken', {});
  });

  // Security: the screen edges go red while a torch is on you.
  const seen = el('div', 'eb-seen', root);
  bus.on('player:seen', ({ amount }) => (seen.style.opacity = String(amount * 0.9)));

  // Caught: animal control, a van, back to the checkpoint.
  const van = el('div', 'eb-van', root);
  const vanBox = el('div', '', van);
  vanBox.innerHTML = `<svg viewBox="0 0 200 90" width="220"><rect x="10" y="20" width="130" height="50" fill="#ddd"/><path d="M140 34 L170 34 L188 52 L188 70 L140 70 Z" fill="#ddd"/><rect x="150" y="38" width="18" height="14" fill="#333"/><rect x="14" y="40" width="122" height="8" fill="#ff7a00"/><rect x="33" y="60" width="24" height="24" fill="#222"/><rect x="146" y="60" width="24" height="24" fill="#222"/><rect x="60" y="12" width="20" height="8" fill="#22a0ff"/></svg>`;
  el('h2', '', vanBox).textContent = t('story:caught.title');
  el('p', '', vanBox).textContent = t('story:caught.sub');
  const vanLine = el('p', 'eb-van-line', vanBox);
  bus.on('player:caught', () => {
    vanLine.textContent = `"${t('npcs:animal_control.lines.1')}"`;
    van.classList.add('on');
    setTimeout(() => van.classList.remove('on'), 3000);
  });

  const selfie = el('div', 'eb-selfie', root);
  bus.on('selfie:flash', () => {
    selfie.classList.add('on');
    setTimeout(() => selfie.classList.remove('on'), 120);
  });

  // Closing time.
  const closing = el('div', 'eb-closing', root);
  el('span', '', closing).textContent = t('story:finale.sign');
  bus.on('game:finale', () => closing.classList.add('on'));

  // ---------- End flyer ----------
  const end = el('div', 'eb-end', root);
  bus.on('ending:show', ({ ending }) => showEnd(end, ending));
  addEventListener('keydown', (e) => {
    if (state.ending && e.code === 'KeyR') location.reload();
  });

  // ---------- Title, then the intro ----------
  const cover = el('div', 'eb-cover', root);
  const box = el('div', '', cover);
  const title = el('div', 'eb-title', box);
  for (const word of t('story:title').split(' ')) el('div', '', title).textContent = word;
  el('div', 'eb-sub', box).textContent = t('story:start.sub');
  el('div', 'eb-go', box).textContent = t('story:start.button');

  const land = () => {
    cover.classList.add('off');
    for (const e of [hud, clock, help, objective]) e.style.display = '';
    state.started = true;
    bus.emit('intro:land', {});
    // The spirit guide says the rest of the intro, in game.
    const keys = list('story:intro')
      .slice(1)
      .map((_, i) => `story:intro.${i + 1}`);
    keys.push('story:controls');
    keys.forEach((key, i) =>
      setTimeout(() => bus.emit('ui:say', { key, seconds: i === keys.length - 1 ? 5 : INTRO_LINE_SECONDS }), 700 + i * INTRO_LINE_SECONDS * 1000),
    );
    bus.emit('zone:entered', { zone: state.zone });
    setTimeout(updateObjective, 50);
  };
  const go = () => {
    removeEventListener('keydown', onKey);
    cover.removeEventListener('click', go);
    bus.emit('game:start', {});
    cover.classList.add('dark');
    playIntro(cover, land);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') go();
  };
  if (debug.skip) {
    bus.emit('game:start', {});
    land();
  } else {
    cover.addEventListener('click', go);
    addEventListener('keydown', onKey);
  }
}

function showEnd(end: HTMLElement, ending: EndingId): void {
  // Home, but after Mum's lunch: a different title and line.
  const late = ending === 'full_memory' && state.minutes > LUNCH;
  const key = late ? 'full_memory_late' : ending;
  end.replaceChildren();
  const flyer = el('div', 'eb-flyer', end);
  const art = el('div', 'eb-art', flyer);
  art.innerHTML = endArt(ending);
  el('h1', '', flyer).textContent = t(`story:ending_titles.${key}`);
  el('p', '', flyer).textContent = t(`story:endings.${key}`);
  const ticket = el('div', 'eb-ticket', flyer);
  const head = el('div', 'eb-ticket-head', ticket);
  el('span', '', head).textContent = t('story:credits.heading');
  el('span', '', head).textContent = t('story:credits.ticket');
  const roll = el('div', 'eb-roll', ticket);
  for (const line of list('story:credits.lines')) el('div', '', roll).textContent = line;
  el('div', 'eb-retry', flyer).textContent = t('story:retry');
  end.classList.add('on');
}

/** Replace a share of the letters with noise, so the objective fades out of memory. */
function scramble(text: string, amount: number): string {
  return [...text].map((ch) => (ch !== ' ' && Math.random() < amount * 0.8 ? '▒░▓#'[Math.floor(Math.random() * 4)] : ch)).join('');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
