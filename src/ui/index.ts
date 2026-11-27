// UI: title, intro, HUD, captions, dialogue, riddle, end cards and credits. Issues #17 (part) and #18.
// Every word comes from content/ through text.ts.
import { bus, state, TRIP_MAX, type EndingId } from '../contracts';
import { css } from './style';
import { t, list, lookup } from './text';

const INTRO_LINE_SECONDS = 2.2;

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
      hud.style.display = help.style.display = '';
      state.started = true;
      bus.emit('ui:say', { key: 'story:controls', seconds: 5 });
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') go();
  };
  cover.addEventListener('click', go);
  addEventListener('keydown', onKey);
}

function playIntro(cover: HTMLElement, done: () => void): void {
  const lines = list('story:intro');
  const text = el('div', 'eb-intro');
  const skip = el('div', 'eb-skip');
  skip.textContent = t('story:start.skip');
  cover.replaceChildren(text, skip);
  let i = 0;
  let timer = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    removeEventListener('keydown', onSkip);
    cover.removeEventListener('click', finish);
    done();
  };
  const next = () => {
    if (i >= lines.length) return finish();
    text.textContent = lines[i++];
    timer = window.setTimeout(next, INTRO_LINE_SECONDS * 1000);
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

function showEnd(end: HTMLElement, ending: EndingId): void {
  end.replaceChildren();
  const box = el('div', '', end);
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
