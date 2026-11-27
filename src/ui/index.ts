// UI: title, intro, HUD, captions, dialogue, riddle, end cards and credits. Issues #17 (part) and #18.
// Every word comes from content/ through text.ts.
import { bus, state, TRIP_MAX, type EndingId } from '../contracts';
import { css } from './style';
import { t, list, lookup } from './text';
import { playIntro } from './intro';
import { endArt } from './art';

const INTRO_LINE_SECONDS = 2.8;
const SHAKES_NEEDED = 12;

export function startUi(): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = el('div', 'eb-ui');
  document.body.appendChild(root);
  document.getElementById('hud')?.remove();

  // HUD.
  const hud = el('div', 'eb-hud', root);
  const trip = el('div', 'eb-trip', hud);
  el('span', '', trip).textContent = t('story:hud.trip');
  const tripBar = el('div', 'eb-trip-bar', trip);
  const tripFill = el('div', 'eb-trip-fill', tripBar);
  const mem = el('div', 'eb-mem', hud);
  el('span', '', mem).textContent = t('story:hud.memories');
  const gems = [1, 2, 3, 4, 5].map(() => el('i', '', mem));
  const help = el('div', 'eb-help', root);
  help.textContent = t('story:controls');
  hud.style.display = help.style.display = 'none';

  // Objective: the next thing to do, from the first fragment you're missing.
  const objective = el('div', 'eb-objective', root);
  objective.style.display = 'none';
  const updateObjective = () => {
    const next = ([1, 2, 3, 4, 5] as const).find((id) => !state.fragments.includes(id));
    objective.textContent = t(`story:objectives.${next ?? 'done'}`);
  };
  bus.on('fragment:found', () => setTimeout(updateObjective, 400));

  const setTrip = (v: number) => (tripFill.style.width = `${(v / TRIP_MAX) * 100}%`);
  setTrip(state.trip);
  bus.on('trip:changed', ({ trip }) => setTrip(trip));
  bus.on('fragment:found', () => state.fragments.forEach((id) => gems[id - 1]?.classList.add('on')));

  // Captions: the spirit guide and hints.
  const say = el('div', 'eb-say', root);
  let sayTimer = 0;
  bus.on('ui:say', ({ key, seconds = 3 }) => {
    say.textContent = t(key);
    say.classList.add('on');
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => say.classList.remove('on'), seconds * 1000);
  });

  // Dialogue box.
  const talk = el('div', 'eb-talk', root);
  const talkName = el('b', '', talk);
  const talkText = el('p', '', talk);
  const answers = el('div', 'eb-answers', talk);
  let talkTimer = 0;
  const hideTalk = () => {
    if (riddleOpen) return;
    talk.classList.remove('on');
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
  let riddleOpen = false;
  let riddleAnswers: { text: string; correct: boolean }[] = [];
  const answer = (i: number) => {
    const a = riddleAnswers[i];
    if (!riddleOpen || !a) return;
    riddleOpen = false;
    state.inputLocked = false;
    answers.replaceChildren();
    talk.classList.remove('on');
    bus.emit('riddle:answered', { correct: a.correct });
  };
  bus.on('riddle:show', () => {
    clearTimeout(talkTimer);
    riddleOpen = true;
    state.inputLocked = true;
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

  // Pass out: a short fade to black.
  const fade = el('div', 'eb-fade', root);
  bus.on('trip:max', () => {
    fade.classList.add('on');
    setTimeout(() => fade.classList.remove('on'), 1200);
  });

  // Mirror: one second of human you.
  const flash = el('div', 'eb-flash', root);
  flash.innerHTML = `<svg viewBox="0 0 100 220" fill="rgba(200,240,255,0.55)"><circle cx="50" cy="28" r="20"/><rect x="28" y="54" width="44" height="80" rx="16"/><rect x="30" y="128" width="16" height="84" rx="7"/><rect x="54" y="128" width="16" height="84" rx="7"/><rect x="10" y="58" width="14" height="66" rx="7"/><rect x="76" y="58" width="14" height="66" rx="7"/></svg>`;
  bus.on('mirror:seen', () => {
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 1000);
  });

  // Fragment 2: a close up of the wrist stamp.
  const stamp = el('div', 'eb-stamp', root);
  el('b', '', stamp).textContent = t('story:stamp.label');
  el('div', 'eb-stamp-num', stamp).textContent = t('story:stamp.number');
  bus.on('fragment:found', ({ id }) => {
    if (id !== 2) return;
    stamp.classList.add('on');
    setTimeout(() => stamp.classList.remove('on'), 3200);
  });

  // The jacket: mash Space until the keys fall out.
  const jacket = el('div', 'eb-jacket', root);
  el('b', '', jacket).textContent = t('story:jacket.title');
  const jacketIcon = el('div', 'eb-jacket-icon', jacket);
  jacketIcon.innerHTML = `<svg viewBox="0 0 120 120" fill="#2a2a2e" stroke="#555" stroke-width="2"><path d="M30 20 L50 12 L60 26 L70 12 L90 20 L108 50 L94 58 L88 46 L88 110 L32 110 L32 46 L26 58 L12 50 Z"/><line x1="60" y1="26" x2="60" y2="110"/><rect x="40" y="70" width="14" height="10" fill="#3a3a40"/></svg>`;
  const jacketBar = el('div', 'eb-trip-bar', jacket);
  const jacketFill = el('div', 'eb-trip-fill', jacketBar);
  el('div', 'eb-jacket-hint', jacket).textContent = t('story:jacket.hint');
  let shaking = false;
  let shake = 0;
  let shakeRaf = 0;
  bus.on('jacket:start', () => {
    shaking = true;
    shake = 0;
    state.inputLocked = true;
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
    state.inputLocked = false;
    bus.emit('jacket:shaken', {});
  });

  // Security: the screen edges go red while a torch is on you.
  const seen = el('div', 'eb-seen', root);
  bus.on('player:seen', ({ amount }) => (seen.style.opacity = String(amount * 0.85)));

  // Caught: animal control, a van, back to the checkpoint.
  const van = el('div', 'eb-van', root);
  const vanBox = el('div', '', van);
  vanBox.innerHTML = `<svg viewBox="0 0 200 90" width="220"><rect x="10" y="20" width="130" height="50" fill="#ddd"/><path d="M140 34 L170 34 L188 52 L188 70 L140 70 Z" fill="#ddd"/><rect x="150" y="38" width="18" height="14" fill="#333"/><rect x="14" y="40" width="122" height="8" fill="#ff7a00"/><circle cx="45" cy="72" r="12" fill="#222"/><circle cx="158" cy="72" r="12" fill="#222"/><rect x="60" y="12" width="20" height="8" fill="#22a0ff"/></svg>`;
  el('h2', '', vanBox).textContent = t('story:caught.title');
  el('p', '', vanBox).textContent = t('story:caught.sub');
  const vanLine = el('p', 'eb-van-line', vanBox);
  bus.on('player:caught', () => {
    vanLine.textContent = `"${t('npcs:animal_control.lines.1')}"`;
    van.classList.add('on');
    setTimeout(() => van.classList.remove('on'), 3000);
  });

  // The tourists' flash.
  const selfie = el('div', 'eb-selfie', root);
  bus.on('selfie:flash', () => {
    selfie.classList.add('on');
    setTimeout(() => selfie.classList.remove('on'), 120);
  });

  // End card with credits on a cloakroom ticket.
  const end = el('div', 'eb-end', root);
  bus.on('ending:show', ({ ending }) => showEnd(end, ending));
  addEventListener('keydown', (e) => {
    if (state.ending && e.code === 'KeyR') location.reload();
  });

  // Title, then the intro.
  const cover = el('div', 'eb-cover', root);
  const box = el('div', '', cover);
  el('div', 'eb-title', box).textContent = t('story:title');
  el('div', 'eb-sub', box).textContent = t('story:start.sub');
  el('div', 'eb-go', box).textContent = t('story:start.button');

  const go = () => {
    removeEventListener('keydown', onKey);
    cover.removeEventListener('click', go);
    bus.emit('game:start', {});
    playIntro(cover, () => {
      cover.classList.add('off');
      hud.style.display = help.style.display = objective.style.display = '';
      state.started = true;
      bus.emit('intro:land', {});
      // The spirit guide takes over the rest of the intro, in game.
      const lines = list('story:intro');
      const keys = lines.slice(1).map((_, i) => `story:intro.${i + 1}`);
      keys.push('story:controls');
      keys.forEach((key, i) =>
        setTimeout(() => bus.emit('ui:say', { key, seconds: i === keys.length - 1 ? 5 : INTRO_LINE_SECONDS }), 700 + i * INTRO_LINE_SECONDS * 1000),
      );
      updateObjective();
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') go();
  };
  cover.addEventListener('click', go);
  addEventListener('keydown', onKey);
}

function showEnd(end: HTMLElement, ending: EndingId): void {
  end.replaceChildren();
  const box = el('div', '', end);
  const art = el('div', 'eb-art', box);
  art.innerHTML = endArt(ending);
  el('h1', '', box).textContent = t(`story:ending_titles.${ending}`);
  el('p', '', box).textContent = t(`story:endings.${ending}`);
  const ticket = el('div', 'eb-ticket', box);
  const head = el('div', 'eb-ticket-head', ticket);
  el('span', '', head).textContent = t('story:credits.heading');
  el('span', '', head).textContent = t('story:credits.ticket');
  const roll = el('div', 'eb-roll', ticket);
  for (const line of list('story:credits.lines')) el('div', '', roll).textContent = line;
  el('div', 'eb-retry', box).textContent = t('story:retry');
  end.classList.add('on');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
