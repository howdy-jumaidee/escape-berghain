// UI styles, injected once. Minimal: no HUD. One typeface, Fragment Mono, like the poster.
// Text only appears when you touch something: an object, a clue, a special NPC.
//
// Design system rules (follow these for any new UI text):
// 1. Spacing comes only from the --s-* scale (4 px base, 8 px rhythm). No one-off pixel values.
// 2. Type comes only from the --t-* scale. Nothing smaller than --t-xs (12 px).
// 3. Text colour is --text-1 (primary), --text-2 (secondary) or --text-3 (hints). All pass WCAG AA
//    (4.5:1) on black. Never go darker than --text-3 for anything the player must read.
// 4. Text over the 3D scene always gets --legible (shadow) or a dark backdrop. The world is blurred and
//    wobbling from the trip; the text never is. It's DOM on top of the post effects, so keep it that way.
// 5. Reading width: body text max --measure (62ch). Short goal lines stay on one line where they fit.
// 6. Line height: --lh-body for sentences, --lh-tight for display and labels.
// 7. CSS comments only (slash-star). A JS-style double-slash comment inside this string silently kills
//    the next rule: that's how the title spacing broke before.
const F = `${import.meta.env.BASE_URL}fonts/`;

export const css = /* css */ `
@font-face { font-family: "Fragment Mono"; src: url("${F}FragmentMono-Regular.ttf") format("truetype"); font-display: block; }

:root {
  --mono: "Fragment Mono", ui-monospace, Menlo, monospace;
  --ink: #000;
  --paper: #ececec;
  --alarm: #ff2a1a;

  /* Text colours, contrast on #000: 16.4:1, 11.1:1, 7.4:1. */
  --text-1: #ececec;
  --text-2: #c4c4c4;
  --text-3: #9a9a9a;
  --dim: var(--text-3);
  --line: rgba(255, 255, 255, 0.16);

  /* Spacing: 4 px base, 8 px rhythm. */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;

  /* Type scale. */
  --t-xs: 12px;
  --t-sm: 14px;
  --t-md: 16px;
  --t-lg: 19px;
  --t-xl: 24px;
  --t-display: clamp(44px, 8vw, 112px);
  --lh-tight: 1.1;
  --lh-body: 1.55;
  --track-label: 0.18em;
  --measure: 62ch;

  /* Text over the moving, blurred scene. */
  --legible: 0 0 2px #000, 0 0 8px #000, 0 0 18px rgba(0, 0, 0, 0.85);
  --scrim: rgba(0, 0, 0, 0.62);
}
.eb-ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--mono); color: var(--text-1);
  -webkit-font-smoothing: antialiased; }
.eb-ui * { box-sizing: border-box; }

/* Captions: what you find, what the spirit guide says. A soft scrim so they read over bright lights. */
.eb-say { position: absolute; left: 50%; bottom: 20%; z-index: 4; transform: translateX(-50%);
  max-width: min(var(--measure), calc(100vw - 2 * var(--s-4))); padding: var(--s-2) var(--s-4);
  background: var(--scrim); border-radius: 2px; text-align: center; text-wrap: balance;
  font: 400 var(--t-md)/var(--lh-body) var(--mono); color: var(--text-1); text-shadow: var(--legible);
  opacity: 0; transition: opacity 0.4s; }
.eb-say.on { opacity: 1; }
.eb-say:empty { display: none; }

/* View toggle reminder: quiet, bottom right, still readable. */
.eb-view-hint { position: absolute; right: var(--s-5); bottom: var(--s-5); font: 400 var(--t-xs)/var(--lh-tight) var(--mono);
  color: var(--text-3); text-shadow: var(--legible); opacity: 0; transition: opacity 2.2s ease; }
.eb-view-hint.on { opacity: 1; }

/* Interact prompt: a small frosted-glass keycap row, bottom centre. Fade in fast, out slow. */
.eb-prompt { position: absolute; left: 50%; bottom: var(--s-6); transform: translateX(-50%); display: flex; align-items: center; gap: var(--s-2);
  padding: var(--s-2) var(--s-3); border-radius: 6px; background: rgba(20, 20, 24, 0.38); border: 1px solid rgba(255, 255, 255, 0.14);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  opacity: 0; transition: opacity 0.25s ease-out; z-index: 4; }
.eb-prompt.on { opacity: 1; transition-duration: 0.15s; }
.eb-ui.talking .eb-prompt { display: none; }
.eb-prompt kbd { border: 1px solid var(--line); border-radius: 3px; padding: 2px 8px; font: 400 var(--t-xs)/1.4 var(--mono); color: var(--text-1); }
.eb-prompt span { font: 400 var(--t-sm)/var(--lh-tight) var(--mono); color: var(--text-2); }

/* Help box: one small, quiet frosted-glass panel, top left. Wide enough for "MEMORIES  1 / 5 recovered"
   on one line and for the glasses hint to break after "under the". All text stays at the 12 px minimum.
   Dim when idle, full when it has news. Off on the title (until intro:land), hidden in face to face talks and endings. */
.eb-help { position: absolute; left: var(--s-4); top: var(--s-4); width: 260px;
  max-width: calc(100vw - 2 * var(--s-4)); z-index: 3; }
.eb-help.off { display: none; }
.eb-ui.talking .eb-help { display: none; }
.eb-help-panel { background: rgba(20, 20, 24, 0.38); border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px; padding: var(--s-2) var(--s-3); opacity: 0.45; transition: opacity 0.6s;
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); }
.eb-help.live .eb-help-panel { opacity: 1; }
.eb-help.closed .eb-help-panel { display: none; }
.eb-help-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-2); margin-bottom: var(--s-2); }
.eb-help-label { font: 400 var(--t-xs)/var(--lh-tight) var(--mono);
  letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-3); text-shadow: var(--legible); }
.eb-help-count { font: 400 var(--t-xs)/var(--lh-tight) var(--mono); color: var(--text-3);
  text-shadow: var(--legible); white-space: nowrap; }
.eb-help-kicker { margin: 0 0 var(--s-1); font: 400 var(--t-xs)/var(--lh-tight) var(--mono);
  letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-3); text-shadow: var(--legible); }
.eb-help-tip, .eb-help-mission { margin: 0; font: 400 var(--t-xs)/1.4 var(--mono);
  color: var(--text-2); text-shadow: var(--legible); }
.eb-help-mission { margin-bottom: var(--s-2); color: var(--text-2); }
.eb-help-list { display: grid; gap: 0; }
.eb-help-item { display: flex; gap: var(--s-1); align-items: baseline; font: 400 var(--t-xs)/1.45 var(--mono);
  color: var(--text-2); text-shadow: var(--legible); }
.eb-help-item .tick { flex: none; width: 1ch; text-align: center; }
.eb-help-item.done { color: var(--text-1); }
.eb-help.tips .eb-help-kicker, .eb-help.tips .eb-help-mission, .eb-help.tips .eb-help-list, .eb-help.tips .eb-help-count { display: none; }
.eb-help:not(.tips) .eb-help-tip { display: none; }
/* Closed: only a tiny tab in the same corner. */
.eb-help-tab { display: none; padding: var(--s-1) var(--s-2); background: rgba(20, 20, 24, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 6px;
  font: 400 var(--t-xs)/var(--lh-tight) var(--mono); color: var(--text-3); text-shadow: var(--legible);
  opacity: 0.55; transition: opacity 0.6s;
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); }
.eb-help.closed .eb-help-tab { display: inline-block; }
.eb-help.live .eb-help-tab { opacity: 1; }

/* Dialogue in passing: a name and a line, bottom left. */
.eb-talk { position: absolute; left: var(--s-6); bottom: var(--s-6); max-width: min(520px, calc(100vw - 2 * var(--s-4)));
  opacity: 0; transition: opacity 0.2s; text-shadow: var(--legible); }
.eb-talk.on { opacity: 1; }
.eb-talk b { display: block; margin-bottom: var(--s-2); font: 400 var(--t-xs)/var(--lh-tight) var(--mono);
  letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-3); }
.eb-talk p { margin: 0; font: 400 var(--t-md)/var(--lh-body) var(--mono); text-wrap: pretty; }
.eb-answers { margin-top: var(--s-3); display: grid; gap: var(--s-1); pointer-events: auto; }
.eb-answers:empty { display: none; }
.eb-answers button { all: unset; cursor: pointer; display: flex; gap: var(--s-3); align-items: baseline;
  padding: var(--s-2) var(--s-3); border-left: 2px solid transparent;
  font: 400 var(--t-md)/var(--lh-body) var(--mono); color: var(--text-2); transition: background 0.12s, color 0.12s; }
.eb-answers button.sel { color: #fff; background: rgba(255, 255, 255, 0.1); border-left-color: var(--text-1); }
.eb-answers button.used { color: var(--text-3); }
.eb-answers button.used.sel { color: var(--text-2); }
.eb-answers kbd { font: 400 var(--t-xs)/var(--lh-body) var(--mono); color: var(--text-3); min-width: 1ch; }
.eb-choose-hint { display: none; margin-top: var(--s-3); font: 400 var(--t-xs)/var(--lh-body) var(--mono); color: var(--text-3); }

/* Face to face conversations: letterbox, the NPC fills the frame, dialogue on a dark panel at the bottom. */
.eb-bar-top, .eb-bar-bottom { position: absolute; left: 0; right: 0; height: 11vh; background: #000; transition: transform 0.45s ease-out; }
.eb-bar-top { top: 0; transform: translateY(-100%); }
.eb-bar-bottom { bottom: 0; transform: translateY(100%); }
.eb-bar-top.focus, .eb-bar-bottom.focus { transform: none; }
.eb-talk.focus { left: 0; right: 0; bottom: 0; transform: none; width: auto; max-width: none; z-index: 1; text-align: center;
  padding: var(--s-8) max(var(--s-4), calc(50vw - 360px)) var(--s-5); text-shadow: none;
  background: linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.86) 55%, rgba(0,0,0,0) 100%); }
/* While a dialogue line is up, ambient captions move to the top so they never sit on the talk box. */
.eb-ui.talk-on .eb-say { bottom: auto; top: var(--s-4); }
/* In a face to face conversation they sit just under the letterbox bar. While talking, they move to the top. */
.eb-ui.talking .eb-say { bottom: auto; top: 12vh; }
.eb-talk.focus b { margin-bottom: var(--s-3); }
.eb-talk.focus p { max-width: var(--measure); margin: 0 auto; font-size: var(--t-lg); line-height: var(--lh-body); text-wrap: balance; }
.eb-talk-hint { display: none; margin-top: var(--s-4); font: 400 var(--t-xs)/var(--lh-body) var(--mono); color: var(--text-3); }
.eb-talk.focus .eb-talk-hint { display: block; }
.eb-talk.focus.choosing .eb-talk-hint { display: none; }
.eb-talk.focus.choosing .eb-choose-hint { display: block; margin-top: var(--s-4); }
/* Skyrim/Oblivion style: the NPC's line on top, your answers in their own list under a rule. Never on top of each other. */
.eb-talk.focus .eb-answers { width: min(600px, 100%); margin: var(--s-5) auto 0; padding-top: var(--s-3); text-align: left;
  border-top: 1px solid var(--line); }

/* Title and intro: pitch black. Vertical rhythm: title, 48, goal, 48, actions, 24, sub. */
.eb-cover { position: absolute; inset: 0; z-index: 10; background: #000; display: grid; place-items: center; text-align: center;
  /* Extra top padding sits the centered block a touch lower than dead centre (shifts down by --s-6). */
  padding: calc(var(--s-5) + var(--s-8)) var(--s-4) var(--s-5); pointer-events: auto; transition: opacity 0.9s; }
.eb-cover.off { opacity: 0; pointer-events: none; }
.eb-title { font: 400 var(--t-display)/var(--lh-tight) var(--mono); letter-spacing: 0.05em; }
.eb-panel { min-height: 7.5em; margin-top: var(--s-7); display: grid; place-items: center; }
.eb-goal { max-width: min(100%, 80ch); display: grid; gap: var(--s-3); }
.eb-goal p { margin: 0; font: 400 clamp(var(--t-sm), 1.5vw, var(--t-md))/var(--lh-body) var(--mono); color: var(--text-1); }
/* Wide screens: every goal line is one straight line. Narrow screens: wrap, balanced. */
@media (min-width: 820px) { .eb-goal p { white-space: nowrap; } }
@media (max-width: 819px) { .eb-goal p { text-wrap: balance; } }

.eb-controls { display: grid; grid-template-columns: auto auto; justify-content: center; column-gap: var(--s-4); row-gap: var(--s-3);
  text-align: left; align-items: center; }
.eb-controls[hidden], .eb-goal[hidden] { display: none; }
.eb-controls kbd { justify-self: end; min-width: 2.4em; padding: var(--s-1) var(--s-2); border: 1px solid #6a6a6a; border-radius: 3px;
  font: 400 var(--t-sm)/var(--lh-tight) var(--mono); color: var(--text-1); text-align: center; }
.eb-controls span { font: 400 var(--t-md)/var(--lh-tight) var(--mono); color: var(--text-2); }
.eb-actions { display: flex; justify-content: center; align-items: center; gap: var(--s-4); margin-top: var(--s-7); }
.eb-actions button { all: unset; cursor: pointer; font: 400 var(--t-sm)/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--text-1); border: 1px solid #6a6a6a; padding: var(--s-4) var(--s-5); }
.eb-actions button:hover, .eb-actions button:focus-visible { background: var(--text-1); color: #000; outline: none; }
.eb-play { border-color: var(--text-1); padding: var(--s-4) var(--s-7); }
.eb-sub { margin-top: var(--s-5); font: 400 var(--t-xs)/var(--lh-body) var(--mono); color: var(--text-3); }
.eb-intro { font: 400 clamp(var(--t-md), 2.2vw, var(--t-xl))/1.6 var(--mono); color: var(--text-2); max-width: min(var(--measure), 80vw);
  text-wrap: balance; transition: opacity 0.25s; position: relative; }
.eb-swirl { position: absolute; inset: 0; width: 100%; height: 100%; }
.eb-skip { position: absolute; bottom: var(--s-5); right: var(--s-5); font: 400 var(--t-xs) var(--mono); color: var(--text-3); }

/* Clues. */
.eb-stamp { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); text-align: center; opacity: 0; transition: opacity 0.4s;
  text-shadow: var(--legible); }
.eb-stamp.on { opacity: 1; }
.eb-stamp b { font: 400 var(--t-xs) var(--mono); letter-spacing: 0.25em; color: var(--text-3); }
.eb-stamp-num { margin-top: var(--s-2); font: 400 96px/1 var(--mono); }

/* Security: the screen edges go red while a torch is on you. No text. */
.eb-seen { position: absolute; inset: 0; opacity: 0; transition: opacity 0.15s; box-shadow: inset 0 0 140px 30px rgba(255, 42, 26, 0.55); }

/* Full-screen story cards sit above the help box (z 3) and captions (z 4). */
.eb-van { position: absolute; inset: 0; z-index: 6; background: #000; display: grid; place-items: center; text-align: center; opacity: 0; transition: opacity 0.35s; }
.eb-van.on { opacity: 1; }
.eb-van h2 { margin: 0 0 var(--s-3); font: 400 var(--t-xl)/var(--lh-tight) var(--mono); letter-spacing: 0.15em; }
.eb-van p { margin: var(--s-1); font: 400 var(--t-md)/var(--lh-body) var(--mono); color: var(--text-2); }

.eb-selfie { position: absolute; inset: 0; background: #fff; opacity: 0; }
.eb-selfie.on { opacity: 0.95; }
/* Sits above the help box (z 3, earlier in DOM) while keeping blackout wake-up captions (z 4) readable. */
.eb-fade { position: absolute; inset: 0; z-index: 3; background: #000; opacity: 0; transition: opacity 0.6s; }
.eb-fade.on { opacity: 1; }

/* Endings. Rhythm: title, 24, text, 48, credits, 32, retry. */
.eb-end { position: absolute; inset: 0; z-index: 10; background: rgba(0,0,0,0.94); display: grid; place-items: center; text-align: center;
  padding: var(--s-5) var(--s-4); opacity: 0; transition: opacity 1.4s; pointer-events: none; }
.eb-end.on { opacity: 1; pointer-events: auto; }
.eb-end h1 { margin: 0; font: 400 clamp(36px, 7vw, 72px)/var(--lh-tight) var(--mono); letter-spacing: 0.06em; }
.eb-end p { max-width: min(var(--measure), 100%); margin: var(--s-5) auto 0; font: 400 var(--t-md)/var(--lh-body) var(--mono); color: var(--text-2);
  text-wrap: balance; }
.eb-credits { margin-top: var(--s-7); font: 400 var(--t-xs)/2 var(--mono); color: var(--text-3); }
.eb-retry { margin-top: var(--s-6); font: 400 var(--t-sm) var(--mono); color: var(--text-1); cursor: pointer; pointer-events: auto; }

/* Interactive targets for touch tapping. */
.eb-help-head, .eb-help-tab { pointer-events: auto; cursor: pointer; }
.eb-talk.focus { pointer-events: auto; }

/* Touch controls for phones in landscape: frosted glass matching the help box. */
.eb-ui.touch .eb-prompt, .eb-ui.touch .eb-view-hint { display: none; }
.eb-touch { position: fixed; inset: 0; z-index: 5; pointer-events: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.eb-touch.off { display: none; }
.eb-ui.talking .eb-stick, .eb-ui.talking .eb-pad, .eb-ui.talking .eb-top-tools { display: none; }
.eb-leave { display: none; position: absolute; top: max(var(--s-3), env(safe-area-inset-top));
  right: max(var(--s-4), env(safe-area-inset-right)); pointer-events: auto; }
.eb-ui.talking .eb-leave { display: inline-flex; }

.eb-stick { position: absolute; left: max(var(--s-5), env(safe-area-inset-left));
  bottom: max(var(--s-4), env(safe-area-inset-bottom));
  width: 112px; height: 112px; border-radius: 50%; pointer-events: auto; touch-action: none;
  display: grid; place-items: center;
  background: rgba(20, 20, 24, 0.36); border: 1px solid rgba(255, 255, 255, 0.16);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); }
.eb-stick.active { border-color: rgba(255, 255, 255, 0.38); }
.eb-stick-knob { width: 44px; height: 44px; border-radius: 50%; pointer-events: none;
  background: rgba(236, 236, 236, 0.22); border: 1px solid rgba(236, 236, 236, 0.55); }

.eb-pad { position: absolute; right: max(var(--s-5), env(safe-area-inset-right));
  bottom: max(var(--s-4), env(safe-area-inset-bottom));
  display: flex; align-items: flex-end; gap: var(--s-2); pointer-events: none; }
.eb-tbtn { all: unset; box-sizing: border-box; pointer-events: auto; touch-action: none; cursor: pointer;
  width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; text-align: center;
  background: rgba(20, 20, 24, 0.42); border: 1px solid rgba(255, 255, 255, 0.18);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  font: 400 var(--t-xs)/var(--lh-tight) var(--mono); color: var(--text-2); text-shadow: var(--legible);
  transition: transform 0.08s, border-color 0.15s, background 0.15s, color 0.15s; }
.eb-tbtn.primary { width: 68px; height: 68px; color: var(--text-1); border-color: rgba(255, 255, 255, 0.32); }
.eb-tbtn.hot { border-color: var(--text-1); background: rgba(236, 236, 236, 0.18); color: #fff; }
.eb-tbtn.down { transform: scale(0.92); background: rgba(236, 236, 236, 0.24); color: #fff; }

.eb-top-tools { position: absolute; top: max(var(--s-3), env(safe-area-inset-top));
  right: max(var(--s-4), env(safe-area-inset-right)); display: flex; gap: var(--s-2); pointer-events: none; }
.eb-tpill { all: unset; box-sizing: border-box; pointer-events: auto; touch-action: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  padding: var(--s-2) var(--s-3); border-radius: 6px;
  background: rgba(20, 20, 24, 0.42); border: 1px solid rgba(255, 255, 255, 0.16);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  font: 400 var(--t-xs)/var(--lh-tight) var(--mono); color: var(--text-2); text-shadow: var(--legible); }
.eb-tpill.active, .eb-tpill.down { border-color: var(--text-1); color: #fff; background: rgba(236, 236, 236, 0.18); }

/* Short landscape viewports (phones turned sideways): keep title, memories, dialogue and endings inside 375-430 px height. */
@media (max-height: 500px) {
  .eb-cover { padding: var(--s-3) max(var(--s-4), env(safe-area-inset-right)) var(--s-3) max(var(--s-4), env(safe-area-inset-left)); }
  .eb-title { font-size: clamp(28px, 6vw, 48px); }
  .eb-panel { min-height: 0; margin-top: var(--s-4); }
  .eb-goal { gap: var(--s-1); }
  .eb-goal p { font-size: var(--t-sm); }
  .eb-controls { row-gap: var(--s-1); }
  .eb-controls span { font-size: var(--t-sm); }
  .eb-actions { margin-top: var(--s-4); gap: var(--s-3); }
  .eb-actions button { padding: var(--s-3) var(--s-5); }
  .eb-play { padding: var(--s-3) var(--s-6); }
  .eb-sub { margin-top: var(--s-3); }
  .eb-help { left: max(var(--s-3), env(safe-area-inset-left)); top: max(var(--s-3), env(safe-area-inset-top)); width: 236px; }
  .eb-say { bottom: 26%; font-size: var(--t-sm); }
  .eb-bar-top, .eb-bar-bottom { height: 6vh; }
  .eb-talk.focus { padding: var(--s-5) max(var(--s-4), env(safe-area-inset-right)) var(--s-3) max(var(--s-4), env(safe-area-inset-left)); }
  .eb-talk.focus p { font-size: var(--t-md); }
  .eb-talk.focus .eb-answers { margin-top: var(--s-3); padding-top: var(--s-2); }
  .eb-answers button { padding: var(--s-1) var(--s-2); font-size: var(--t-sm); }
  .eb-talk-hint, .eb-talk.focus.choosing .eb-choose-hint { margin-top: var(--s-2); }
  .eb-end { padding: var(--s-3) var(--s-4); overflow-y: auto; }
  .eb-end h1 { font-size: clamp(28px, 6vw, 44px); }
  .eb-end p { margin-top: var(--s-3); font-size: var(--t-sm); }
  .eb-credits { margin-top: var(--s-4); line-height: 1.5; }
  .eb-retry { margin-top: var(--s-3); }
}
`;
