// UI: title, intro, captions, dialogue, riddle, clues, endings. Issues #17 and #18.
// Minimal: no HUD. The blur is your trip meter, the spirit guide's solidity is your memory.
// Text only appears when you touch something: an object, a clue, a special NPC. Every word comes from content/.
import { bus, state, lock, unlock, PASS_OUTS_TO_HERD, type EndingId, type NpcId } from '../contracts';
import { debug } from '../data';
import { css } from './style';
import { t, list, lookup } from './text';
import { playIntro } from './intro';
import { startHelp } from './help';

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
    const text = t(key);
    say.textContent = text;
    say.classList.add('on');
    clearTimeout(sayTimer);
    // Long captions need long enough to read at a glance (~15 chars/s), capped so nothing lingers.
    const secs = Math.min(9, Math.max(seconds, 2 + text.length / 15));
    sayTimer = window.setTimeout(() => say.classList.remove('on'), secs * 1000);
  });

  // Dialogue.
  const talk = el('div', 'eb-talk', root);
  const talkName = el('b', '', talk);
  const talkText = el('p', '', talk);
  const answers = el('div', 'eb-answers', talk);
  let talkTimer = 0;
  let riddleOpen = false;
  let choiceOpen = false;
  const hideTalk = () => {
    if (!riddleOpen && !choiceOpen) talk.classList.remove('on');
  };
  // Whenever a dialogue line is on screen, captions move to the top so the two never overlap.
  new MutationObserver(() => root.classList.toggle('talk-on', talk.classList.contains('on')))
    .observe(talk, { attributes: true, attributeFilter: ['class'] });
  const talkHint = el('div', 'eb-talk-hint', talk);
  talkHint.textContent = t('story:talk_hint');
  const chooseHint = el('div', 'eb-choose-hint', talk);
  chooseHint.textContent = t('story:talk_choose_hint');
  let focused = false;
  bus.on('npc:talk', ({ npc, lineId }) => {
    if (riddleOpen || choiceOpen) return;
    talkName.textContent = t(`npcs:${npc}.name`);
    talkText.textContent = t(lineId);
    answers.replaceChildren();
    talk.classList.remove('choosing');
    talk.classList.add('on');
    clearTimeout(talkTimer);
    // In a face to face conversation the line stays until you press Space.
    if (!focused) talkTimer = window.setTimeout(hideTalk, 4500);
  });
  bus.on('npc:silent', () => { root.classList.remove('talking'); hideTalk(); });

  // Face to face: letterbox bars slide in, the dialogue moves to the centre.
  const barTop = el('div', 'eb-bar-top', root);
  const barBottom = el('div', 'eb-bar-bottom', root);
  bus.on('npc:focus', () => {
    focused = true;
    clearTimeout(talkTimer);
    root.classList.add('talking');
    for (const e of [barTop, barBottom, talk]) e.classList.add('focus');
  });
  bus.on('npc:unfocus', () => {
    focused = false;
    root.classList.remove('talking');
    for (const e of [barTop, barBottom, talk]) e.classList.remove('focus');
  });

  // Riddle & talk-back choices: keys 1 to 3 or click.
  let riddleAnswers: { text: string; correct: boolean }[] = [];
  let activeChoices: { id: string; textKey: string; used?: boolean }[] = [];
  let selected = 0;
  /** When the answer list opened. The Space press that ended the NPC's line must not also pick an answer. */
  let listOpenedAt = 0;
  const rows = () => Array.from(answers.querySelectorAll('button'));
  const highlight = (i: number) => {
    const list = rows();
    if (!list.length) return;
    selected = (i + list.length) % list.length;
    list.forEach((b, j) => b.classList.toggle('sel', j === selected));
  };
  /** Build the answer rows. `used` rows are greyed, like topics you already asked about. */
  const fillAnswers = (items: { text: string; used?: boolean }[], pick: (i: number) => void) => {
    answers.replaceChildren(
      ...items.map((item, i) => {
        const b = el('button', item.used ? 'used' : '');
        b.type = 'button';
        el('kbd', '', b).textContent = String(i + 1);
        el('span', '', b).textContent = item.text;
        b.addEventListener('click', () => pick(i));
        // mousemove, not mouseenter: a list that opens under a resting cursor must not steal the highlight.
        b.addEventListener('mousemove', () => { if (selected !== i) highlight(i); });
        return b;
      }),
    );
    // Start on the first answer you haven't used yet.
    const fresh = items.findIndex((item) => !item.used);
    highlight(fresh < 0 ? 0 : fresh);
    listOpenedAt = performance.now();
    talk.classList.add('choosing');
  };
  let activeChoiceNpc: NpcId | '' = '';
  const resetConversationUi = () => {
    focused = false;
    root.classList.remove('talking');
    clearTimeout(talkTimer);
    answers.replaceChildren();
    talk.classList.remove('choosing');
    for (const e of [barTop, barBottom, talk]) e.classList.remove('focus');
    talk.classList.remove('on');
  };
  const closeRiddle = () => {
    if (!riddleOpen) return;
    riddleOpen = false;
    unlock('riddle');
    answers.replaceChildren();
    talk.classList.remove('choosing');
    talk.classList.remove('on');
    bus.emit('npc:unfocus', {});
  };
  const closeChoice = (unfocus: boolean) => {
    if (!choiceOpen) return;
    choiceOpen = false;
    activeChoices = [];
    activeChoiceNpc = '';
    unlock('choice');
    answers.replaceChildren();
    talk.classList.remove('choosing');
    if (unfocus) {
      talk.classList.remove('on');
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
    }
  };
  const answer = (i: number) => {
    const a = riddleAnswers[i];
    if (!riddleOpen || !a) return;
    riddleOpen = false;
    unlock('riddle');
    answers.replaceChildren();
    talk.classList.remove('choosing');
    talk.classList.remove('on');
    bus.emit('riddle:answered', { correct: a.correct });
  };
  const pickChoice = (i: number) => {
    const c = activeChoices[i];
    if (!choiceOpen || !c) return;
    const npc = activeChoiceNpc;
    choiceOpen = false;
    activeChoices = [];
    activeChoiceNpc = '';
    unlock('choice');
    answers.replaceChildren();
    talk.classList.remove('choosing');
    if (npc) bus.emit('npc:choice-picked', { npc, choiceId: c.id, index: i });
  };
  bus.on('riddle:show', () => {
    clearTimeout(talkTimer);
    closeChoice(false);
    riddleOpen = true;
    lock('riddle');
    riddleAnswers = (lookup('npcs:riddle_horse.riddle.answers') as typeof riddleAnswers | undefined) ?? [];
    talkName.textContent = t('npcs:riddle_horse.name');
    talkText.textContent = t('npcs:riddle_horse.riddle.question');
    fillAnswers(riddleAnswers, answer);
    talk.classList.add('on');
  });
  bus.on('npc:choices', (detail) => {
    if (state.ending || riddleOpen) {
      unlock('choice');
      return;
    }
    clearTimeout(talkTimer);
    choiceOpen = true;
    activeChoiceNpc = detail.npc;
    activeChoices = detail.choices ?? [];
    lock('choice');
    talkName.textContent = t(`npcs:${detail.npc}.name`);
    fillAnswers(activeChoices.map((c) => ({ text: t(c.textKey), used: c.used })), pickChoice);
    talk.classList.add('on');
  });
  /** Up/down (or W/S) move the highlight. Returns true for keys the answer list handled, incl. Enter. */
  const navigate = (e: KeyboardEvent): boolean => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') highlight(selected - 1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') highlight(selected + 1);
    else if (e.code === 'Space') {
      // Space skips NPC lines. Players mash it, so it must never pick an answer: swallow it here.
      e.preventDefault();
      return false;
    } else if (e.code !== 'Enter') return false;
    e.preventDefault();
    if (e.code === 'Enter' && performance.now() - listOpenedAt < 300) return false;
    return true;
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (riddleOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeRiddle();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        answer(Number(e.code.slice(5)) - 1);
      } else if (navigate(e)) {
        if (e.code === 'Enter') answer(selected);
      }
      return;
    }
    if (choiceOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeChoice(true);
      } else if (/^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        pickChoice(Number(e.code.slice(5)) - 1);
      } else if (navigate(e)) {
        if (e.code === 'Enter') pickChoice(selected);
      }
    }
  });

  // Glass help box: tips after landing, then the mission and the five memories.
  startHelp(root);

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

  // Interact prompt: a discreet glass keycap row, bottom centre. "Talk" for an optional NPC, "Grab" for a pickup.
  const prompt = el('div', 'eb-prompt', root);
  el('kbd', '', prompt).textContent = t('story:interact.key');
  const promptLabel = el('span', '', prompt);
  promptLabel.textContent = t('story:interact.grab');
  let npcTalk = false;
  let worldGrab = false;
  const hidePrompt = () => {
    npcTalk = false;
    worldGrab = false;
    prompt.classList.remove('on');
  };
  bus.on('player:near', ({ by, near, kind }) => {
    if (!state.started || state.ending) return hidePrompt();
    if (by === 'npc') npcTalk = near && kind === 'talk';
    else worldGrab = near && kind === 'grab';
    promptLabel.textContent = t(npcTalk ? 'story:interact.talk' : 'story:interact.grab');
    prompt.classList.toggle('on', npcTalk || worldGrab);
  });

  // Pass out: let the horse buckle & ragdoll on the floor before fading to black.
  // Keep it black on the 3rd pass-out while the herd ending fades in.
  const fade = el('div', 'eb-fade', root);
  let fadeDelayTimer = 0;
  let fadeTimer = 0;
  bus.on('trip:max', () => {
    if (state.ending) return;
    closeRiddle();
    closeChoice(false);
    resetConversationUi();
    hidePrompt();
    lock('fade');
    clearTimeout(fadeDelayTimer);
    clearTimeout(fadeTimer);
    const isHerdEnding = state.passOuts >= PASS_OUTS_TO_HERD;
    fadeDelayTimer = window.setTimeout(() => {
      fadeDelayTimer = 0;
      if (state.ending) return;
      fade.classList.add('on');
      if (isHerdEnding || state.passOuts >= PASS_OUTS_TO_HERD) return;
      fadeTimer = window.setTimeout(() => {
        fadeTimer = 0;
        fade.classList.remove('on');
        unlock('fade');
      }, 1200);
    }, 1050);
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

  // Caught: animal control. Wait while the horse ragdolls across the concrete before sliding in the van card.
  const van = el('div', 'eb-van', root);
  const vanBox = el('div', '', van);
  el('h2', '', vanBox).textContent = t('story:caught.title');
  el('p', '', vanBox).textContent = t('story:caught.sub');
  const vanLine = el('p', '', vanBox);
  let vanDelayTimer = 0;
  let vanTimer = 0;
  bus.on('player:caught', () => {
    if (state.ending) return;
    closeRiddle();
    closeChoice(false);
    resetConversationUi();
    hidePrompt();
    lock('van');
    clearTimeout(vanDelayTimer);
    clearTimeout(vanTimer);
    vanDelayTimer = window.setTimeout(() => {
      vanDelayTimer = 0;
      if (state.ending) return;
      vanLine.textContent = `"${t('npcs:animal_control.lines.1')}"`;
      van.classList.add('on');
      vanTimer = window.setTimeout(() => {
        vanTimer = 0;
        van.classList.remove('on');
        unlock('van');
      }, 2600);
    }, 1250);
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
    clearTimeout(vanDelayTimer);
    clearTimeout(vanTimer);
    clearTimeout(fadeDelayTimer);
    clearTimeout(fadeTimer);
    vanDelayTimer = 0;
    vanTimer = 0;
    fadeDelayTimer = 0;
    fadeTimer = 0;
    van.classList.remove('on');
    unlock('van');
    unlock('fade');
    closeRiddle();
    closeChoice(false);
    resetConversationUi();
    hidePrompt();
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
