// Phone fallback: show the vertical poster and a quiet desktop-only notice without loading Three.js.
import { t } from './text';

const BASE = import.meta.env.BASE_URL;

const mobileCss = /* css */ `
@font-face {
  font-family: "Fragment Mono";
  src: url("${BASE}fonts/FragmentMono-Regular.ttf") format("truetype");
  font-display: swap;
}
:root {
  --mono: "Fragment Mono", ui-monospace, Menlo, monospace;
  --poster-bg: #faf0e6;
  --poster-ink: #2c1010;
  --poster-line: rgba(44, 16, 16, 0.14);
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --t-sm: 14px;
  --lh-body: 1.5;
}
html, body {
  margin: 0;
  height: 100dvh;
  background: var(--poster-bg);
  overflow: hidden;
}
.eb-mobile {
  box-sizing: border-box;
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--poster-bg);
  color: var(--poster-ink);
  font-family: var(--mono);
  padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  -webkit-font-smoothing: antialiased;
}
.eb-mobile-poster {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  object-fit: contain;
  display: block;
}
.eb-mobile-note {
  box-sizing: border-box;
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: var(--s-3) var(--s-5) var(--s-4);
  border-top: 1px solid var(--poster-line);
  text-align: center;
  text-wrap: balance;
  font: 400 var(--t-sm)/var(--lh-body) var(--mono);
  color: var(--poster-ink);
}
`;

export function showMobilePoster(): void {
  const style = document.createElement('style');
  style.textContent = mobileCss;
  document.head.appendChild(style);

  document.getElementById('hud')?.remove();

  const wrap = document.createElement('main');
  wrap.className = 'eb-mobile';

  const img = document.createElement('img');
  img.className = 'eb-mobile-poster';
  img.src = `${BASE}story.jpg`;
  img.alt = t('story:mobile.alt');

  const note = document.createElement('p');
  note.className = 'eb-mobile-note';
  note.textContent = t('story:mobile.notice');

  wrap.append(img, note);
  document.body.appendChild(wrap);
}
