// Architecture: monumental Kraftwerk Berlin / Berghain industrial hall structure.
// Builds flared concrete pillar capitals, hanging inverted-pyramid coal hoppers,
// heavy overhead cross-beams, a 19 m board-marked concrete ceiling slab with girder ribs,
// sealed upper wall friezes, and towering frosted glass-block window banks.
import * as THREE from 'three';
import { CELL, CEILING, cellCenter } from '../contracts';
import type { LevelData } from '../data';

/** Matches WALL_HEIGHT in level.ts so upper friezes seal the gap from 16 m to 19 m. */
const WALL_HEIGHT = 16;

/** World-scale UV tile size (metres) for board-marked Sichtbeton formwork panels. */
export const CONCRETE_TILE_SIZE = 4.0;
/** World-scale UV tile size (metres) for poured-concrete floor slabs (matches 6 m structural bays). */
export const FLOOR_TILE_SIZE = 6.0;

/** Desaturated cold Berlin Sichtbeton material tints (multiplied over the procedural concrete albedo). */
export const CONCRETE_LIGHT_COLOR = 0x828992; // Pillars, capitals, hoppers, primary beams (~#4e535a)
export const CONCRETE_DARK_COLOR = 0x545962; // Outer walls, upper friezes, secondary beams (~#32363c)
export const CONCRETE_PLINTH_COLOR = 0x454a52; // Grounded brutalist pillar base plinths
export const CONCRETE_GALLERY_COLOR = 0x707782; // 9 m mezzanine concrete slabs and corbels
export const FLOOR_CONCRETE_COLOR = 0x5c626c; // Scuffed damp dark industrial dance floor

