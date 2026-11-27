// UI styles, injected once. Industrial: condensed type, hard edges, green exit sign glow.
export const css = /* css */ `
.eb-ui { position: fixed; inset: 0; pointer-events: none; font-family: "Arial Narrow", "Helvetica Neue", Arial, sans-serif; color: #e8e8e8; }
.eb-ui * { box-sizing: border-box; }

.eb-hud { position: absolute; left: 20px; top: 18px; display: flex; gap: 28px; align-items: center;
  font: 600 12px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.18em; color: #9a9a9a; text-shadow: 0 0 6px #000; }
.eb-trip { display: flex; gap: 10px; align-items: center; }
.eb-trip-bar { width: 160px; height: 6px; background: #1a1a1a; border: 1px solid #333; }
.eb-trip-fill { height: 100%; width: 10%; background: linear-gradient(90deg, #6a2cff, #ff1744); transition: width 0.3s; }
.eb-mem { display: flex; gap: 6px; align-items: center; }
.eb-mem i { width: 9px; height: 9px; border: 1px solid #555; display: inline-block; transform: rotate(45deg); }
.eb-mem i.on { background: #22ff66; border-color: #22ff66; box-shadow: 0 0 8px #22ff66; }
.eb-help { position: absolute; right: 20px; top: 18px; font: 11px/1.4 ui-monospace, Menlo, monospace; color: #666; letter-spacing: 0.1em; text-align: right; }

.eb-say { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); max-width: min(720px, 90vw);
  text-align: center; font-size: 22px; font-style: italic; color: #d9f5ff; text-shadow: 0 0 12px #000, 0 0 2px #000;
  opacity: 0; transition: opacity 0.4s; }
.eb-say.on { opacity: 1; }

.eb-talk { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(640px, 92vw);
  background: rgba(8, 8, 8, 0.88); border: 1px solid #2a2a2a; border-left: 3px solid #ff1744; padding: 14px 18px;
  opacity: 0; transition: opacity 0.2s; }
.eb-talk.on { opacity: 1; }
.eb-talk b { display: block; font: 700 11px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; color: #ff5a7a; margin-bottom: 8px; text-transform: uppercase; }
.eb-talk p { margin: 0; font-size: 19px; line-height: 1.35; }
.eb-answers { margin-top: 12px; display: grid; gap: 6px; pointer-events: auto; }
.eb-answers button { all: unset; cursor: pointer; padding: 8px 10px; border: 1px solid #333; font-size: 16px; }
.eb-answers button:hover, .eb-answers button:focus-visible { border-color: #22ff66; color: #22ff66; }
.eb-answers kbd { font: 11px ui-monospace, Menlo, monospace; color: #777; margin-right: 10px; }

.eb-cover { position: absolute; inset: 0; background: #000; display: grid; place-items: center; text-align: center;
  pointer-events: auto; transition: opacity 0.8s; }
.eb-cover.off { opacity: 0; pointer-events: none; }
.eb-title { font: 800 clamp(40px, 9vw, 120px)/0.9 "Arial Narrow", Impact, sans-serif; letter-spacing: -0.02em; color: #ddd; }
.eb-sub { margin-top: 18px; font: 12px/1.6 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; color: #777; }
.eb-go { margin-top: 36px; display: inline-block; padding: 14px 28px; border: 1px solid #22ff66; color: #22ff66;
  font: 700 14px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.25em; box-shadow: 0 0 18px rgba(34,255,102,0.25); }
.eb-intro { font: 600 clamp(20px, 3vw, 34px)/1.3 "Arial Narrow", Arial, sans-serif; color: #cfcfcf; max-width: 80vw; }
.eb-skip { position: absolute; bottom: 24px; right: 24px; font: 11px ui-monospace, Menlo, monospace; color: #555; letter-spacing: 0.15em; }

.eb-end { position: absolute; inset: 0; background: rgba(0,0,0,0.92); display: grid; place-items: center; text-align: center;
  opacity: 0; transition: opacity 1.2s; pointer-events: none; }
.eb-end.on { opacity: 1; pointer-events: auto; }
.eb-end h1 { margin: 0; font: 800 clamp(48px, 10vw, 140px)/0.9 "Arial Narrow", Impact, sans-serif; color: #eee; }
.eb-end p { max-width: 560px; margin: 18px auto 0; font-size: 20px; line-height: 1.4; color: #bbb; }
.eb-ticket { margin: 36px auto 0; width: 240px; height: 210px; overflow: hidden; position: relative;
  background: #e9e2cf; color: #222; border-radius: 4px; padding: 0 18px;
  -webkit-mask: radial-gradient(circle 9px at 0 50%, transparent 98%, #000) left, radial-gradient(circle 9px at 100% 50%, transparent 98%, #000) right;
  -webkit-mask-size: 51% 100%; -webkit-mask-repeat: no-repeat;
  mask: radial-gradient(circle 9px at 0 50%, transparent 98%, #000) left, radial-gradient(circle 9px at 100% 50%, transparent 98%, #000) right;
  mask-size: 51% 100%; mask-repeat: no-repeat; }
.eb-ticket-head { font: 700 11px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.3em; padding: 14px 0 8px; border-bottom: 1px dashed #999; display: flex; justify-content: space-between; }
.eb-roll { animation: eb-roll 16s linear infinite; font: 14px/2 ui-monospace, Menlo, monospace; padding-top: 170px; }
@keyframes eb-roll { to { transform: translateY(-100%); } }
.eb-retry { margin-top: 26px; font: 12px ui-monospace, Menlo, monospace; letter-spacing: 0.2em; color: #22ff66; }

.eb-flash { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; transition: opacity 0.15s; }
.eb-flash.on { opacity: 1; }
.eb-flash svg { height: 60vh; filter: drop-shadow(0 0 30px #9fe8ff); }
.eb-fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 0.6s; }
.eb-fade.on { opacity: 1; }
`;
