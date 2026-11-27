// UI styles, injected once. Brutalist, like the building: raw concrete slabs, hard edges, no rounded corners,
// no glow except the green exit sign. Captions are label-maker tape, dialogue is gaffer tape, end cards are torn flyers.
// The intro tunnel is the one place that stays neon: that's the trip, not the building.
const F = `${import.meta.env.BASE_URL}fonts/`;

export const css = /* css */ `
@font-face { font-family: "Big Shoulders"; src: url("${F}BigShouldersDisplay-wght.ttf") format("truetype"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Saira Stencil"; src: url("${F}SairaStencilOne-Regular.ttf") format("truetype"); font-display: block; }
@font-face { font-family: "Space Mono"; src: url("${F}SpaceMono-Regular.ttf") format("truetype"); font-weight: 400; font-display: block; }
@font-face { font-family: "Space Mono"; src: url("${F}SpaceMono-Bold.ttf") format("truetype"); font-weight: 700; font-display: block; }
@font-face { font-family: "Fragment Mono"; src: url("${F}FragmentMono-Regular.ttf") format("truetype"); font-display: block; }

:root {
  --concrete: #8c8a84;
  --concrete-dark: #3d3c39;
  --ink: #0a0a0a;
  --paper: #e6e1d3;
  --exit: #22ff66;
  --alarm: #ff2a1a;
  --display: "Big Shoulders", "Arial Narrow", Impact, sans-serif;
  --stencil: "Saira Stencil", "Big Shoulders", Impact, sans-serif;
  --label: "Space Mono", ui-monospace, Menlo, monospace;
  --mono: "Fragment Mono", "Space Mono", ui-monospace, Menlo, monospace;
}
.eb-ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--mono); color: var(--paper); }
.eb-ui * { box-sizing: border-box; border-radius: 0; }

/* Concrete slab with board marks. */
.slab {
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 22px),
    linear-gradient(180deg, #1b1b1a, #121211);
  border: 2px solid #2c2c2a;
}

/* ---------- HUD ---------- */
.eb-hud { position: absolute; left: 0; top: 0; display: flex; align-items: stretch; }
.eb-trip { padding: 10px 16px 8px; display: flex; gap: 12px; align-items: flex-end; }
.eb-trip-label, .eb-mem-label, .eb-clock-label { font: 700 10px/1 var(--label); letter-spacing: 0.22em; color: #8a8780; text-transform: uppercase; }
.eb-trip-num { font: 900 54px/0.82 var(--display); color: var(--paper); font-variant-numeric: tabular-nums; min-width: 2ch; }
.eb-trip.hot .eb-trip-num { color: var(--alarm); }
.eb-mem { padding: 10px 16px; display: flex; flex-direction: column; justify-content: space-between; border-left: 0; }
.eb-mem-boxes { display: flex; gap: 5px; margin-top: 8px; }
.eb-mem-boxes i { width: 16px; height: 16px; border: 2px solid #55534e; display: block; }
.eb-mem-boxes i.on { background: var(--paper); border-color: var(--paper); }

.eb-clock { position: absolute; right: 0; top: 0; padding: 10px 16px 8px; text-align: right; }
.eb-clock-time { font: 900 54px/0.82 var(--display); color: var(--paper); font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.eb-clock.late .eb-clock-time { color: var(--alarm); }
.eb-clock-label { margin-top: 6px; }

.eb-objective { position: absolute; left: 0; top: 76px; max-width: min(560px, 70vw); padding: 7px 14px 7px 12px;
  background: var(--paper); color: var(--ink); font: 700 13px/1.35 var(--label); text-transform: uppercase; letter-spacing: 0.04em; }
.eb-objective.run { background: var(--alarm); color: #fff; font-size: 18px; }

.eb-help { position: absolute; right: 16px; bottom: 12px; font: 10px/1.4 var(--label); color: #6a6862; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; max-width: 40vw; }

/* ---------- Captions: label-maker tape ---------- */
.eb-say { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%) rotate(-1deg); max-width: min(760px, 90vw);
  padding: 8px 16px; background: #111; color: #f2f2f2; text-align: center;
  font: 700 17px/1.35 var(--label); text-transform: uppercase; letter-spacing: 0.08em;
  text-shadow: 0 1px 0 #000, 0 -1px 0 rgba(255,255,255,0.25);
  box-shadow: 0 2px 0 #000; opacity: 0; transition: opacity 0.25s; }
.eb-say.on { opacity: 1; }

/* ---------- Dialogue: gaffer tape ---------- */
.eb-talk { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%) rotate(0.6deg); width: min(680px, 94vw);
  padding: 14px 26px 16px; color: #ecebe6;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 5px), #2b2b2d;
  clip-path: polygon(0 6%, 2% 0, 4% 8%, 6% 1%, 94% 0, 96% 7%, 98% 1%, 100% 5%, 100% 95%, 98% 100%, 96% 93%, 94% 100%, 6% 99%, 4% 92%, 2% 100%, 0 94%);
  opacity: 0; transition: opacity 0.15s; }
.eb-talk.on { opacity: 1; }
.eb-talk b { display: block; font: 400 22px/1 var(--stencil); letter-spacing: 0.06em; color: var(--paper); margin-bottom: 8px; text-transform: uppercase; }
.eb-talk p { margin: 0; font: 400 17px/1.45 var(--mono); }
.eb-answers { margin-top: 12px; display: grid; gap: 6px; pointer-events: auto; }
.eb-answers button { all: unset; cursor: pointer; padding: 8px 12px; background: var(--paper); color: var(--ink); font: 700 15px/1.2 var(--label); text-transform: uppercase; }
.eb-answers button:hover, .eb-answers button:focus-visible { background: var(--exit); }
.eb-answers kbd { font: 700 12px var(--label); margin-right: 12px; padding: 1px 6px; background: var(--ink); color: var(--paper); }

/* ---------- Zone sign: stencil sprayed on the wall ---------- */
.eb-zone { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); white-space: nowrap;
  font: 400 clamp(40px, 8vw, 104px)/1 var(--stencil); letter-spacing: 0.08em; color: rgba(230, 225, 211, 0.85);
  opacity: 0; transition: opacity 0.5s; mix-blend-mode: screen; }
.eb-zone.on { opacity: 1; }

/* ---------- Title ---------- */
.eb-cover { position: absolute; inset: 0; display: grid; place-items: center; text-align: left; pointer-events: auto; transition: opacity 0.8s;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 34px),
    repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 140px),
    radial-gradient(ellipse at 30% 20%, #9a978f, #5f5d58 70%, #3a3936); }
.eb-cover.off { opacity: 0; pointer-events: none; }
.eb-cover.dark { background: #000; text-align: center; }
.eb-title { font: 900 clamp(64px, 15vw, 210px)/0.78 var(--display); letter-spacing: -0.02em; color: var(--ink); text-transform: uppercase; }
.eb-sub { margin-top: 22px; font: 700 13px/1.6 var(--label); letter-spacing: 0.2em; color: var(--ink); text-transform: uppercase; }
.eb-go { margin-top: 30px; display: inline-block; padding: 16px 30px; background: var(--ink); color: var(--paper);
  font: 700 15px/1 var(--label); letter-spacing: 0.25em; text-transform: uppercase; }
.eb-go::after { content: " \\2192"; color: var(--exit); }
.eb-intro { font: 900 clamp(28px, 5vw, 64px)/1.1 var(--display); color: #d8d8d8; max-width: 80vw; text-transform: uppercase; transition: opacity 0.4s; position: relative; }
.eb-skip { position: absolute; bottom: 20px; right: 20px; font: 700 11px var(--label); color: #555; letter-spacing: 0.15em; text-transform: uppercase; }

/* Intro tunnel: the one neon thing. */
.eb-tunnel { position: absolute; inset: 0; opacity: 0; transition: opacity 0.3s; }
.eb-tunnel canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.eb-morph { position: absolute; left: 50%; top: 50%; width: 22vh; color: #e8f6ff; transform: translate(-50%, -50%); filter: drop-shadow(0 0 18px #9fe8ff); }
.eb-morph svg { width: 100%; height: auto; fill: currentColor; }
.eb-horse { opacity: 0; width: 34vh; }
.eb-intro-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.eb-intro-flash.on { animation: eb-flash 0.7s ease-out; }
@keyframes eb-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

/* ---------- Story cards ---------- */
.eb-stamp { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0.92); padding: 22px 46px 16px; background: #b89470;
  text-align: center; color: #2a1406; opacity: 0; transition: opacity 0.3s, transform 0.3s; }
.eb-stamp.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.eb-stamp b { font: 700 11px var(--label); letter-spacing: 0.3em; }
.eb-stamp-num { font: 400 110px/1 var(--stencil); color: #4b1aa0; transform: rotate(-8deg); opacity: 0.85; filter: blur(0.5px); }

.eb-phone { position: absolute; right: 22px; top: 96px; width: 300px; padding: 0; background: #0d0d0d; border: 2px solid #3a3a38;
  opacity: 0; transform: translateX(30px); transition: opacity 0.3s, transform 0.3s; }
.eb-phone.on { opacity: 1; transform: none; }
.eb-phone-head { display: flex; justify-content: space-between; padding: 8px 12px; background: var(--paper); color: var(--ink); font: 700 12px var(--label); letter-spacing: 0.15em; }
.eb-phone p { margin: 0; padding: 14px 12px 16px; font: 400 16px/1.4 var(--mono); color: #eee; }

.eb-jacket { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); width: 300px; padding: 18px 20px; text-align: center; opacity: 0; transition: opacity 0.2s; }
.eb-jacket.on { opacity: 1; }
.eb-jacket b { font: 400 24px var(--stencil); letter-spacing: 0.06em; color: var(--paper); }
.eb-jacket-icon { width: 110px; margin: 12px auto; }
.eb-jacket-icon.jolt { animation: eb-jolt 0.15s; }
@keyframes eb-jolt { 30% { transform: rotate(-12deg) translateY(-6px); } 70% { transform: rotate(10deg); } }
.eb-bar { width: 100%; height: 14px; border: 2px solid var(--paper); }
.eb-bar-fill { height: 100%; width: 0; background: var(--paper); }
.eb-jacket-hint { margin-top: 10px; font: 700 12px var(--label); color: #9a978f; letter-spacing: 0.15em; text-transform: uppercase; }

.eb-seen { position: absolute; inset: 0; opacity: 0; transition: opacity 0.15s; box-shadow: inset 0 0 0 14px var(--alarm), inset 0 0 140px 30px rgba(255, 42, 26, 0.5); }

.eb-van { position: absolute; inset: 0; background: #000; display: grid; place-items: center; text-align: center; opacity: 0; transition: opacity 0.35s; }
.eb-van.on { opacity: 1; }
.eb-van svg { animation: eb-drive 3s linear; }
@keyframes eb-drive { from { transform: translateX(-40vw); } to { transform: translateX(40vw); } }
.eb-van h2 { margin: 18px 0 6px; font: 400 64px/1 var(--stencil); color: #ff7a00; letter-spacing: 0.04em; }
.eb-van p { margin: 4px; color: #aaa; font: 400 16px var(--mono); }
.eb-van-line { color: #ddd !important; }

.eb-selfie { position: absolute; inset: 0; background: #fff; opacity: 0; }
.eb-selfie.on { opacity: 0.95; }
.eb-fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 0.6s; }
.eb-fade.on { opacity: 1; }
.eb-flash { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; transition: opacity 0.15s; }
.eb-flash.on { opacity: 1; }
.eb-flash svg { height: 60vh; }

/* Closing time. */
.eb-closing { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; opacity: 0; }
.eb-closing.on { animation: eb-closing 3.2s steps(1) forwards; }
.eb-closing span { font: 400 clamp(64px, 14vw, 200px)/0.9 var(--stencil); color: var(--alarm); letter-spacing: 0.04em; text-align: center; }
@keyframes eb-closing { 0%, 20%, 40%, 60% { opacity: 1; } 10%, 30%, 50% { opacity: 0; } 85% { opacity: 1; } 100% { opacity: 0; } }

/* ---------- End: half-torn flyer ---------- */
.eb-end { position: absolute; inset: 0; background: rgba(0,0,0,0.9); display: grid; place-items: center; opacity: 0; transition: opacity 1.2s; pointer-events: none; overflow: auto; }
.eb-end.on { opacity: 1; pointer-events: auto; }
.eb-flyer { width: min(520px, 92vw); margin: 24px auto; padding: 22px 26px 26px; background: var(--paper); color: var(--ink); transform: rotate(-1.2deg);
  clip-path: polygon(0 1%, 8% 0, 22% 2%, 40% 0, 63% 1%, 80% 0, 100% 2%, 99% 30%, 100% 62%, 98% 88%, 100% 100%, 76% 98%, 55% 100%, 31% 97%, 12% 100%, 0 98%, 2% 70%, 0 41%);
  background-image: radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px); background-size: 3px 3px; }
.eb-flyer h1 { margin: 14px 0 0; font: 900 clamp(56px, 12vw, 120px)/0.85 var(--display); text-transform: uppercase; letter-spacing: -0.01em; }
.eb-flyer p { margin: 12px 0 0; font: 400 16px/1.45 var(--mono); }
.eb-art { line-height: 0; border: 3px solid var(--ink); filter: grayscale(0.4) contrast(1.2); }
.eb-art svg { width: 100%; height: auto; }
.eb-ticket { margin: 18px 0 0; width: 220px; height: 150px; overflow: hidden; background: #fff; color: var(--ink); padding: 0 14px; border: 2px dashed var(--ink); }
.eb-ticket-head { position: relative; z-index: 1; background: #fff; font: 700 11px/1 var(--label); letter-spacing: 0.25em; padding: 10px 0 8px; border-bottom: 2px solid var(--ink); display: flex; justify-content: space-between; }
.eb-roll { animation: eb-roll 14s linear infinite; font: 400 13px/2 var(--mono); padding-top: 120px; }
@keyframes eb-roll { to { transform: translateY(-100%); } }
.eb-retry { margin-top: 16px; display: inline-block; padding: 8px 14px; background: var(--ink); color: var(--paper); font: 700 12px var(--label); letter-spacing: 0.2em; text-transform: uppercase; }
`;