export interface ConcreteTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/** Deterministic PRNG for procedural concrete and glass-block textures. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cachedConcreteSet: ConcreteTextureSet | null = null;
let cachedFloorSet: ConcreteTextureSet | null = null;
let cachedGlassTex: THREE.CanvasTexture | null = null;

function createRepeatingTexture(canvas: HTMLCanvasElement, isSRGB: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Draws a radial blotch wrapped seamlessly across all 9 periodic tile offsets. */
function fillWrappedRadial(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
  innerColor: string,
  outerColor: string,
): void {
  for (let ox = -size; ox <= size; ox += size) {
    if (cx + ox + r < 0 || cx + ox - r > size) continue;
    for (let oy = -size; oy <= size; oy += size) {
      if (cy + oy + r < 0 || cy + oy - r > size) continue;
      const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      g.addColorStop(0, innerColor);
      g.addColorStop(1, outerColor);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draws a vertical gradient strip wrapped seamlessly across the top/bottom tile seam. */
function fillWrappedVerticalStreak(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y0: number,
  w: number,
  h: number,
  topColor: string,
  midColor: string,
  endColor: string,
): void {
  const drawAt = (yy: number) => {
    const grad = ctx.createLinearGradient(x, yy, x, yy + h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.55, midColor);
    grad.addColorStop(1, endColor);
    ctx.fillStyle = grad;
    ctx.fillRect(x, yy, w, h);
  };
  drawAt(y0);
  if (y0 + h > size) drawAt(y0 - size);
  if (x + w > size) {
    const grad = ctx.createLinearGradient(x - size, y0, x - size, y0 + h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.55, midColor);
    grad.addColorStop(1, endColor);
    ctx.fillStyle = grad;
    ctx.fillRect(x - size, y0, w, h);
    if (y0 + h > size) {
      const gradWrap = ctx.createLinearGradient(x - size, y0 - size, x - size, y0 - size + h);
      gradWrap.addColorStop(0, topColor);
      gradWrap.addColorStop(0.55, midColor);
      gradWrap.addColorStop(1, endColor);
      ctx.fillStyle = gradWrap;
      ctx.fillRect(x - size, y0 - size, w, h);
    }
  }
}

/**
 * Procedural high-contrast cold Berlin Sichtbeton PBR texture triplet (512x512, cached):
 * - map: cold steel-concrete albedo with board-marked formwork planks, wood-grain imprints,
 *   tie-rod cone holes, mottled pour blotches, spalled concrete patches, hairline cracks, and damp soot.
 * - bumpMap: matched height relief for shuttering seams, bevels, tie-rod recesses, cracks, and grit.
 * - roughnessMap: matte mineral aggregate (0.85..0.98) contrasted with damp vertical condensation sheen (0.48..0.68).
 */
export function boardConcreteTextures(): ConcreteTextureSet {
  if (cachedConcreteSet) return cachedConcreteSet;

  const size = 512;
  const mapCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  mapCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  mapCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const mCtx = mapCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');

  if (mCtx && bCtx && rCtx) {
    const rand = mulberry32(19530914);

    // 1. Cold neutral-bright steel-concrete base (never warm or beige: B > G > R).
    mCtx.fillStyle = '#9aa2ad';
    mCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#a0a0a0';
    bCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#e6e6e6'; // ~0.90 base matte concrete
    rCtx.fillRect(0, 0, size, size);

    // 2. Horizontal board-marked wooden shuttering planks (16 planks = 25 cm each at 4 m tile scale).
    const planks = 16;
    const plankH = size / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * plankH;
      const v = Math.round(146 + (rand() - 0.5) * 34);
      mCtx.fillStyle = `rgb(${v - 6}, ${v}, ${v + 8})`;
      mCtx.fillRect(0, y, size, plankH);

      // Slight height & roughness step per poured shuttering board.
      const bv = Math.round(156 + (rand() - 0.5) * 20);
      bCtx.fillStyle = `rgb(${bv}, ${bv}, ${bv})`;
      bCtx.fillRect(0, y, size, plankH);

      const rv = Math.round(224 + (rand() - 0.5) * 26);
      rCtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
      rCtx.fillRect(0, y, size, plankH);

      // Rough-sawn timber wood-grain imprints pressed into the cured concrete.
      for (let g = 0; g < 9; g++) {
        const gy = y + 2.5 + rand() * (plankH - 5);
        const gh = 1 + rand() * 2.2;
        const bright = rand() > 0.45;
        const alpha = 0.05 + rand() * 0.09;
        mCtx.fillStyle = bright ? `rgba(222, 230, 240, ${alpha})` : `rgba(22, 26, 33, ${alpha})`;
        mCtx.fillRect(0, gy, size, gh);

        const ba = 0.08 + rand() * 0.14;
        bCtx.fillStyle = bright ? `rgba(225, 225, 225, ${ba})` : `rgba(55, 55, 55, ${ba})`;
        bCtx.fillRect(0, gy, size, gh);
      }

      // Crisp horizontal formwork seam: dark recessed shadow groove + bright micro-bevel lip.
      mCtx.fillStyle = 'rgba(14, 17, 22, 0.72)';
      mCtx.fillRect(0, y, size, 2.5);
      mCtx.fillStyle = 'rgba(218, 226, 238, 0.28)';
      mCtx.fillRect(0, y + 2.5, size, 1.5);

      bCtx.fillStyle = 'rgb(24, 24, 24)';
      bCtx.fillRect(0, y, size, 2.6);
      bCtx.fillStyle = 'rgb(218, 218, 218)';
      bCtx.fillRect(0, y + 2.6, size, 1.6);

      rCtx.fillStyle = 'rgb(252, 252, 252)';
      rCtx.fillRect(0, y, size, 2.8);

      // Vertical pour butt-joints (1 or 2 per plank).
      const joints = rand() > 0.4 ? 2 : 1;
      for (let j = 0; j < joints; j++) {
        const vx = Math.floor(24 + rand() * (size - 48));
        mCtx.fillStyle = 'rgba(16, 19, 24, 0.56)';
        mCtx.fillRect(vx, y, 2, plankH);
        mCtx.fillStyle = 'rgba(210, 218, 228, 0.2)';
        mCtx.fillRect(vx + 2, y, 1.2, plankH);

        bCtx.fillStyle = 'rgb(42, 42, 42)';
        bCtx.fillRect(vx, y, 2, plankH);
        bCtx.fillStyle = 'rgb(196, 196, 196)';
        bCtx.fillRect(vx + 2, y, 1.2, plankH);

        rCtx.fillStyle = 'rgb(248, 248, 248)';
        rCtx.fillRect(vx, y, 2.4, plankH);
      }
    }

    // 3. Large-scale mottled pour blotches & concrete hydration clouds (seamlessly wrapped).
    for (let i = 0; i < 46; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 24 + rand() * 68;
      const dark = rand() > 0.42;
      const a = 0.08 + rand() * 0.14;
      fillWrappedRadial(
        mCtx,
        size,
        cx,
        cy,
        r,
        dark ? `rgba(24, 29, 36, ${a})` : `rgba(216, 224, 234, ${a * 0.8})`,
        dark ? 'rgba(24, 29, 36, 0)' : 'rgba(216, 224, 234, 0)',
      );
      fillWrappedRadial(
        rCtx,
        size,
        cx,
        cy,
        r,
        dark ? 'rgba(165, 165, 165, 0.22)' : 'rgba(245, 245, 245, 0.22)',
        'rgba(220, 220, 220, 0)',
      );
    }

    // 4. Coarse mineral aggregate grain (fine + chunky grit so texture reads crisp at PIXEL_SCALE = 0.42).
    for (let i = 0; i < 9500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const bright = rand() > 0.52;
      const sz = rand() > 0.84 ? 2.2 + rand() * 1.8 : 1 + rand() * 1.4;
      const a = 0.05 + rand() * 0.12;
      mCtx.fillStyle = bright ? `rgba(224, 230, 240, ${a})` : `rgba(18, 22, 28, ${a})`;
      mCtx.fillRect(x, y, sz, sz);

      if (i % 2 === 0) {
        const ba = 0.08 + rand() * 0.16;
        bCtx.fillStyle = bright ? `rgba(230, 230, 230, ${ba})` : `rgba(38, 38, 38, ${ba})`;
        bCtx.fillRect(x, y, sz, sz);
      }
    }

    // 5. Spalled concrete patches (chipped surface craters revealing coarse dark basalt aggregate).
    for (let s = 0; s < 7; s++) {
      const sx = 32 + rand() * (size - 64);
      const sy = 32 + rand() * (size - 64);
      const rx = 10 + rand() * 18;
      const ry = 7 + rand() * 12;
      const pts = 9;
      const poly: [number, number][] = [];
      for (let p = 0; p < pts; p++) {
        const ang = (p / pts) * Math.PI * 2;
        const rad = 0.68 + rand() * 0.52;
        poly.push([sx + Math.cos(ang) * rx * rad, sy + Math.sin(ang) * ry * rad]);
      }

      const tracePoly = (ctx: CanvasRenderingContext2D, ox = 0, oy = 0) => {
        ctx.beginPath();
        ctx.moveTo(poly[0][0] + ox, poly[0][1] + oy);
        for (let p = 1; p < pts; p++) ctx.lineTo(poly[p][0] + ox, poly[p][1] + oy);
        ctx.closePath();
      };

      // Pale fractured rim lip on bottom/right edge.
      tracePoly(mCtx, 1.2, 1.2);
      mCtx.strokeStyle = 'rgba(218, 226, 236, 0.34)';
      mCtx.lineWidth = 2;
      mCtx.stroke();

      tracePoly(mCtx);
      mCtx.fillStyle = 'rgba(38, 43, 52, 0.68)';
      mCtx.fill();

      tracePoly(bCtx);
      bCtx.fillStyle = 'rgb(62, 62, 62)';
      bCtx.fill();
      bCtx.strokeStyle = 'rgb(206, 206, 206)';
      bCtx.lineWidth = 1.6;
      bCtx.stroke();

      tracePoly(rCtx);
      rCtx.fillStyle = 'rgb(252, 252, 252)';
      rCtx.fill();

      // Coarse exposed gravel pebbles inside the spall crater.
      for (let k = 0; k < 24; k++) {
        const gx = sx + (rand() - 0.5) * rx * 1.4;
        const gy = sy + (rand() - 0.5) * ry * 1.4;
        const gs = 1.4 + rand() * 2.2;
        const gv = rand() > 0.5 ? 195 : 24;
        mCtx.fillStyle = `rgba(${gv - 4}, ${gv}, ${gv + 6}, 0.42)`;
        mCtx.fillRect(gx, gy, gs, gs);
        bCtx.fillStyle = rand() > 0.5 ? 'rgba(135, 135, 135, 0.65)' : 'rgba(28, 28, 28, 0.65)';
        bCtx.fillRect(gx, gy, gs, gs);
      }
    }

    // 6. Fine hairline concrete cracks (branching structural shrinkage cracks in albedo, bump, and roughness).
    const drawCrack = (x0: number, y0: number, angle0: number, steps: number, width: number) => {
      let x = x0;
      let y = y0;
      let ang = angle0;
      const pts: [number, number][] = [[x, y]];
      for (let i = 0; i < steps; i++) {
        ang += (rand() - 0.5) * 0.72;
        const seg = 5 + rand() * 10;
        x += Math.cos(ang) * seg;
        y += Math.sin(ang) * seg;
        if (x < 6 || x > size - 6 || y < 6 || y > size - 6) break;
        pts.push([x, y]);
      }
      if (pts.length < 3) return;

      const strokePath = (ctx: CanvasRenderingContext2D, ox = 0, oy = 0) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
        ctx.stroke();
      };

      // Subtle pale edge highlight beside the dark crack fissure.
      mCtx.strokeStyle = 'rgba(218, 226, 236, 0.24)';
      mCtx.lineWidth = width + 0.8;
      strokePath(mCtx, 1.1, 0.8);

      mCtx.strokeStyle = 'rgba(14, 17, 23, 0.78)';
      mCtx.lineWidth = width;
      strokePath(mCtx);

      bCtx.strokeStyle = 'rgb(16, 16, 16)';
      bCtx.lineWidth = width + 0.7;
      strokePath(bCtx);

      rCtx.strokeStyle = 'rgb(254, 254, 254)';
      rCtx.lineWidth = width + 1.0;
      strokePath(rCtx);
    };

    for (let c = 0; c < 11; c++) {
      const cx = 28 + rand() * (size - 56);
      const cy = 28 + rand() * (size - 56);
      const baseAngle = rand() * Math.PI * 2;
      drawCrack(cx, cy, baseAngle, 9 + Math.floor(rand() * 10), 1.2 + rand() * 0.8);
      if (rand() > 0.45) {
        drawCrack(cx, cy, baseAngle + (rand() > 0.5 ? 0.65 : -0.65), 5 + Math.floor(rand() * 5), 0.9);
      }
    }

    // 7. Industrial formwork tie-rod cone holes in a regular 4x4 grid (1 m spacing) with downward drip streaks.
    for (let row = 0; row < 4; row++) {
      const ty = (row + 0.5) * (size / 4);
      for (let col = 0; col < 4; col++) {
        const tx = (col + 0.5) * (size / 4);
        const dripLen = 20 + rand() * 32;

        // Cold dark moisture / oxidized-slate drip streak below each cone hole.
        const drip = mCtx.createLinearGradient(tx, ty, tx, ty + dripLen);
        drip.addColorStop(0, 'rgba(18, 20, 25, 0.58)');
        drip.addColorStop(0.45, 'rgba(26, 28, 33, 0.32)');
        drip.addColorStop(1, 'rgba(26, 28, 33, 0)');
        mCtx.fillStyle = drip;
        mCtx.fillRect(tx - 3.0, ty, 6.0, dripLen);

        // Damp drip catches subtle light in roughnessMap.
        const rDrip = rCtx.createLinearGradient(tx, ty, tx, ty + dripLen);
        rDrip.addColorStop(0, 'rgba(135, 135, 135, 0.68)');
        rDrip.addColorStop(1, 'rgba(220, 220, 220, 0)');
        rCtx.fillStyle = rDrip;
        rCtx.fillRect(tx - 3.2, ty, 6.4, dripLen);

        // Outer cone chamfer highlight & recessed dark socket.
        mCtx.strokeStyle = 'rgba(218, 226, 238, 0.34)';
        mCtx.lineWidth = 1.4;
        mCtx.beginPath();
        mCtx.arc(tx + 0.6, ty + 0.6, 5.4, 0, Math.PI * 2);
        mCtx.stroke();

        mCtx.fillStyle = 'rgba(12, 14, 18, 0.88)';
        mCtx.beginPath();
        mCtx.arc(tx, ty, 4.3, 0, Math.PI * 2);
        mCtx.fill();

        // Deep conical recess in bumpMap.
        const bCone = bCtx.createRadialGradient(tx, ty, 0.8, tx, ty, 6.2);
        bCone.addColorStop(0, 'rgb(8, 8, 8)');
        bCone.addColorStop(0.65, 'rgb(28, 28, 28)');
        bCone.addColorStop(0.88, 'rgb(212, 212, 212)');
        bCone.addColorStop(1, 'rgba(160, 160, 160, 0)');
        bCtx.fillStyle = bCone;
        bCtx.beginPath();
        bCtx.arc(tx, ty, 6.2, 0, Math.PI * 2);
        bCtx.fill();

        rCtx.fillStyle = 'rgb(252, 252, 252)';
        rCtx.beginPath();
        rCtx.arc(tx, ty, 4.6, 0, Math.PI * 2);
        rCtx.fill();
      }
    }

    // 8. Vertical damp soot & condensation streaks (darker in albedo, shinier in roughnessMap).
    for (let i = 0; i < 48; i++) {
      const x = rand() * size;
      const w = 3 + rand() * 18;
      const h = 85 + rand() * 290;
      const y0 = rand() < 0.6 ? (Math.floor(rand() * 4) * size) / 4 : rand() * size;
      const alpha = 0.08 + rand() * 0.18;
      fillWrappedVerticalStreak(
        mCtx,
        size,
        x,
        y0,
        w,
        h,
        `rgba(14, 17, 22, ${alpha})`,
        `rgba(20, 24, 30, ${alpha * 0.58})`,
        'rgba(20, 24, 30, 0)',
      );

      // Damp condensation streak lowers roughness to ~0.48..0.68 so raking lights and strobes glint softly.
      const dampAlpha = 0.24 + rand() * 0.36;
      const roughVal = Math.round(122 + rand() * 48);
      fillWrappedVerticalStreak(
        rCtx,
        size,
        x,
        y0,
        w,
        h,
        `rgba(${roughVal}, ${roughVal}, ${roughVal}, ${dampAlpha})`,
        `rgba(${roughVal + 20}, ${roughVal + 20}, ${roughVal + 20}, ${dampAlpha * 0.5})`,
        'rgba(230, 230, 230, 0)',
      );
    }
  }

  cachedConcreteSet = {
    map: createRepeatingTexture(mapCanvas, true),
    bumpMap: createRepeatingTexture(bumpCanvas, false),
    roughnessMap: createRepeatingTexture(roughCanvas, false),
  };
  return cachedConcreteSet;
}

/**
 * Procedural scuffed dark poured-concrete floor PBR texture triplet (512x512, cached):
 * - map: cold dark damp industrial concrete slabs with 2x2 expansion joints (3 m grid),
 *   scuffed dance-floor wear, hairline slab cracks, and aggregate pitting.
 * - bumpMap: recessed saw-cut expansion joints, subtle trowel grain, and micro-pitting.
 * - roughnessMap: directly encodes 0.45..0.92 (115..235) matte-to-damp sheen variation so
 *   strobes and sweeping lasers catch realistic gritty reflections across the dance floor.
 */
export function floorConcreteTextures(): ConcreteTextureSet {
  if (cachedFloorSet) return cachedFloorSet;

  const size = 512;
  const mapCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  mapCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  mapCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const mCtx = mapCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');

  if (mCtx && bCtx && rCtx) {
    const rand = mulberry32(20041015);

    // 1. Cold dark industrial concrete slab base.
    mCtx.fillStyle = '#7c8490';
    mCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#989898';
    bCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#d4d4d4'; // ~0.83 base scuffed concrete roughness
    rCtx.fillRect(0, 0, size, size);

    // Subtle per-quadrant slab pour tone variation (2x2 slabs = 3 m x 3 m per 6 m hall cell).
    const half = size / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const v = Math.round(122 + (rand() - 0.5) * 16);
        mCtx.fillStyle = `rgb(${v - 6}, ${v}, ${v + 8})`;
        mCtx.fillRect(gx * half, gy * half, half, half);

        const rv = Math.round(212 + (rand() - 0.5) * 20); // ~0.79..0.87
        rCtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
        rCtx.fillRect(gx * half, gy * half, half, half);
      }
    }

    // 2. Large-scale poured trowel clouds & dark damp dance-floor sheen puddles (seamlessly wrapped).
    for (let i = 0; i < 42; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 28 + rand() * 76;
      const isDamp = rand() < 0.45;
      if (isDamp) {
        // Damp concrete darkens slightly in albedo and drops roughness toward 0.45..0.58 (115..148).
        const a = 0.12 + rand() * 0.16;
        fillWrappedRadial(mCtx, size, cx, cy, r, `rgba(26, 31, 39, ${a})`, 'rgba(26, 31, 39, 0)');
        const rVal = Math.round(115 + rand() * 34);
        fillWrappedRadial(rCtx, size, cx, cy, r, `rgba(${rVal}, ${rVal}, ${rVal}, 0.72)`, 'rgba(212, 212, 212, 0)');
      } else {
        // Matte dry mineral dust / scuffed dry concrete patches (roughness ~0.86..0.92 = 220..235).
        const a = 0.08 + rand() * 0.12;
        fillWrappedRadial(mCtx, size, cx, cy, r, `rgba(182, 190, 202, ${a})`, 'rgba(182, 190, 202, 0)');
        fillWrappedRadial(rCtx, size, cx, cy, r, 'rgba(235, 235, 235, 0.55)', 'rgba(212, 212, 212, 0)');
      }
    }

    // 3. Scuffed dance-floor wear arcs, drag trails & polished foot-traffic paths.
    for (let i = 0; i < 64; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rad = 12 + rand() * 38;
      const a0 = rand() * Math.PI * 2;
      const a1 = a0 + 0.5 + rand() * 1.4;
      const lw = 2 + rand() * 6;

      mCtx.strokeStyle = rand() > 0.4 ? 'rgba(195, 202, 214, 0.07)' : 'rgba(20, 24, 30, 0.12)';
      mCtx.lineWidth = lw;
      mCtx.beginPath();
      mCtx.arc(x, y, rad, a0, a1);
      mCtx.stroke();

      // Polished shoe-scuff trails catch specular strobe glints (roughness ~0.55..0.68).
      const rv = Math.round(140 + rand() * 34);
      rCtx.strokeStyle = `rgba(${rv}, ${rv}, ${rv}, 0.42)`;
      rCtx.lineWidth = lw + 1;
      rCtx.beginPath();
      rCtx.arc(x, y, rad, a0, a1);
      rCtx.stroke();

      bCtx.strokeStyle = 'rgba(128, 128, 128, 0.22)';
      bCtx.lineWidth = lw * 0.5;
      bCtx.beginPath();
      bCtx.arc(x, y, rad, a0, a1);
      bCtx.stroke();
    }

    // 4. Mineral grit, concrete pores, and industrial pitting.
    for (let i = 0; i < 8000; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const bright = rand() > 0.55;
      const sz = rand() > 0.86 ? 2 + rand() * 1.8 : 1 + rand() * 1.2;
      const a = 0.05 + rand() * 0.1;
      mCtx.fillStyle = bright ? `rgba(210, 218, 228, ${a})` : `rgba(18, 22, 28, ${a})`;
      mCtx.fillRect(x, y, sz, sz);

      if (i % 2 === 0) {
        bCtx.fillStyle = bright ? 'rgba(205, 205, 205, 0.14)' : 'rgba(42, 42, 42, 0.18)';
        bCtx.fillRect(x, y, sz, sz);
      }
    }

    // 5. Occasional hairline slab stress cracks branching from expansion joints.
    for (let c = 0; c < 6; c++) {
      let x = rand() > 0.5 ? (rand() > 0.5 ? 0 : half) : rand() * size;
      let y = rand() > 0.5 ? (rand() > 0.5 ? 0 : half) : rand() * size;
      let ang = rand() * Math.PI * 2;
      const pts: [number, number][] = [[x, y]];
      for (let s = 0; s < 10; s++) {
        ang += (rand() - 0.5) * 0.65;
        x += Math.cos(ang) * (7 + rand() * 10);
        y += Math.sin(ang) * (7 + rand() * 10);
        if (x < 4 || x > size - 4 || y < 4 || y > size - 4) break;
        pts.push([x, y]);
      }
      if (pts.length > 2) {
        const strokeCrack = (ctx: CanvasRenderingContext2D) => {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
          ctx.stroke();
        };
        mCtx.strokeStyle = 'rgba(14, 17, 22, 0.68)';
        mCtx.lineWidth = 1.2;
        strokeCrack(mCtx);

        bCtx.strokeStyle = 'rgb(28, 28, 28)';
        bCtx.lineWidth = 1.8;
        strokeCrack(bCtx);

        rCtx.strokeStyle = 'rgb(235, 235, 235)';
        rCtx.lineWidth = 2.0;
        strokeCrack(rCtx);
      }
    }

    // 6. Saw-cut concrete expansion joint lines (2x2 grid at 0 and 256 -> seamless 3 m slab joints).
    const jointCoords = [0, half];
    for (const j of jointCoords) {
      // Horizontal expansion joint (wrap cleanly across y=0/512).
      mCtx.fillStyle = 'rgba(12, 15, 20, 0.82)';
      mCtx.fillRect(0, j, size, 2.5);
      if (j === 0) mCtx.fillRect(0, size - 1.2, size, 1.2);
      mCtx.fillStyle = 'rgba(202, 210, 222, 0.22)';
      mCtx.fillRect(0, j + 2.5, size, 1.4);

      bCtx.fillStyle = 'rgb(18, 18, 18)';
      bCtx.fillRect(0, j, size, 3);
      if (j === 0) bCtx.fillRect(0, size - 1.2, size, 1.2);
      bCtx.fillStyle = 'rgb(196, 196, 196)';
      bCtx.fillRect(0, j + 3, size, 1.4);

      rCtx.fillStyle = 'rgb(235, 235, 235)'; // dusty matte groove (0.92)
      rCtx.fillRect(0, j, size, 3.2);

      // Vertical expansion joint.
      mCtx.fillStyle = 'rgba(12, 15, 20, 0.82)';
      mCtx.fillRect(j, 0, 2.5, size);
      if (j === 0) mCtx.fillRect(size - 1.2, 0, 1.2, size);
      mCtx.fillStyle = 'rgba(202, 210, 222, 0.22)';
      mCtx.fillRect(j + 2.5, 0, 1.4, size);

      bCtx.fillStyle = 'rgb(18, 18, 18)';
      bCtx.fillRect(j, 0, 3, size);
      if (j === 0) bCtx.fillRect(size - 1.2, 0, 1.2, size);
      bCtx.fillStyle = 'rgb(196, 196, 196)';
      bCtx.fillRect(j + 3, 0, 1.4, size);

      rCtx.fillStyle = 'rgb(235, 235, 235)';
      rCtx.fillRect(j, 0, 3.2, size);
    }
  }

  cachedFloorSet = {
    map: createRepeatingTexture(mapCanvas, true),
    bumpMap: createRepeatingTexture(bumpCanvas, false),
    roughnessMap: createRepeatingTexture(roughCanvas, false),
  };
  return cachedFloorSet;
}

