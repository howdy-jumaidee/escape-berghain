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
.eb-say { position: absolute; left: 50%; bottom: 16%; transform: translateX(-50%); max-width: min(640px, 88vw);
  text-align: center; font: 400 16px/1.5 var(--mono); color: var(--paper); text-shadow: 0 0 8px #000, 0 0 2px #000;
  opacity: 0; transition: opacity 0.4s; }
.eb-say.on { opacity: 1; }

/* Dialogue: a name and a line, bottom left. */
.eb-talk { position: absolute; left: 32px; bottom: 32px; max-width: min(520px, 86vw); opacity: 0; transition: opacity 0.2s; text-shadow: 0 0 8px #000; }
.eb-talk.on { opacity: 1; }
.eb-talk b { display: block; font: 400 11px/1 var(--mono); letter-spacing: 0.2em; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; }
.eb-talk p { margin: 0; font: 400 16px/1.5 var(--mono); }
.eb-answers { margin-top: 14px; display: grid; gap: 4px; pointer-events: auto; }
.eb-answers button { all: unset; cursor: pointer; font: 400 15px/1.6 var(--mono); color: var(--paper); }
.eb-answers button:hover, .eb-answers button:focus-visible { color: #fff; text-decoration: underline; text-underline-offset: 4px; }
.eb-answers kbd { font: 400 13px var(--mono); color: var(--dim); margin-right: 14px; }

/* Title and intro: pitch black. */
.eb-cover { position: absolute; inset: 0; background: #000; display: grid; place-items: center; text-align: center; pointer-events: auto; transition: opacity 0.9s; }
.eb-cover.off { opacity: 0; pointer-events: none; }
.eb-title { font: 400 clamp(28px, 5vw, 56px)/1.1 var(--mono); letter-spacing: 0.04em; }
.eb-sub, .eb-controls { margin-top: 18px; font: 400 12px/1.8 var(--mono); color: var(--dim); }
.eb-controls { max-width: 460px; margin-left: auto; margin-right: auto; }
.eb-go { margin-top: 40px; display: inline-block; font: 400 14px/1 var(--mono); color: var(--paper); border-bottom: 1px solid var(--paper); padding-bottom: 6px; }
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
.eb-end { position: absolute; inset: 0; background: rgba(0,0,0,0.94); display: grid; place-items: center; text-align: center; opacity: 0; transition: opacity 1.4s; pointer-events: none; }
.eb-end.on { opacity: 1; pointer-events: auto; }
.eb-end h1 { margin: 0; font: 400 clamp(36px, 7vw, 72px)/1 var(--mono); letter-spacing: 0.06em; }
.eb-end p { max-width: 520px; margin: 22px auto 0; font: 400 16px/1.6 var(--mono); color: #bdbdbd; }
.eb-credits { margin-top: 40px; font: 400 12px/2 var(--mono); color: var(--dim); }
.eb-retry { margin-top: 28px; font: 400 12px var(--mono); color: var(--paper); }
`;
