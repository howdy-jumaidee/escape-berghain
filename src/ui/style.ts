// UI styles, injected once. Minimal: no HUD. One typeface, Fragment Mono, like the poster.
// Text only appears when you touch something: an object, a clue, a special NPC.
const F = `${import.meta.env.BASE_URL}fonts/`;

export const css = /* css */ `
@font-face { font-family: "Fragment Mono"; src: url("${F}FragmentMono-Regular.ttf") format("truetype"); font-display: block; }

:root {
  --mono: "Fragment Mono", ui-monospace, Menlo, monospace;
  --ink: #000;
  --paper: #ececec;
  --dim: #8a8a8a;
  --alarm: #ff2a1a;
}
.eb-ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--mono); color: var(--paper); }
.eb-ui * { box-sizing: border-box; }

/* Captions: what you find, what the spirit guide says. */
.eb-say { position: absolute; left: 50%; bottom: 20%; z-index: 4; transform: translateX(-50%); max-width: min(640px, 88vw);
  text-align: center; font: 400 16px/1.5 var(--mono); color: var(--paper); text-shadow: 0 0 8px #000, 0 0 2px #000;
  opacity: 0; transition: opacity 0.4s; }
.eb-say.on { opacity: 1; }

/* View toggle reminder: quiet dim grey, bottom right. */
.eb-view-hint { position: absolute; right: 24px; bottom: 20px; font: 400 11px/1 var(--mono); color: #8a8a8a;
  opacity: 0; transition: opacity 2.2s ease; }
.eb-view-hint.on { opacity: 1; }

/* Dialogue: a name and a line, bottom left. */
.eb-talk { position: absolute; left: 32px; bottom: 32px; max-width: min(520px, 86vw); opacity: 0; transition: opacity 0.2s; text-shadow: 0 0 8px #000; }
.eb-talk.on { opacity: 1; }
.eb-talk b { display: block; font: 400 11px/1 var(--mono); letter-spacing: 0.2em; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; }
.eb-talk p { margin: 0; font: 400 16px/1.5 var(--mono); }
.eb-answers { margin-top: 14px; display: grid; gap: 4px; pointer-events: auto; }
.eb-answers button { all: unset; cursor: pointer; font: 400 15px/1.6 var(--mono); color: var(--paper); }
.eb-answers button:hover, .eb-answers button:focus-visible { color: #fff; text-decoration: underline; text-underline-offset: 4px; }
.eb-answers kbd { font: 400 13px var(--mono); color: var(--dim); margin-right: 14px; }

/* Face to face conversations: letterbox, centred dialogue, the NPC fills the frame. */
.eb-bar-top, .eb-bar-bottom { position: absolute; left: 0; right: 0; height: 11vh; background: #000; transition: transform 0.45s ease-out; }
.eb-bar-top { top: 0; transform: translateY(-100%); }
.eb-bar-bottom { bottom: 0; transform: translateY(100%); }
.eb-bar-top.focus, .eb-bar-bottom.focus { transform: none; }
.eb-talk.focus { left: 50%; bottom: 3vh; transform: translateX(-50%); width: min(720px, 90vw); text-align: center; z-index: 1; }
.eb-talk.focus p { font-size: 19px; }
.eb-talk.focus b { font-size: 12px; }
.eb-talk-hint { display: none; margin-top: 12px; font: 400 11px var(--mono); color: #6a6a6a; }
.eb-talk.focus .eb-talk-hint { display: block; }
.eb-talk.focus .eb-answers { justify-content: center; text-align: left; }

/* Title and intro: pitch black. */
.eb-cover { position: absolute; inset: 0; z-index: 10; background: #000; display: grid; place-items: center; text-align: center; pointer-events: auto; transition: opacity 0.9s; }
.eb-cover.off { opacity: 0; pointer-events: none; }
.eb-title { font: 400 clamp(32px, 6vw, 64px)/1.1 var(--mono); letter-spacing: 0.04em; } // ESCAPE BERGHAIN stays BIG
.eb-panel { min-height: 8.2em; margin-top: 24px; display: grid; place-items: center; }
.eb-goal { max-width: 36em; }
.eb-goal p { margin: 0 auto 8px; font: 400 clamp(13px, 1.5vw, 15px)/1.45 var(--mono); color: #e4e4e4; }
.eb-goal p:last-child { margin-bottom: 0; }
.eb-controls { display: grid; grid-template-columns: auto auto; justify-content: center; column-gap: 18px; row-gap: 10px;
  text-align: left; align-items: center; }
.eb-controls[hidden], .eb-goal[hidden] { display: none; }
.eb-controls kbd { justify-self: end; min-width: 2.4em; padding: 3px 8px; border: 1px solid #5a5a5a; border-radius: 3px;
  font: 400 13px/1.2 var(--mono); color: var(--paper); text-align: center; }
.eb-controls span { font: 400 15px/1.2 var(--mono); color: #d0d0d0; }
.eb-actions { display: flex; justify-content: center; align-items: center; gap: 14px; margin-top: 32px; }
.eb-actions button { all: unset; cursor: pointer; font: 400 14px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--paper); border: 1px solid #6a6a6a; padding: 14px 22px; }
.eb-actions button:hover, .eb-actions button:focus-visible { background: var(--paper); color: #000; outline: none; }
.eb-play { border-color: var(--paper); padding: 14px 42px; }
.eb-sub { margin-top: 22px; font: 400 12px/1.6 var(--mono); color: #9a9a9a; }
.eb-intro { font: 400 clamp(16px, 2.2vw, 24px)/1.4 var(--mono); color: #d8d8d8; max-width: 80vw; transition: opacity 0.25s; position: relative; }
.eb-swirl { position: absolute; inset: 0; width: 100%; height: 100%; }
.eb-skip { position: absolute; bottom: 20px; right: 24px; font: 400 11px var(--mono); color: #444; }

/* Clues. */
.eb-stamp { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); text-align: center; opacity: 0; transition: opacity 0.4s; text-shadow: 0 0 10px #000; }
.eb-stamp.on { opacity: 1; }
.eb-stamp b { font: 400 11px var(--mono); letter-spacing: 0.25em; color: var(--dim); }
.eb-stamp-num { font: 400 96px/1 var(--mono); }

/* Security: the screen edges go red while a torch is on you. No text. */
.eb-seen { position: absolute; inset: 0; opacity: 0; transition: opacity 0.15s; box-shadow: inset 0 0 140px 30px rgba(255, 42, 26, 0.55); }

.eb-van { position: absolute; inset: 0; background: #000; display: grid; place-items: center; text-align: center; opacity: 0; transition: opacity 0.35s; }
.eb-van.on { opacity: 1; }
.eb-van h2 { margin: 0 0 10px; font: 400 22px/1 var(--mono); letter-spacing: 0.15em; }
.eb-van p { margin: 4px; font: 400 15px/1.5 var(--mono); color: var(--dim); }

.eb-selfie { position: absolute; inset: 0; background: #fff; opacity: 0; }
.eb-selfie.on { opacity: 0.95; }
.eb-fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 0.6s; }
.eb-fade.on { opacity: 1; }

/* Endings. */
.eb-end { position: absolute; inset: 0; z-index: 10; background: rgba(0,0,0,0.94); display: grid; place-items: center; text-align: center; opacity: 0; transition: opacity 1.4s; pointer-events: none; }
.eb-end.on { opacity: 1; pointer-events: auto; }
.eb-end h1 { margin: 0; font: 400 clamp(36px, 7vw, 72px)/1 var(--mono); letter-spacing: 0.06em; }
.eb-end p { max-width: 520px; margin: 22px auto 0; font: 400 16px/1.6 var(--mono); color: #bdbdbd; }
.eb-credits { margin-top: 40px; font: 400 12px/2 var(--mono); color: var(--dim); }
.eb-retry { margin-top: 28px; font: 400 12px var(--mono); color: var(--paper); }
`;