/** Procedural crisp frosted glass-block / white-tiled industrial window texture. */
function glassBlockTexture(): THREE.CanvasTexture {
  if (cachedGlassTex) return cachedGlassTex;

  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rand = mulberry32(20041218);

    // Dark mortar/grout backing.
    ctx.fillStyle = '#333a42';
    ctx.fillRect(0, 0, w, h);

    const cols = 12;
    const rows = 26;
    const cellW = w / cols;
    const cellH = h / rows;
    const grout = 3.2;

    for (let r = 0; r < rows; r++) {
      // Slightly brighter overcast sky near the top, cooler/grittier lower down.
      const vRatio = r / (rows - 1);
      const skyBoost = 1.04 - vRatio * 0.24;

      for (let c = 0; c < cols; c++) {
        const x = c * cellW + grout * 0.5;
        const y = r * cellH + grout * 0.5;
        const bw = cellW - grout;
        const bh = cellH - grout;

        const jitter = 0.93 + rand() * 0.14;
        const lum = Math.min(1, skyBoost * jitter);

        // Soft radial frosted glass-block glow (brighter centre, cooler refracted rim).
        const cx = x + bw * 0.5;
        const cy = y + bh * 0.5;
        const grad = ctx.createRadialGradient(cx, cy, bw * 0.08, cx, cy, Math.max(bw, bh) * 0.72);
        const rHi = Math.round(230 * lum);
        const gHi = Math.round(240 * lum);
        const bHi = Math.round(250 * lum);
        const rLo = Math.round(162 * lum);
        const gLo = Math.round(178 * lum);
        const bLo = Math.round(196 * lum);
        grad.addColorStop(0, `rgb(${rHi}, ${gHi}, ${bHi})`);
        grad.addColorStop(0.68, `rgb(${Math.round((rHi + rLo) * 0.5)}, ${Math.round((gHi + gLo) * 0.5)}, ${Math.round((bHi + bLo) * 0.5)})`);
        grad.addColorStop(1, `rgb(${rLo}, ${gLo}, ${bLo})`);

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, bw, bh);

        // Subtle inner glass bevel line.
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 * lum).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }

    // Subtle vertical atmospheric weathering streaks on the glass.
    for (let i = 0; i < 24; i++) {
      const sx = rand() * w;
      const sw = 4 + rand() * 14;
      const sh = 160 + rand() * 520;
      const sy = rand() * (h - sh);
      const g = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      g.addColorStop(0, 'rgba(42, 50, 58, 0.14)');
      g.addColorStop(1, 'rgba(42, 50, 58, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, sw, sh);
    }

    // Crisp industrial steel transom bars baked into the glazing pattern.
    ctx.fillStyle = '#20252b';
    ctx.fillRect(0, h / 3 - 4, w, 8);
    ctx.fillRect(0, (2 * h) / 3 - 4, w, 8);
    ctx.fillRect(w / 2 - 3, 0, 6, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedGlassTex = tex;
  return tex;
}

/**
 * Recomputes triplanar world-scale UVs on a BufferGeometry so board-marked concrete
 * shuttering lines stay horizontal and unstretched across boxes, pillars, walls, slabs,
 * beams, pilasters, capitals, and inverted-pyramid coal hoppers.
 */
export function applyWorldUVs(
  geo: THREE.BufferGeometry,
  tileSize = CONCRETE_TILE_SIZE,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !norm || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offsetX;
    const y = pos.getY(i) + offsetY;
    const z = pos.getZ(i) + offsetZ;
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));
    if (ny > 0.72) {
      uv.setXY(i, x / tileSize, z / tileSize);
    } else if (nx > nz) {
      uv.setXY(i, z / tileSize, y / tileSize);
    } else {
      uv.setXY(i, x / tileSize, y / tileSize);
    }
  }
  uv.needsUpdate = true;
}

