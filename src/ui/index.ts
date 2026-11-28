// UI: title, intro, captions, dialogue, riddle, clues, endings. Issues #17 and #18.
// Minimal: no HUD. The blur is your trip meter, the spirit guide's solidity is your memory.
// Text only appears when you touch something: an object, a clue, a special NPC. Every word comes from content/.
import { bus, state, lock, unlock, PASS_OUTS_TO_HERD, type EndingId } from '../contracts';
import { debug } from '../data';
import { css } from './style';
import { t, list, lookup } from './text';
import { playIntro } from './intro';

export function startUi(): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = el('div', 'eb-ui');
  document.body.appendChild(root);
  document.getElementById('hud')?.remove();

  // Captions.
  const say = el('div', 'eb-say', root);
  let sayTimer = 0;
  bus.on('ui:say', ({ key, seconds = 3 }) => {
    say.textContent = t(key);
    say.classList.add('on');
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => say.classList.remove('on'), seconds * 1000);
  });

  // Dialogue.
  const talk = el('div', 'eb-talk', root);
  const talkName = el('b', '', talk);
  const talkText = el('p', '', talk);
  const answers = el('div', 'eb-answers', talk);
  let talkTimer = 0;
  let riddleOpen = false;
  const hideTalk = () => {
    if (!riddleOpen) talk.classList.remove('on');
  };
  const talkHint = el('div', 'eb-talk-hint', talk);
  talkHint.textContent = t('story:talk_hint');
  let focused = false;
  bus.on('npc:talk', ({ npc, lineId }) => {
    if (riddleOpen) return;
    talkName.textContent = t(`npcs:${npc}.name`);
    talkText.textContent = t(lineId);
    answers.replaceChildren();
    talk.classList.add('on');
    clearTimeout(talkTimer);
    // In a face to face conversation the line stays until you press Space.
    if (!focused) talkTimer = window.setTimeout(hideTalk, 4500);
  });
  bus.on('npc:silent', hideTalk);

  // Face to face: letterbox bars slide in, the dialogue moves to the centre.
  const barTop = el('div', 'eb-bar-top', root);
  const barBottom = el('div', 'eb-bar-bottom', root);
  bus.on('npc:focus', () => {
    focused = true;
    clearTimeout(talkTimer);
    for (const e of [barTop, barBottom, talk]) e.classList.add('focus');
  });
  bus.on('npc:unfocus', () => {
    focused = false;
    for (const e of [barTop, barBottom, talk]) e.classList.remove('focus');
  });

  // Riddle: three answers, keys 1 to 3 or click.
  let riddleAnswers: { text: string; correct: boolean }[] = [];
  const closeRiddle = () => {
    if (!riddleOpen) return;
    riddleOpen = false;
    unlock('riddle');
    answers.replaceChildren();
    talk.classList.remove('on');
    bus.emit('npc:unfocus', {});
  };
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

  // View toggle hint: slowly fades in 2.8 s after landing, holds 9 s, then fades out (or immediately on V).
  const viewHint = el('div', 'eb-view-hint', root);
  viewHint.textContent = t('story:view_hint');
  let viewHintIn = 0;
  let viewHintOut = 0;
  let viewHintDismissed = false;
  const hideViewHint = () => {
    viewHintDismissed = true;
    clearTimeout(viewHintIn);
    clearTimeout(viewHintOut);
    viewHint.classList.remove('on');
  };
  bus.on('intro:land', () => {
    if (viewHintDismissed) return;
    viewHintIn = window.setTimeout(() => {
      if (viewHintDismissed || state.ending) return;
      viewHint.classList.add('on');
      viewHintOut = window.setTimeout(() => viewHint.classList.remove('on'), 9000);
    }, 2800);
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV' && state.started) hideViewHint();
  });

  // Pass out: a short fade to black. Keep it black on the 3rd pass-out while the herd ending fades in.
  const fade = el('div', 'eb-fade', root);
  let fadeTimer = 0;
  bus.on('trip:max', () => {
    closeRiddle();
    lock('fade');
    fade.classList.add('on');
    clearTimeout(fadeTimer);
    if (state.passOuts >= PASS_OUTS_TO_HERD) return;
    fadeTimer = window.setTimeout(() => {
      fade.classList.remove('on');
      unlock('fade');
    }, 1200);
  });

  // Fragment 2: the wrist stamp.
  const stamp = el('div', 'eb-stamp', root);
  el('b', '', stamp).textContent = t('story:stamp.label');
  el('div', 'eb-stamp-num', stamp).textContent = t('story:stamp.number');
  bus.on('fragment:found', ({ id }) => {
    if (id !== 2) return;
    stamp.classList.add('on');
    setTimeout(() => stamp.classList.remove('on'), 3200);
  });

  // Security: red edges while a torch is on you.
  const seen = el('div', 'eb-seen', root);
  bus.on('player:seen', ({ amount }) => (seen.style.opacity = String(amount * 0.9)));

  // Caught: animal control.
  const van = el('div', 'eb-van', root);
  const vanBox = el('div', '', van);
  el('h2', '', vanBox).textContent = t('story:caught.title');
  el('p', '', vanBox).textContent = t('story:caught.sub');
  const vanLine = el('p', '', vanBox);
  let vanTimer = 0;
  bus.on('player:caught', () => {
    closeRiddle();
    lock('van');
    vanLine.textContent = `"${t('npcs:animal_control.lines.1')}"`;
    van.classList.add('on');
    clearTimeout(vanTimer);
    vanTimer = window.setTimeout(() => {
      van.classList.remove('on');
      unlock('van');
    }, 3000);
  });

  // The tourists' flash.
  const selfie = el('div', 'eb-selfie', root);
  bus.on('selfie:flash', () => {
    selfie.classList.add('on');
    setTimeout(() => selfie.classList.remove('on'), 120);
  });

  // Endings.
  const end = el('div', 'eb-end', root);
  bus.on('ending:show', ({ ending }) => {
    closeRiddle();
    hideViewHint();
    showEnd(end, ending);
  });
  addEventListener('keydown', (e) => {
    if (state.ending && e.code === 'KeyR') location.reload();
  });

  // Title: pitch black. The goal is the first thing under the name. Controls are one toggle away.
  // Play is its own button. Enter or Space still starts, so the toggle can never trap you.
  const cover = el('div', 'eb-cover', root);
  const box = el('div', '', cover);
  el('div', 'eb-title', box).textContent = t('story:title');
  const panel = el('div', 'eb-panel', box);
  const goal = el('div', 'eb-goal', panel);
  for (const line of list('story:goal.lines')) el('p', '', goal).textContent = line;
  const controls = el('div', 'eb-controls', panel);
  controls.hidden = true;
  for (const pair of (lookup('story:controls') as [string, string][] | undefined) ?? []) {
    el('kbd', '', controls).textContent = pair[0];
    el('span', '', controls).textContent = pair[1];
  }
  const actions = el('div', 'eb-actions', box);
  const toggleBtn = el('button', 'eb-toggle', actions);
  toggleBtn.type = 'button';
  const playBtn = el('button', 'eb-play', actions);
  playBtn.type = 'button';
  playBtn.textContent = t('story:start.button');
  el('div', 'eb-sub', box).textContent = t('story:start.sub');

  let controlsOn = false;
  const paintToggle = () => {
    goal.hidden = controlsOn;
    controls.hidden = !controlsOn;
    toggleBtn.textContent = t(controlsOn ? 'story:title_ui.show_goal' : 'story:title_ui.show_controls');
  };
  paintToggle();
  const onToggle = (e?: Event) => {
    e?.preventDefault();
    e?.stopPropagation();
    controlsOn = !controlsOn;
    paintToggle();
  };

  const land = () => {
    cover.classList.add('off');
    state.started = true;
    bus.emit('intro:land', {});
  };
  let leaving = false;
  const go = () => {
    if (leaving) return;
    leaving = true;
    removeEventListener('keydown', onKey);
    toggleBtn.removeEventListener('click', onToggle);
    playBtn.removeEventListener('click', onPlay);
    bus.emit('game:start', {});
    playIntro(cover, land);
  };
  const onPlay = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    go();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    // C swaps goal and controls. It never starts the game.
    if (e.code === 'KeyC') {
      e.preventDefault();
      onToggle();
      return;
    }
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    // Space/Enter on the toggle presses that button. Don't also start.
    if (document.activeElement === toggleBtn) return;
    e.preventDefault();
    go();
  };
  if (debug.skip) {
    bus.emit('game:start', {});
    land();
  } else {
    toggleBtn.addEventListener('click', onToggle);
    playBtn.addEventListener('click', onPlay);
    addEventListener('keydown', onKey);
    playBtn.focus();
  }
}

function showEnd(end: HTMLElement, ending: EndingId): void {
  end.replaceChildren();
  const box = el('div', '', end);
  el('h1', '', box).textContent = t(`story:ending_titles.${ending}`);
  el('p', '', box).textContent = t(`story:endings.${ending}`);
  const credits = el('div', 'eb-credits', box);
  for (const line of list('story:credits.lines')) el('div', '', credits).textContent = line;
  el('div', 'eb-retry', box).textContent = t('story:retry');
  end.classList.add('on');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
