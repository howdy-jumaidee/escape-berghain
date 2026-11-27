// Architecture: monumental Kraftwerk Berlin / Berghain industrial hall structure.
// Builds flared concrete pillar capitals, hanging inverted-pyramid coal hoppers,
// heavy overhead cross-beams, a 19 m board-marked concrete ceiling slab with girder ribs,
// sealed upper wall friezes, and towering frosted glass-block window banks.
import * as THREE from 'three';
import { CELL, CEILING, cellCenter } from '../contracts';
import type { LevelData } from '../data';

/** Matches WALL_HEIGHT in level.ts so upper friezes seal the gap from 16 m to 19 m. */
const WALL_HEIGHT = 16;

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

let cachedConcreteTex: THREE.CanvasTexture | null = null;
let cachedGlassTex: THREE.CanvasTexture | null = null;

/** Procedural board-marked raw concrete (Sichtbeton): shuttering planks, tie-rod holes, aggregate, grime streaks. */
function boardConcreteTexture(): THREE.CanvasTexture {
  if (cachedConcreteTex) return cachedConcreteTex;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(19980515);

  // Base mid-grey raw concrete.
  ctx.fillStyle = '#6c7075';
  ctx.fillRect(0, 0, size, size);

  // Horizontal wooden shuttering planks (16 boards).
  const planks = 16;
  const plankH = size / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * plankH;
    const tone = Math.round(98 + (rand() - 0.5) * 24);
    ctx.fillStyle = `rgb(${tone}, ${tone + 2}, ${tone + 5})`;
    ctx.fillRect(0, y, size, plankH);

    // Subtle wood grain imprints along each plank.
    for (let g = 0; g < 6; g++) {
      const gy = y + 2 + rand() * (plankH - 4);
      const alpha = 0.03 + rand() * 0.06;
      ctx.fillStyle = rand() > 0.5 ? `rgba(220,225,230,${alpha})` : `rgba(22,24,28,${alpha})`;
      ctx.fillRect(0, gy, size, 1 + rand() * 2);
    }

    // Crisp shuttering board joint line.
    ctx.fillStyle = 'rgba(20, 22, 26, 0.42)';
    ctx.fillRect(0, y, size, 1.5);
    ctx.fillStyle = 'rgba(185, 190, 198, 0.14)';
    ctx.fillRect(0, y + 1.5, size, 1);

    // Occasional vertical formwork butt joint.
    if (rand() > 0.35) {
      const vx = Math.floor(rand() * size);
      ctx.fillStyle = 'rgba(22, 24, 28, 0.28)';
      ctx.fillRect(vx, y, 1.5, plankH);
    }
  }

  // Fine mineral concrete aggregate speckle.
  for (let i = 0; i < 6500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const bright = rand() > 0.5;
    const a = 0.03 + rand() * 0.07;
    ctx.fillStyle = bright ? `rgba(210,214,220,${a})` : `rgba(18,20,24,${a})`;
    ctx.fillRect(x, y, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }

  // Formwork tie-rod holes in a regular industrial grid, with faint vertical drip marks.
  for (let row = 0; row < 4; row++) {
    const ty = (row + 0.5) * (size / 4);
    for (let col = 0; col < 4; col++) {
      const tx = (col + 0.5) * (size / 4);
      const dripLen = 14 + rand() * 26;
      const drip = ctx.createLinearGradient(tx, ty, tx, ty + dripLen);
      drip.addColorStop(0, 'rgba(24, 24, 26, 0.32)');
      drip.addColorStop(1, 'rgba(24, 24, 26, 0)');
      ctx.fillStyle = drip;
      ctx.fillRect(tx - 2.2, ty, 4.4, dripLen);

      ctx.fillStyle = 'rgba(16, 18, 22, 0.72)';
      ctx.beginPath();
      ctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(180, 185, 192, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, 4.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Vertical soot & moisture grime streaks descending from top pours.
  for (let i = 0; i < 42; i++) {
    const x = rand() * size;
    const w = 3 + rand() * 16;
    const h = 90 + rand() * (size - 90);
    const y0 = rand() < 0.65 ? 0 : rand() * (size * 0.4);
    const alpha = 0.06 + rand() * 0.14;
    const grad = ctx.createLinearGradient(x, y0, x, y0 + h);
    grad.addColorStop(0, `rgba(14, 15, 18, ${alpha})`);
    grad.addColorStop(0.55, `rgba(18, 20, 24, ${alpha * 0.55})`);
    grad.addColorStop(1, 'rgba(18, 20, 24, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y0, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedConcreteTex = tex;
  return tex;
}

/** Procedural crisp frosted glass-block / white-tiled industrial window texture. */
function glassBlockTexture(): THREE.CanvasTexture {
  if (cachedGlassTex) return cachedGlassTex;

  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
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

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedGlassTex = tex;
  return tex;
}

/**
 * Recomputes triplanar world-scale UVs on a non-indexed BufferGeometry so
 * board-marked concrete shuttering lines stay horizontal and unstretched across
 * boxes, beams, pilasters, capitals, and inverted-pyramid coal hoppers.
 */
function applyWorldUVs(geo: THREE.BufferGeometry, tileSize = 6): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
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
function prepareConcretePart(src: THREE.BufferGeometry, tileSize = 6): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  src.dispose();
  g.computeVertexNormals();
  applyWorldUVs(g, tileSize);
  return g;
}

/** Merges an array of non-indexed BufferGeometries (position, normal, uv) into a single static geometry. */
function mergeNonIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
function concreteBox(w: number, h: number, d: number, x: number, y: number, z: number, tileSize = 6): THREE.BufferGeometry {
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

  // Shared procedural textures and materials.
  const concreteTex = boardConcreteTexture();
  const glassTex = glassBlockTexture();

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    map: concreteTex,
    bumpMap: concreteTex,
    bumpScale: 0.085,
    roughness: 0.92,
    metalness: 0.04,
  });

  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x62676f,
    map: concreteTex,
    bumpMap: concreteTex,
    bumpScale: 0.075,
    roughness: 0.96,
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
    // naturally backface-culled if a top-down camera sits above 19 m.
    ceilingGeo.rotateX(Math.PI / 2);
    const uv = ceilingGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (slabW / 6), uv.getY(i) * (slabD / 6));
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