/** Converts a geometry to flat-shaded non-indexed form with crisp normals and world-scale UVs. */
function prepareConcretePart(src: THREE.BufferGeometry, tileSize = CONCRETE_TILE_SIZE): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  src.dispose();
  g.computeVertexNormals();
  applyWorldUVs(g, tileSize);
  return g;
}

/** Merges an array of non-indexed BufferGeometries (position, normal, uv) into a single static geometry. */
export function mergeNonIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  for (const g of parts) totalVerts += g.getAttribute('position').count;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    const count = p.count;
    positions.set(p.array as Float32Array, offset * 3);
    normals.set(n.array as Float32Array, offset * 3);
    uvs.set(u.array as Float32Array, offset * 2);
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

/** Creates a positioned BoxGeometry prepared for merging with world-scale concrete UVs. */
export function concreteBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  tileSize = CONCRETE_TILE_SIZE,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return prepareConcretePart(g, tileSize);
}

/** Creates a positioned BoxGeometry prepared for merging (steel / trim). */
function plainBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const src = new THREE.BoxGeometry(w, h, d);
  src.translate(x, y, z);
  const g = src.index ? src.toNonIndexed() : src;
  if (g !== src) src.dispose();
  return g;
}

/**
 * Computes evenly spaced coal hopper centers inside a structural bay [start, end],
 * leaving clear margins from pillar capitals and outer walls / balconies.
 */
