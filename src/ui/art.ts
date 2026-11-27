// End card illustrations. Flat, dark, one accent colour each. Placeholder until Emma's end scenes (#8, item 13).
import type { EndingId } from '../contracts';

const BED = `<svg viewBox="0 0 320 150">
  <rect x="0" y="0" width="320" height="150" fill="#0d0b10"/>
  <rect x="210" y="14" width="80" height="56" fill="#3b2f1a"/><rect x="214" y="18" width="72" height="48" fill="#ffd9a0" opacity="0.8"/>
  <line x1="250" y1="18" x2="250" y2="66" stroke="#3b2f1a" stroke-width="3"/>
  <rect x="20" y="88" width="270" height="34" rx="6" fill="#3a3550"/>
  <rect x="20" y="118" width="10" height="26" fill="#221f2e"/><rect x="280" y="118" width="10" height="26" fill="#221f2e"/>
  <rect x="30" y="70" width="90" height="26" rx="12" fill="#e9e2cf"/>
  <path d="M64 77 q11 -4 22 0 q3 10 -4 15 q-7 3 -14 0 q-7 -5 -4 -15 z" fill="#2b1d14"/>
  <path d="M110 86 q40 -24 150 -2 l0 14 l-150 0 z" fill="#6a5f8a"/>
  <circle cx="126" cy="80" r="11" fill="#e0b996"/>
</svg>`;

const QUEUE = `<svg viewBox="0 0 320 150">
  <rect x="0" y="0" width="320" height="150" fill="#9aa3ad"/>
  <rect x="0" y="20" width="320" height="100" fill="#4a4a4a"/>
  <rect x="200" y="40" width="40" height="80" fill="#222"/>
  <rect x="0" y="120" width="320" height="30" fill="#2a2a2a"/>
  ${[20, 50, 80, 110, 140, 170]
    .map((x, i) => `<rect x="${x}" y="${84 + (i % 2) * 3}" width="16" height="36" rx="6" fill="#151515"/><circle cx="${x + 8}" cy="${78 + (i % 2) * 3}" r="7" fill="#151515"/>`)
    .join('')}
  <rect x="240" y="96" width="44" height="18" rx="7" fill="#8b5a2b"/><rect x="276" y="80" width="10" height="22" fill="#8b5a2b" transform="rotate(25 281 91)"/>
  <rect x="280" y="74" width="20" height="10" rx="4" fill="#8b5a2b" transform="rotate(20 290 79)"/>
  <rect x="244" y="112" width="5" height="16" fill="#8b5a2b"/><rect x="254" y="112" width="5" height="16" fill="#8b5a2b"/><rect x="268" y="112" width="5" height="16" fill="#8b5a2b"/><rect x="278" y="112" width="5" height="16" fill="#8b5a2b"/>
</svg>`;

const BOOTH = `<svg viewBox="0 0 320 150">
  <rect x="0" y="0" width="320" height="150" fill="#070509"/>
  <polygon points="160,0 60,150 260,150" fill="#ff1744" opacity="0.18"/>
  <polygon points="100,0 20,150 140,150" fill="#9c27ff" opacity="0.14"/>
  <rect x="80" y="92" width="160" height="40" fill="#1c1c1e"/>
  <circle cx="120" cy="100" r="12" fill="#333"/><circle cx="200" cy="100" r="12" fill="#333"/>
  <rect x="146" y="58" width="30" height="40" rx="10" fill="#8b5a2b"/>
  <rect x="152" y="30" width="16" height="34" fill="#8b5a2b" transform="rotate(10 160 47)"/>
  <rect x="150" y="18" width="40" height="18" rx="7" fill="#8b5a2b" transform="rotate(15 170 27)"/>
  <rect x="146" y="22" width="30" height="7" rx="3" fill="#111"/>
  ${[20, 50, 260, 290].map((x) => `<circle cx="${x}" cy="138" r="10" fill="#111"/>`).join('')}
</svg>`;

const HERD = `<svg viewBox="0 0 320 150">
  <rect x="0" y="0" width="320" height="150" fill="#0b0b0b"/>
  <rect x="0" y="128" width="320" height="22" fill="#1c1c1c"/>
  ${[70, 160, 250]
    .map(
      (x) => `<g transform="translate(${x} 0)">
    <rect x="-22" y="54" width="44" height="60" fill="#e6e1d3"/>
    <rect x="-6" y="20" width="16" height="40" fill="#e6e1d3" transform="rotate(12 2 40)"/>
    <rect x="-4" y="10" width="38" height="16" fill="#e6e1d3" transform="rotate(18 15 18)"/>
    <rect x="-20" y="112" width="12" height="18" fill="#e6e1d3"/><rect x="8" y="112" width="12" height="18" fill="#e6e1d3"/>
  </g>`,
    )
    .join('')}
</svg>`;

export function endArt(ending: EndingId): string {
  return ending === 'full_memory' ? BED : ending === 'secret_dj' ? BOOTH : ending === 'herd' ? HERD : QUEUE;
}