function bayHopperSlots(start: number, end: number, startIsPillar: boolean, endIsPillar: boolean, twoThreshold: number): number[] {
  const marginStart = startIsPillar ? 3.05 : 3.4;
  const marginEnd = endIsPillar ? 3.05 : 3.4;
  const clearStart = start + marginStart;
  const clearEnd = end - marginEnd;
  const clearLen = clearEnd - clearStart;
  if (clearLen < 5.6) return [];
  const count = clearLen >= twoThreshold ? 2 : 1;
  const step = clearLen / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(clearStart + step * (i + 0.5));
  }
  return out;
}

/**
 * Builds the monumental Kraftwerk Berlin / Berghain industrial architecture for the club.
 * Designed to stay ultra-lean (~14 draw calls total via InstancedMesh & static merging)
 * so 60 fps holds with 512 dancers.
 */
export function buildArchitecture(data: LevelData): THREE.Group {
  const root = new THREE.Group();
  root.name = 'architecture';

  const rows = data.grid.length;
  const cols = Math.max(...data.grid.map((l) => l.length));
  const clubW = cols * CELL;
  const clubD = rows * CELL;

  const [[mhC0, mhR0], [mhC1, mhR1]] = data.zones.main_hall;
  const hallMinX = mhC0 * CELL;
  const hallMaxX = (mhC1 + 1) * CELL;
  const hallMinZ = mhR0 * CELL;
  const hallMaxZ = (mhR1 + 1) * CELL;
  const hallW = hallMaxX - hallMinX;
  const hallD = hallMaxZ - hallMinZ;
  const hallMidX = (hallMinX + hallMaxX) / 2;
  const hallMidZ = (hallMinZ + hallMaxZ) / 2;

  // Shared procedural PBR textures and cold Berlin Sichtbeton materials.
  const concreteTex = boardConcreteTextures();
  const glassTex = glassBlockTexture();

  const concreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_LIGHT_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.13,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });

  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_DARK_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.12,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.95,
    metalness: 0.04,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1d2024,
    roughness: 0.52,
    metalness: 0.72,
  });

  const voidMat = new THREE.MeshBasicMaterial({ color: 0x040406 });

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xd8e4f0,
    map: glassTex,
    emissive: new THREE.Color(0xd8e4f0),
    emissiveMap: glassTex,
    emissiveIntensity: 1.38,
    roughness: 0.32,
    metalness: 0.04,
    side: THREE.FrontSide,
  });

  const dummy = new THREE.Object3D();

  // Locate every hall_pillar (`P`) inside main_hall and any front_door (`F`) cells.
  const pillars: { x: number; z: number }[] = [];
  const frontDoors: { col: number; row: number }[] = [];
  data.grid.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const kind = data.legend[line[col]];
      if (kind === 'hall_pillar' && col >= mhC0 && col <= mhC1 && row >= mhR0 && row <= mhR1) {
        pillars.push(cellCenter(col, row));
      } else if (kind === 'front_door') {
        frontDoors.push({ col, row });
      }
    }
  });

  const pillarXs = [...new Set(pillars.map((p) => p.x))].sort((a, b) => a - b);
  const pillarZs = [...new Set(pillars.map((p) => p.z))].sort((a, b) => a - b);

  // ---------------------------------------------------------------------------
  // 1. Enormous flared concrete pillar capitals around every main_hall pillar
  //    Flares from the 2.2 m shaft near y = 11.5 m up into cross-beams at 14..19 m.
  // ---------------------------------------------------------------------------
  if (pillars.length > 0) {
    const flare = new THREE.CylinderGeometry(5.6 / Math.SQRT2, 2.3 / Math.SQRT2, 3.1, 4, 1, false);
    flare.rotateY(Math.PI / 4);
    flare.translate(0, 11.75 + 3.1 / 2, 0);

    const capitalGeo = mergeNonIndexed([
      // Stepped necking collar at y = 11.35..11.80 m
      concreteBox(2.54, 0.45, 2.54, 0, 11.575, 0),
      // Monumental 4-sided flared concrete pyramid capital at y = 11.75..14.85 m
      prepareConcretePart(flare),
      // Heavy brutalist abacus / drop-panel slab at y = 14.80..15.85 m
      concreteBox(5.85, 1.05, 5.85, 0, 15.325, 0),
      // Upper capital pier tying into the 19 m roof beams at y = 15.85..19.00 m
      concreteBox(3.4, CEILING - 15.85, 3.4, 0, 15.85 + (CEILING - 15.85) / 2, 0),
    ]);

    const capitalsMesh = new THREE.InstancedMesh(capitalGeo, concreteMat, pillars.length);
    capitalsMesh.name = 'pillar_capitals';
    capitalsMesh.frustumCulled = false;
    pillars.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      capitalsMesh.setMatrixAt(i, dummy.matrix);
    });
    capitalsMesh.instanceMatrix.needsUpdate = true;
    capitalsMesh.computeBoundingSphere();
    root.add(capitalsMesh);
  }

  // ---------------------------------------------------------------------------
  // 2. Iconic massive inverted-pyramid concrete coal hoppers (y = 12.2..19.0 m)
  //    Hanging from the 19 m ceiling between the pillar bays.
  // ---------------------------------------------------------------------------
  const xBounds = [hallMinX, ...pillarXs, hallMaxX];
  const zBounds = [hallMinZ, ...pillarZs, hallMaxZ];

  const hopperXs: number[] = [];
  for (let i = 0; i < xBounds.length - 1; i++) {
    hopperXs.push(...bayHopperSlots(xBounds[i], xBounds[i + 1], i > 0, i < xBounds.length - 2, 16.0));
  }
  const hopperZs: number[] = [];
  for (let i = 0; i < zBounds.length - 1; i++) {
    hopperZs.push(...bayHopperSlots(zBounds[i], zBounds[i + 1], i > 0, i < zBounds.length - 2, 11.4));
  }

  const hoppers: { x: number; z: number }[] = [];
  for (const x of hopperXs) {
    for (const z of hopperZs) {
      hoppers.push({ x, z });
    }
  }

  if (hoppers.length > 0) {
    const hopperFunnel = new THREE.CylinderGeometry(5.5 / Math.SQRT2, 1.62 / Math.SQRT2, 5.65, 4, 1, false);
    hopperFunnel.rotateY(Math.PI / 4);
    hopperFunnel.translate(0, 12.5 + 5.65 / 2, 0);

    const hopperBodyGeo = mergeNonIndexed([
      // Straight upper bunker skirt meeting the 19 m slab (y = 18.15..19.00 m)
      concreteBox(5.5, CEILING - 18.15, 5.5, 0, 18.15 + (CEILING - 18.15) / 2, 0),
      // Massive inverted 4-sided concrete pyramid funnel (y = 12.50..18.15 m)
      prepareConcretePart(hopperFunnel),
      // Flat lower concrete discharge collar (y = 12.20..12.50 m)
      concreteBox(1.68, 0.3, 1.68, 0, 12.35, 0),
    ]);

    const hopperBodies = new THREE.InstancedMesh(hopperBodyGeo, concreteMat, hoppers.length);
    hopperBodies.name = 'coal_hoppers';
    hopperBodies.frustumCulled = false;

    // 4-sided dark steel discharge chute lip framing the recessed opening (y = 12.02..12.20 m).
    const lipH = 0.18;
    const lipY = 12.2 - lipH / 2;
    const steelLipGeo = mergeNonIndexed([
      plainBox(1.54, lipH, 0.16, 0, lipY, 0.69),
      plainBox(1.54, lipH, 0.16, 0, lipY, -0.69),
      plainBox(0.16, lipH, 1.22, 0.69, lipY, 0),
      plainBox(0.16, lipH, 1.22, -0.69, lipY, 0),
    ]);
    const hopperLips = new THREE.InstancedMesh(steelLipGeo, steelMat, hoppers.length);
    hopperLips.name = 'coal_hopper_chutes';
    hopperLips.frustumCulled = false;

    // Dark recessed underside chute opening facing straight down at y = 12.18 m.
    const openingGeo = new THREE.PlaneGeometry(1.22, 1.22);
    openingGeo.rotateX(Math.PI / 2);
    openingGeo.translate(0, 12.18, 0);
    const hopperOpenings = new THREE.InstancedMesh(openingGeo, voidMat, hoppers.length);
    hopperOpenings.name = 'coal_hopper_openings';
    hopperOpenings.frustumCulled = false;

    hoppers.forEach((h, i) => {
      dummy.position.set(h.x, 0, h.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hopperBodies.setMatrixAt(i, dummy.matrix);
      hopperLips.setMatrixAt(i, dummy.matrix);
      hopperOpenings.setMatrixAt(i, dummy.matrix);
    });
    hopperBodies.instanceMatrix.needsUpdate = true;
    hopperLips.instanceMatrix.needsUpdate = true;
    hopperOpenings.instanceMatrix.needsUpdate = true;
    hopperBodies.computeBoundingSphere();
    hopperLips.computeBoundingSphere();
    hopperOpenings.computeBoundingSphere();
    root.add(hopperBodies, hopperLips, hopperOpenings);
  }

  // ---------------------------------------------------------------------------
  // 3. Heavy transverse & longitudinal concrete beams across main_hall (y = 15..19 m)
  // ---------------------------------------------------------------------------
  if (pillarZs.length > 0) {
    const primaryBeamH = 3.6;
    const transGeo = concreteBox(hallW, primaryBeamH, 1.45, 0, CEILING - primaryBeamH / 2, 0);
    const transBeams = new THREE.InstancedMesh(transGeo, concreteMat, pillarZs.length);
    transBeams.name = 'transverse_beams_primary';
    transBeams.frustumCulled = false;
    pillarZs.forEach((z, i) => {
      dummy.position.set(hallMidX, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      transBeams.setMatrixAt(i, dummy.matrix);
    });
    transBeams.instanceMatrix.needsUpdate = true;
    transBeams.computeBoundingSphere();
    root.add(transBeams);
  }

  // Secondary transverse concrete beams (mid-bay dividers + north/south edge tie beams).
  const secondaryTransZs: number[] = [hallMinZ + 0.45, hallMaxZ - 0.45];
  for (let i = 0; i < pillarZs.length - 1; i++) {
    if (pillarZs[i + 1] - pillarZs[i] >= 15) {
      secondaryTransZs.push((pillarZs[i] + pillarZs[i + 1]) / 2);
    }
  }
  {
    const secBeamH = 2.4;
    const secTransGeo = concreteBox(hallW, secBeamH, 0.85, 0, CEILING - secBeamH / 2, 0);
    const secTransBeams = new THREE.InstancedMesh(secTransGeo, darkConcreteMat, secondaryTransZs.length);
    secTransBeams.name = 'transverse_beams_secondary';
    secTransBeams.frustumCulled = false;
    secondaryTransZs.forEach((z, i) => {
      dummy.position.set(hallMidX, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      secTransBeams.setMatrixAt(i, dummy.matrix);
    });
    secTransBeams.instanceMatrix.needsUpdate = true;
    secTransBeams.computeBoundingSphere();
    root.add(secTransBeams);
  }

  if (pillarXs.length > 0) {
    const primaryBeamH = 3.6;
    const longGeo = concreteBox(1.45, primaryBeamH, hallD, 0, CEILING - primaryBeamH / 2, 0);
    const longBeams = new THREE.InstancedMesh(longGeo, concreteMat, pillarXs.length);
    longBeams.name = 'longitudinal_beams_primary';
    longBeams.frustumCulled = false;
    pillarXs.forEach((x, i) => {
      dummy.position.set(x, 0, hallMidZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      longBeams.setMatrixAt(i, dummy.matrix);
    });
    longBeams.instanceMatrix.needsUpdate = true;
    longBeams.computeBoundingSphere();
    root.add(longBeams);
  }

  // Secondary longitudinal beams (centerline divider between twin center hoppers + edge tie beams).
  const secondaryLongXs: number[] = [hallMinX + 0.45, hallMaxX - 0.45];
  for (let i = 0; i < pillarXs.length - 1; i++) {
    if (pillarXs[i + 1] - pillarXs[i] >= 18) {
      secondaryLongXs.push((pillarXs[i] + pillarXs[i + 1]) / 2);
    }
  }
  {
    const secBeamH = 2.4;
    const secLongGeo = concreteBox(0.85, secBeamH, hallD, 0, CEILING - secBeamH / 2, 0);
    const secLongBeams = new THREE.InstancedMesh(secLongGeo, darkConcreteMat, secondaryLongXs.length);
    secLongBeams.name = 'longitudinal_beams_secondary';
    secLongBeams.frustumCulled = false;
    secondaryLongXs.forEach((x, i) => {
      dummy.position.set(x, 0, hallMidZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      secLongBeams.setMatrixAt(i, dummy.matrix);
    });
    secLongBeams.instanceMatrix.needsUpdate = true;
    secLongBeams.computeBoundingSphere();
    root.add(secLongBeams);
  }

  // ---------------------------------------------------------------------------
  // 4. 19 m raw board-marked concrete ceiling slab covering the whole club
  //    + subtle girder ribs + upper wall frieze closing y = 16..19 m.
  // ---------------------------------------------------------------------------
  {
    const slabW = clubW + 4;
    const slabD = clubD + 4;
    const ceilingGeo = new THREE.PlaneGeometry(slabW, slabD);
    // Rotate +PI/2 around X so normal points straight down (-Y): solid looking up,
    // backface-culled from above the ceiling.
    ceilingGeo.rotateX(Math.PI / 2);
    const uv = ceilingGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (slabW / CONCRETE_TILE_SIZE), uv.getY(i) * (slabD / CONCRETE_TILE_SIZE));
    }
    uv.needsUpdate = true;

    const ceiling = new THREE.Mesh(ceilingGeo, concreteMat);
    ceiling.name = 'ceiling_slab';
    ceiling.position.set(clubW / 2, CEILING, clubD / 2);
    root.add(ceiling);
  }

  // Club-wide subtle ceiling girder ribs every CELL along X (y = 18.52..19.00 m).
  {
    const ribH = 0.48;
    const ribGeo = concreteBox(0.42, ribH, clubD, 0, CEILING - ribH / 2, 0);
    const ribMesh = new THREE.InstancedMesh(ribGeo, darkConcreteMat, cols);
    ribMesh.name = 'ceiling_girder_ribs';
    ribMesh.frustumCulled = false;
    for (let c = 0; c < cols; c++) {
      dummy.position.set(c * CELL + CELL / 2, 0, clubD / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ribMesh.setMatrixAt(c, dummy.matrix);
    }
    ribMesh.instanceMatrix.needsUpdate = true;
    ribMesh.computeBoundingSphere();
    root.add(ribMesh);
  }

  // Upper wall frieze closing WALL_HEIGHT (16 m) -> CEILING (19 m) around club perimeter & main_hall,
  // plus backing wall around front_door (`F`) and concrete window sill/lintel stringcourses.
  {
    const friezeH = CEILING - WALL_HEIGHT;
    const friezeY = WALL_HEIGHT + friezeH / 2;
    const trimParts: THREE.BufferGeometry[] = [
      // Outer club perimeter upper frieze (y = 16.0..19.0 m, flush above WALL_HEIGHT)
      concreteBox(clubW, friezeH, 0.8, clubW / 2, friezeY, CELL - 0.4),
      concreteBox(clubW, friezeH, 0.8, clubW / 2, friezeY, clubD - CELL + 0.4),
      concreteBox(0.8, friezeH, clubD, CELL - 0.4, friezeY, clubD / 2),
      concreteBox(0.8, friezeH, clubD, clubW - CELL + 0.4, friezeY, clubD / 2),
      // Interior dividing frieze along east & south walls of main_hall
      concreteBox(0.8, friezeH, hallD, hallMaxX + 0.4, friezeY, hallMidZ),
      concreteBox(hallW, friezeH, 0.8, hallMidX, friezeY, hallMaxZ + 0.4),
      // North wall window sill (y = 3.00..3.34 m) & head lintel (y = 13.98..14.42 m)
      concreteBox(hallW, 0.34, 0.36, hallMidX, 3.17, hallMinZ + 0.18),
      concreteBox(hallW, 0.44, 0.36, hallMidX, 14.2, hallMinZ + 0.18),
      // West wall window sill (clears 3 m front door) & head lintel
      concreteBox(0.36, 0.34, hallD, hallMinX + 0.18, 3.17, hallMidZ),
      concreteBox(0.36, 0.44, hallD, hallMinX + 0.18, 14.2, hallMidZ),
    ];

    // Seal concrete wall above and flanking any front_door cell on the west edge so no black void leaks.
    for (const fd of frontDoors) {
      const c = cellCenter(fd.col, fd.row);
      const wallX = (fd.col + 1) * CELL - 0.25;
      // Spandrel wall above the 3 m front door up to 16 m (window pane sits proud at x = 6.08)
      trimParts.push(concreteBox(0.5, WALL_HEIGHT - 3.0, CELL, wallX, 3.0 + (WALL_HEIGHT - 3.0) / 2, c.z));
      // Narrow jamb piers flanking the 2.4 m wide door opening (z = c.z +- 1.2..3.0)
      const jambW = (CELL - 2.4) / 2;
      trimParts.push(concreteBox(0.5, 3.0, jambW, wallX, 1.5, c.z - 1.2 - jambW / 2));
      trimParts.push(concreteBox(0.5, 3.0, jambW, wallX, 1.5, c.z + 1.2 + jambW / 2));
    }

    const friezeMesh = new THREE.Mesh(mergeNonIndexed(trimParts), darkConcreteMat);
    friezeMesh.name = 'upper_frieze_and_trim';
    root.add(friezeMesh);
  }

  // ---------------------------------------------------------------------------
  // 5. Tall vertical banks of glowing white-tiled / frosted glass-block windows
  //    along the north and west tall walls of main_hall (y = 3.3..14.0 m),
  //    framed by 3D industrial steel mullions and vertical concrete pilasters.
  // ---------------------------------------------------------------------------
  const winW = 4.4;
  const winH = 10.7;
  const winCenterY = 3.3 + winH / 2; // 8.65 m (spans 3.3..14.0 m)

  interface WindowSpec {
    x: number;
    z: number;
    rotY: number;
  }
  const windows: WindowSpec[] = [];

  // North wall bays (z = hallMinZ + 0.08, facing +Z).
  for (let col = mhC0; col <= mhC1; col++) {
    const c = cellCenter(col, mhR0);
    windows.push({ x: c.x, z: hallMinZ + 0.08, rotY: 0 });
  }
  // West wall bays (x = hallMinX + 0.08, facing +X).
  for (let row = mhR0; row <= mhR1; row++) {
    const c = cellCenter(mhC0, row);
    windows.push({ x: hallMinX + 0.08, z: c.z, rotY: Math.PI / 2 });
  }

  if (windows.length > 0) {
    // Glowing frosted glass-block panes.
    const paneGeo = new THREE.PlaneGeometry(winW, winH);
    const panesMesh = new THREE.InstancedMesh(paneGeo, windowMat, windows.length);
    panesMesh.name = 'glass_block_windows';
    panesMesh.frustumCulled = false;

    // 3D dark-steel outer surround + intermediate transoms + center mullion.
    const frameGeo = mergeNonIndexed([
      // Top & bottom frame bars
      plainBox(winW + 0.28, 0.2, 0.24, 0, winH / 2 + 0.06, 0.08),
      plainBox(winW + 0.28, 0.22, 0.28, 0, -winH / 2 - 0.06, 0.1),
      // Left & right vertical jambs
      plainBox(0.16, winH + 0.2, 0.22, -winW / 2 - 0.06, 0, 0.08),
      plainBox(0.16, winH + 0.2, 0.22, winW / 2 + 0.06, 0, 0.08),
      // Two horizontal industrial steel transoms dividing the tall window into 3 tiers
      plainBox(winW, 0.14, 0.16, 0, winH / 6, 0.06),
      plainBox(winW, 0.14, 0.16, 0, -winH / 6, 0.06),
      // Slender center vertical steel mullion
      plainBox(0.1, winH, 0.14, 0, 0, 0.05),
    ]);
    const framesMesh = new THREE.InstancedMesh(frameGeo, steelMat, windows.length);
    framesMesh.name = 'window_steel_frames';
    framesMesh.frustumCulled = false;

    windows.forEach((w, i) => {
      dummy.position.set(w.x, winCenterY, w.z);
      dummy.rotation.set(0, w.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      panesMesh.setMatrixAt(i, dummy.matrix);
      framesMesh.setMatrixAt(i, dummy.matrix);
    });
    panesMesh.instanceMatrix.needsUpdate = true;
    framesMesh.instanceMatrix.needsUpdate = true;
    panesMesh.computeBoundingSphere();
    framesMesh.computeBoundingSphere();
    root.add(panesMesh, framesMesh);
  }

  // Vertical concrete pilasters framing every window bay along the north & west walls.
  // Depth is 0.42 m so west pilasters stop at x = 6.42 m (cleanly clear of the west gallery at x >= 6.5 m).
  interface PilasterSpec {
    x: number;
    z: number;
    rotY: number;
    scaleX: number;
  }
  const pilasters: PilasterSpec[] = [];

  // North wall pilasters at interior cell seams + slim corner piers.
  pilasters.push({ x: hallMinX + 0.22, z: hallMinZ + 0.21, rotY: 0, scaleX: 0.44 });
  for (let col = mhC0 + 1; col <= mhC1; col++) {
    pilasters.push({ x: col * CELL, z: hallMinZ + 0.21, rotY: 0, scaleX: 1.0 });
  }
  pilasters.push({ x: hallMaxX - 0.22, z: hallMinZ + 0.21, rotY: 0, scaleX: 0.44 });

  // West wall pilasters at interior cell seams + slim south-west corner pier.
  for (let row = mhR0 + 1; row <= mhR1; row++) {
    pilasters.push({ x: hallMinX + 0.21, z: row * CELL, rotY: Math.PI / 2, scaleX: 1.0 });
  }
  pilasters.push({ x: hallMinX + 0.21, z: hallMaxZ - 0.22, rotY: Math.PI / 2, scaleX: 0.44 });

  if (pilasters.length > 0) {
    // Rise from floor 0 up to the underside of the y = 16.6..19.0 m perimeter beams.
    const pilasterH = CEILING - 2.4;
    const pilasterGeo = concreteBox(1.04, pilasterH, 0.42, 0, pilasterH / 2, 0);
    const pilastersMesh = new THREE.InstancedMesh(pilasterGeo, concreteMat, pilasters.length);
    pilastersMesh.name = 'wall_pilasters';
    pilastersMesh.frustumCulled = false;
    pilasters.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(p.scaleX, 1, 1);
      dummy.updateMatrix();
      pilastersMesh.setMatrixAt(i, dummy.matrix);
    });
    pilastersMesh.instanceMatrix.needsUpdate = true;
    pilastersMesh.computeBoundingSphere();
    root.add(pilastersMesh);
  }

  return root;
}
