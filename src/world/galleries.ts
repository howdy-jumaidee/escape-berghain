// World: walkable steel-and-concrete mezzanine galleries, catwalk bridge, and monumental steel stairs
// overlooking main_hall at y = FLOOR_HEIGHT (9 m). Issue #71.
import * as THREE from 'three';
import { CELL, FLOOR_HEIGHT, cellCenter } from '../contracts';
import type { LevelData } from '../data';
import {
  applyWorldUVs,
  boardConcreteTextures,
  CONCRETE_GALLERY_COLOR,
  CONCRETE_TILE_SIZE,
  concreteBox,
  mergeNonIndexed,
} from './architecture';

export interface Galleries {
  root: THREE.Group;
  /** Returns target { floor: 0 | 1, y: number } for horse at (x, z), smoothly ramping on stairs. */
  elevationAt(x: number, z: number, currentFloor: number, currentY: number): { floor: number; y: number };
  /** Keeps the horse inside walkable gallery decks + stair chute when on floor 1 or climbing stairs. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number, currentFloor: number, currentY: number): void;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Gallery geometry in world metres (main_hall cells [[1, 1], [10, 8]] => x = 6..66, z = 6..54).
const DECK_Y = FLOOR_HEIGHT; // 9 m
const SLAB_THICK = 0.8;
const RAIL_H = 1.15;

// Walkable floor-1 balcony rectangles (0.5 m inset from outer hall walls at x=6, x=66, z=54).
const WEST_DECK: Rect = { minX: 6.5, maxX: 12.5, minZ: 12.0, maxZ: 53.5 };
const EAST_DECK: Rect = { minX: 59.5, maxX: 65.5, minZ: 12.0, maxZ: 53.5 };
const SOUTH_DECK: Rect = { minX: 6.5, maxX: 65.5, minZ: 47.5, maxZ: 53.5 };
// Catwalk spans x = 12.5..59.5, z = 26..30.5 (extra 0.5 m south gives 2.4 m clear passage around pillars [3,4] and [7,4]).
const CATWALK_VISUAL: Rect = { minX: 12.5, maxX: 59.5, minZ: 26.0, maxZ: 30.5 };
// Extended across west/east decks so the eroded union has zero seams at the catwalk junctions.
const CATWALK_WALKABLE: Rect = { minX: 6.5, maxX: 65.5, minZ: 26.0, maxZ: 30.5 };

// Monumental straight steel staircase climbing south from floor 0 (z = 33.5, y = 0) up to south balcony (z = 47.5, y = 9).
// Verified clear of all pillars (nearest [3,7] ends at x = 22.1), player_start (33, 39), NPCs, pickups, doorways, and patrol 0.
const STAIR_MIN_X = 25.5;
const STAIR_MAX_X = 29.1;
const STAIR_MIN_Z = 33.5;
const STAIR_MAX_Z = 47.5;
const STAIR_LEN = STAIR_MAX_Z - STAIR_MIN_Z; // 14.0 m (~32.7 deg pitch)
const STAIR_WIDTH = STAIR_MAX_X - STAIR_MIN_X; // 3.6 m
const STAIR_MID_X = (STAIR_MIN_X + STAIR_MAX_X) / 2; // 27.3 m
const STAIR_STEPS = 36;

// Top stair opening merged into south balcony for seamless entry/exit at z = 47.5.
const STAIR_TOP_WALKABLE: Rect = { minX: STAIR_MIN_X, maxX: STAIR_MAX_X, minZ: STAIR_MAX_Z - 3.5, maxZ: SOUTH_DECK.maxZ };

// Floor-0 low-headroom under-stair blocker (stair height 1.48..3.28 m) so horse can't clip sideways into low steps,
// while leaving bottom entry mouth (z < 35.8) and high underside (z > 38.6, headroom >= 3.3 m) completely open.
const STAIR_LOW_BLOCK: Rect = { minX: STAIR_MIN_X, maxX: STAIR_MAX_X, minZ: 35.8, maxZ: 38.6 };

const PILLAR_HALF = 1.1; // hall_pillar solid footprint is 2.2 x 2.2 m

function stairYAt(z: number): number {
  const t = Math.max(0, Math.min(1, (z - STAIR_MIN_Z) / STAIR_LEN));
  return t * DECK_Y;
}

function inRect(x: number, z: number, r: Rect, margin = 0): boolean {
  return x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
}

function pushOutOfRect(pos: THREE.Vector3, radius: number, c: Rect): void {
  const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
  const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
  const dx = pos.x - nx;
  const dz = pos.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    pos.x = nx + (dx / d) * radius;
    pos.z = nz + (dz / d) * radius;
  } else {
    const left = pos.x - c.minX;
    const right = c.maxX - pos.x;
    const up = pos.z - c.minZ;
    const down = c.maxZ - pos.z;
    const m = Math.min(left, right, up, down);
    if (m === left) pos.x = c.minX - radius;
    else if (m === right) pos.x = c.maxX + radius;
    else if (m === up) pos.z = c.minZ - radius;
    else pos.z = c.maxZ + radius;
  }
}

/** Clamp (pos.x, pos.z) to the nearest point inside the union of eroded walkable rectangles. */
function clampToUnion(pos: THREE.Vector3, rects: Rect[]): void {
  let bestX = pos.x;
  let bestZ = pos.z;
  let bestD2 = Infinity;
  for (const r of rects) {
    if (r.minX > r.maxX || r.minZ > r.maxZ) continue;
    if (pos.x >= r.minX && pos.x <= r.maxX && pos.z >= r.minZ && pos.z <= r.maxZ) return;
    const cx = Math.max(r.minX, Math.min(pos.x, r.maxX));
    const cz = Math.max(r.minZ, Math.min(pos.z, r.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestX = cx;
      bestZ = cz;
    }
  }
  pos.x = bestX;
  pos.z = bestZ;
}

/** Procedural industrial steel catwalk grating texture. */
function makeGrateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#181a1d';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#383d44';
    g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
    g.strokeStyle = '#4c525c';
    g.lineWidth = 1;
    for (let i = 8; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 2);
  return tex;
}

interface BoxTransform {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

function makeInstancedBoxes(
  boxes: BoxTransform[],
  material: THREE.Material,
  name: string,
): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, boxes.length);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0);
    dummy.scale.set(b.sx, b.sy, b.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildGalleries(data: LevelData): Galleries {
  const root = new THREE.Group();
  root.name = 'galleries';

  // Find hall pillars that intersect the catwalk bridge (pillars [3,4] and [7,4]).
  const deckPillars: Rect[] = [];
  const mainHall = data.zones.main_hall;
  const [c0, r0] = mainHall[0];
  const [c1, r1] = mainHall[1];
  data.grid.forEach((line, row) => {
    if (row < r0 || row > r1) return;
    [...line].forEach((ch, col) => {
      if (col < c0 || col > c1) return;
      if (data.legend[ch] !== 'hall_pillar') return;
      const c = cellCenter(col, row);
      const pRect: Rect = {
        minX: c.x - PILLAR_HALF,
        maxX: c.x + PILLAR_HALF,
        minZ: c.z - PILLAR_HALF,
        maxZ: c.z + PILLAR_HALF,
      };
      const overlapsCatwalk =
        pRect.maxX > CATWALK_VISUAL.minX &&
        pRect.minX < CATWALK_VISUAL.maxX &&
        pRect.maxZ > CATWALK_VISUAL.minZ &&
        pRect.minZ < CATWALK_VISUAL.maxZ;
      if (overlapsCatwalk) deckPillars.push(pRect);
    });
  });

  // Materials (reuses shared cold Sichtbeton PBR texture triplet from architecture.ts).
  const concreteTex = boardConcreteTextures();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_GALLERY_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.11,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.94,
    metalness: 0.04,
  });
  const grateTex = makeGrateTexture();
  const grateMat = new THREE.MeshStandardMaterial({
    color: 0x3b4047,
    map: grateTex,
    roughness: 0.62,
    metalness: 0.72,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e2126,
    roughness: 0.48,
    metalness: 0.82,
  });
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x343940,
    roughness: 0.55,
    metalness: 0.76,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x191b1f,
    roughness: 0.42,
    metalness: 0.85,
  });
  const nosingMat = new THREE.MeshStandardMaterial({
    color: 0x525a64,
    roughness: 0.5,
    metalness: 0.65,
  });

  // 1. Concrete balcony decks (0.8 m thick fascia slabs, non-overlapping at corners to avoid z-fighting).
  // Extend outer visual edges flush to hall walls (x=6, x=66, z=54); walkable bounds stay inset 0.5 m.
  const hallMinX = c0 * CELL; // 6
  const hallMaxX = (c1 + 1) * CELL; // 66
  const hallMaxZ = (r1 + 1) * CELL; // 54

  const addSlab = (minX: number, maxX: number, minZ: number, maxZ: number, name: string) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cy = DECK_Y - SLAB_THICK / 2;
    const cz = (minZ + maxZ) / 2;
    const geo = new THREE.BoxGeometry(w, SLAB_THICK, d);
    applyWorldUVs(geo, CONCRETE_TILE_SIZE, cx, cy, cz);
    const mesh = new THREE.Mesh(geo, concreteMat);
    mesh.name = name;
    mesh.position.set(cx, cy, cz);
    root.add(mesh);
  };
  addSlab(hallMinX, WEST_DECK.maxX, WEST_DECK.minZ, SOUTH_DECK.minZ, 'gallery_west_slab');
  addSlab(EAST_DECK.minX, hallMaxX, EAST_DECK.minZ, SOUTH_DECK.minZ, 'gallery_east_slab');
  addSlab(hallMinX, hallMaxX, SOUTH_DECK.minZ, hallMaxZ, 'gallery_south_slab');

  // 2. Walkable steel catwalk bridge deck.
  const catW = CATWALK_VISUAL.maxX - CATWALK_VISUAL.minX;
  const catD = CATWALK_VISUAL.maxZ - CATWALK_VISUAL.minZ;
  const catDeck = new THREE.Mesh(new THREE.BoxGeometry(catW, 0.28, catD), grateMat);
  catDeck.name = 'gallery_catwalk_deck';
  catDeck.position.set((CATWALK_VISUAL.minX + CATWALK_VISUAL.maxX) / 2, DECK_Y - 0.14, (CATWALK_VISUAL.minZ + CATWALK_VISUAL.maxZ) / 2);
  root.add(catDeck);

  // 3. Cantilevered concrete wall corbel brackets (y = 5.6..8.2 m, completely clear of floor-0 navigation).
  // Placed only on solid wall segments (skipping doorway openings at z = 24..30 and x = 36..42).
  // Merged with world-scale concrete UVs so every corbel stays 1 draw call with zero texture stretching.
  const corbelParts: THREE.BufferGeometry[] = [];
  const sideBracketZs = [14, 20, 34, 40, 46, 52];
  for (const bz of sideBracketZs) {
    // Upper haunch + angled strut feel using stepped brutalist corbel block on west and east walls.
    corbelParts.push(concreteBox(3.6, 1.1, 0.75, hallMinX + 1.8, DECK_Y - SLAB_THICK - 0.55, bz));
    corbelParts.push(concreteBox(1.8, 1.1, 0.75, hallMinX + 0.9, DECK_Y - SLAB_THICK - 1.65, bz));
    corbelParts.push(concreteBox(3.6, 1.1, 0.75, hallMaxX - 1.8, DECK_Y - SLAB_THICK - 0.55, bz));
    corbelParts.push(concreteBox(1.8, 1.1, 0.75, hallMaxX - 0.9, DECK_Y - SLAB_THICK - 1.65, bz));
  }
  const southBracketXs = [12, 18, 24, 30, 46, 52, 58];
  for (const bx of southBracketXs) {
    corbelParts.push(concreteBox(0.75, 1.1, 3.6, bx, DECK_Y - SLAB_THICK - 0.55, hallMaxZ - 1.8));
    corbelParts.push(concreteBox(0.75, 1.1, 1.8, bx, DECK_Y - SLAB_THICK - 1.65, hallMaxZ - 0.9));
  }
  const corbelMesh = new THREE.Mesh(mergeNonIndexed(corbelParts), concreteMat);
  corbelMesh.name = 'gallery_corbels';
  root.add(corbelMesh);

  // 4. Structural dark steel members (catwalk girders, under-deck ribs, pillar collars, fascia edge channels, stair stringers).
  const steelBoxes: BoxTransform[] = [];

  // Catwalk longitudinal side girders (0.55 m tall beneath the 0.28 m grate = 0.83 m total profile).
  steelBoxes.push({
    x: (CATWALK_VISUAL.minX + CATWALK_VISUAL.maxX) / 2,
    y: DECK_Y - 0.54,
    z: CATWALK_VISUAL.minZ + 0.09,
    sx: catW,
    sy: 0.56,
    sz: 0.18,
  });
  steelBoxes.push({
    x: (CATWALK_VISUAL.minX + CATWALK_VISUAL.maxX) / 2,
    y: DECK_Y - 0.54,
    z: CATWALK_VISUAL.maxZ - 0.09,
    sx: catW,
    sy: 0.56,
    sz: 0.18,
  });

  // Catwalk transverse cross-ribs every 3 m.
  for (let rx = CATWALK_VISUAL.minX + 2.0; rx <= CATWALK_VISUAL.maxX - 1.5; rx += 3.0) {
    steelBoxes.push({
      x: rx,
      y: DECK_Y - 0.44,
      z: (CATWALK_VISUAL.minZ + CATWALK_VISUAL.maxZ) / 2,
      sx: 0.14,
      sy: 0.34,
      sz: catD - 0.2,
    });
  }

  // Heavy steel collar brackets anchoring the catwalk into pillars [3,4] and [7,4].
  for (const p of deckPillars) {
    const px = (p.minX + p.maxX) / 2;
    const pz = (p.minZ + p.maxZ) / 2;
    steelBoxes.push({ x: px, y: DECK_Y - 0.45, z: pz, sx: 2.55, sy: 0.92, sz: 2.55 });
  }

  // Steel edge C-channel trim along inner balcony fascia lips.
  const trimY = DECK_Y - 0.12;
  // West inner lip (north & south of catwalk) + north cap.
  steelBoxes.push({ x: WEST_DECK.maxX, y: trimY, z: (WEST_DECK.minZ + CATWALK_VISUAL.minZ) / 2, sx: 0.09, sy: 0.26, sz: CATWALK_VISUAL.minZ - WEST_DECK.minZ });
  steelBoxes.push({ x: WEST_DECK.maxX, y: trimY, z: (CATWALK_VISUAL.maxZ + SOUTH_DECK.minZ) / 2, sx: 0.09, sy: 0.26, sz: SOUTH_DECK.minZ - CATWALK_VISUAL.maxZ });
  steelBoxes.push({ x: (hallMinX + WEST_DECK.maxX) / 2, y: trimY, z: WEST_DECK.minZ, sx: WEST_DECK.maxX - hallMinX, sy: 0.26, sz: 0.09 });
  // East inner lip (north & south of catwalk) + north cap.
  steelBoxes.push({ x: EAST_DECK.minX, y: trimY, z: (EAST_DECK.minZ + CATWALK_VISUAL.minZ) / 2, sx: 0.09, sy: 0.26, sz: CATWALK_VISUAL.minZ - EAST_DECK.minZ });
  steelBoxes.push({ x: EAST_DECK.minX, y: trimY, z: (CATWALK_VISUAL.maxZ + SOUTH_DECK.minZ) / 2, sx: 0.09, sy: 0.26, sz: SOUTH_DECK.minZ - CATWALK_VISUAL.maxZ });
  steelBoxes.push({ x: (EAST_DECK.minX + hallMaxX) / 2, y: trimY, z: EAST_DECK.minZ, sx: hallMaxX - EAST_DECK.minX, sy: 0.26, sz: 0.09 });
  // South inner lip (west & east of stair opening).
  steelBoxes.push({ x: (WEST_DECK.maxX + STAIR_MIN_X) / 2, y: trimY, z: SOUTH_DECK.minZ, sx: STAIR_MIN_X - WEST_DECK.maxX, sy: 0.26, sz: 0.09 });
  steelBoxes.push({ x: (STAIR_MAX_X + EAST_DECK.minX) / 2, y: trimY, z: SOUTH_DECK.minZ, sx: EAST_DECK.minX - STAIR_MAX_X, sy: 0.26, sz: 0.09 });

  // Monumental staircase stringers, central spine girder, mid-span columns, and top knee-braces.
  const pitch = Math.atan2(DECK_Y, STAIR_LEN);
  const slopeLen = Math.hypot(STAIR_LEN, DECK_Y);
  const stairMidZ = (STAIR_MIN_Z + STAIR_MAX_Z) / 2;
  const stairMidY = DECK_Y / 2;

  // Left & right side stringers (rotation.x = -pitch tilts local +Z upward toward +Y).
  steelBoxes.push({ x: STAIR_MIN_X - 0.07, y: stairMidY - 0.16, z: stairMidZ, sx: 0.14, sy: 0.56, sz: slopeLen + 0.2, rx: -pitch });
  steelBoxes.push({ x: STAIR_MAX_X + 0.07, y: stairMidY - 0.16, z: stairMidZ, sx: 0.14, sy: 0.56, sz: slopeLen + 0.2, rx: -pitch });
  // Central heavy spine girder underneath the treads.
  steelBoxes.push({ x: STAIR_MID_X, y: stairMidY - 0.36, z: stairMidZ, sx: 0.24, sy: 0.42, sz: slopeLen, rx: -pitch });

  // Two steel support columns tucked at the south edge of the low-clearance block (z = 38.2, height ~2.9 m) + cross tie.
  const colZ = 38.2;
  const colH = stairYAt(colZ) - 0.2;
  steelBoxes.push({ x: STAIR_MIN_X + 0.1, y: colH / 2, z: colZ, sx: 0.22, sy: colH, sz: 0.22 });
  steelBoxes.push({ x: STAIR_MAX_X - 0.1, y: colH / 2, z: colZ, sx: 0.22, sy: colH, sz: 0.22 });
  steelBoxes.push({ x: STAIR_MID_X, y: colH - 0.15, z: colZ, sx: STAIR_WIDTH - 0.1, sy: 0.22, sz: 0.22 });

  // Diagonal steel knee-struts from the south balcony slab underside bracing the upper stair flight.
  steelBoxes.push({ x: STAIR_MIN_X + 0.1, y: DECK_Y - 1.5, z: STAIR_MAX_Z - 1.2, sx: 0.18, sy: 0.2, sz: 3.1, rx: -0.92 });
  steelBoxes.push({ x: STAIR_MAX_X - 0.1, y: DECK_Y - 1.5, z: STAIR_MAX_Z - 1.2, sx: 0.18, sy: 0.2, sz: 3.1, rx: -0.92 });

  root.add(makeInstancedBoxes(steelBoxes, darkSteelMat, 'gallery_steel_structure'));

  // 5. Instanced staircase treads (36 steel steps) + floor-0 entry threshold plate.
  const treads: BoxTransform[] = [];
  const stepRise = DECK_Y / STAIR_STEPS;
  const stepRun = STAIR_LEN / STAIR_STEPS;
  for (let i = 0; i < STAIR_STEPS; i++) {
    const topY = (i + 1) * stepRise;
    const cz = STAIR_MIN_Z + (i + 0.5) * stepRun;
    treads.push({
      x: STAIR_MID_X,
      y: topY - 0.035,
      z: cz,
      sx: STAIR_WIDTH - 0.06,
      sy: 0.07,
      sz: stepRun + 0.05,
    });
  }
  root.add(makeInstancedBoxes(treads, treadMat, 'gallery_stair_treads'));

  // Subtle steel threshold plate at bottom of stairs so the entry mouth reads clearly on the dark dance floor.
  const entryPlate = new THREE.Mesh(new THREE.BoxGeometry(STAIR_WIDTH + 0.28, 0.04, 0.65), nosingMat);
  entryPlate.name = 'gallery_stair_entry';
  entryPlate.position.set(STAIR_MID_X, 0.02, STAIR_MIN_Z - 0.28);
  root.add(entryPlate);

  // 6. Dark steel railings (1.15 m tall: top rail, mid rail, kickplate, instanced vertical balusters).
  const railBars: BoxTransform[] = [];
  const balusters: BoxTransform[] = [];

  const addRailingSegment = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const isX = Math.abs(dx) >= Math.abs(dz);
    const sxTop = isX ? len : 0.06;
    const szTop = isX ? 0.06 : len;
    const sxMid = isX ? len : 0.04;
    const szMid = isX ? 0.04 : len;
    const sxKick = isX ? len : 0.03;
    const szKick = isX ? 0.03 : len;

    // Top rail, mid rail, and industrial toe-board / kickplate.
    railBars.push({ x: mx, y: DECK_Y + RAIL_H, z: mz, sx: sxTop, sy: 0.05, sz: szTop });
    railBars.push({ x: mx, y: DECK_Y + RAIL_H * 0.5, z: mz, sx: sxMid, sy: 0.04, sz: szMid });
    railBars.push({ x: mx, y: DECK_Y + 0.06, z: mz, sx: sxKick, sy: 0.12, sz: szKick });

    // Vertical balusters spaced ~0.95 m apart, including both end posts.
    const count = Math.max(2, Math.ceil(len / 0.95) + 1);
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const px = x0 + dx * f;
      const pz = z0 + dz * f;
      const isEnd = i === 0 || i === count - 1;
      const thick = isEnd ? 0.06 : 0.04;
      balusters.push({ x: px, y: DECK_Y + RAIL_H / 2, z: pz, sx: thick, sy: RAIL_H, sz: thick });
    }
  };

  // West balcony railings (north end, inner edge split around catwalk, outer doorway overlook at row 4).
  addRailingSegment(WEST_DECK.minX, WEST_DECK.minZ, WEST_DECK.maxX, WEST_DECK.minZ);
  addRailingSegment(WEST_DECK.maxX, WEST_DECK.minZ, WEST_DECK.maxX, CATWALK_VISUAL.minZ);
  addRailingSegment(WEST_DECK.maxX, CATWALK_VISUAL.maxZ, WEST_DECK.maxX, SOUTH_DECK.minZ);
  addRailingSegment(WEST_DECK.minX, 4 * CELL, WEST_DECK.minX, 5 * CELL);

  // East balcony railings (north end, inner edge split around catwalk, outer doorway overlook at row 4).
  addRailingSegment(EAST_DECK.minX, EAST_DECK.minZ, EAST_DECK.maxX, EAST_DECK.minZ);
  addRailingSegment(EAST_DECK.minX, EAST_DECK.minZ, EAST_DECK.minX, CATWALK_VISUAL.minZ);
  addRailingSegment(EAST_DECK.minX, CATWALK_VISUAL.maxZ, EAST_DECK.minX, SOUTH_DECK.minZ);
  addRailingSegment(EAST_DECK.maxX, 4 * CELL, EAST_DECK.maxX, 5 * CELL);

  // South balcony railings (inner edge split cleanly around the stair opening x = 25.5..29.1, plus south doorway overlook).
  addRailingSegment(WEST_DECK.maxX, SOUTH_DECK.minZ, STAIR_MIN_X, SOUTH_DECK.minZ);
  addRailingSegment(STAIR_MAX_X, SOUTH_DECK.minZ, EAST_DECK.minX, SOUTH_DECK.minZ);
  addRailingSegment(6 * CELL, SOUTH_DECK.maxZ, 7 * CELL, SOUTH_DECK.maxZ);

  // Catwalk railings: south edge continuous; north edge split around any pillars that pierce the north edge.
  addRailingSegment(CATWALK_VISUAL.minX, CATWALK_VISUAL.maxZ, CATWALK_VISUAL.maxX, CATWALK_VISUAL.maxZ);
  const northPillars = deckPillars.slice().sort((a, b) => a.minX - b.minX);
  let cursorX = CATWALK_VISUAL.minX;
  for (const p of northPillars) {
    if (p.minX > cursorX + 0.1) addRailingSegment(cursorX, CATWALK_VISUAL.minZ, p.minX, CATWALK_VISUAL.minZ);
    cursorX = Math.max(cursorX, p.maxX);
  }
  if (CATWALK_VISUAL.maxX > cursorX + 0.1) {
    addRailingSegment(cursorX, CATWALK_VISUAL.minZ, CATWALK_VISUAL.maxX, CATWALK_VISUAL.minZ);
  }

  // Sloped stair handrails (top rail, mid rail, and vertical balusters on both sides of the staircase).
  for (const sideX of [STAIR_MIN_X - 0.04, STAIR_MAX_X + 0.04]) {
    railBars.push({ x: sideX, y: stairMidY + RAIL_H, z: stairMidZ, sx: 0.06, sy: 0.05, sz: slopeLen + 0.1, rx: -pitch });
    railBars.push({ x: sideX, y: stairMidY + RAIL_H * 0.5, z: stairMidZ, sx: 0.04, sy: 0.04, sz: slopeLen + 0.1, rx: -pitch });
    const postCount = Math.ceil(STAIR_LEN / 0.95) + 1;
    for (let i = 0; i < postCount; i++) {
      const f = i / (postCount - 1);
      const pz = STAIR_MIN_Z + f * STAIR_LEN;
      const py = f * DECK_Y;
      const isEnd = i === 0 || i === postCount - 1;
      const thick = isEnd ? 0.06 : 0.04;
      balusters.push({ x: sideX, y: py + RAIL_H / 2, z: pz, sx: thick, sy: RAIL_H, sz: thick });
    }
  }

  root.add(makeInstancedBoxes(railBars, railMat, 'gallery_rail_bars'));
  root.add(makeInstancedBoxes(balusters, railMat, 'gallery_balusters'));

  // 7. Elevation & Collision API state.
  let onStairs = false;
  let lastX = NaN;
  let lastZ = NaN;

  const isOnAnyDeck = (x: number, z: number, margin = 0): boolean =>
    inRect(x, z, WEST_DECK, margin) ||
    inRect(x, z, EAST_DECK, margin) ||
    inRect(x, z, SOUTH_DECK, margin) ||
    inRect(x, z, CATWALK_WALKABLE, margin);

  function elevationAt(x: number, z: number, currentFloor: number, currentY: number): { floor: number; y: number } {
    // Detect teleports/respawns so stale stair state never sticks across jumps.
    if (Number.isFinite(lastX) && Math.hypot(x - lastX, z - lastZ) > 3.0) {
      onStairs = false;
    }
    lastX = x;
    lastZ = z;

    const inChuteX = x >= STAIR_MIN_X - 0.05 && x <= STAIR_MAX_X + 0.05;
    const inChuteZ = z >= STAIR_MIN_Z && z <= STAIR_MAX_Z;

    // Exit stairs cleanly at bottom or top.
    if (onStairs) {
      if (z < STAIR_MIN_Z) {
        onStairs = false;
        return { floor: 0, y: 0 };
      }
      if (z > STAIR_MAX_Z) {
        onStairs = false;
        return { floor: 1, y: DECK_Y };
      }
      if (inChuteX && inChuteZ) {
        const sy = stairYAt(z);
        return { floor: sy >= DECK_Y * 0.5 ? 1 : 0, y: sy };
      }
      onStairs = false;
    }

    // Enter stairs from bottom (floor 0 mouth), mid-flight (stateless query), or top (floor 1 south balcony mouth).
    if (inChuteX && inChuteZ) {
      const sy = stairYAt(z);
      const midFlight = currentY > 0.3 && currentY < DECK_Y - 0.3;
      const fromBottom = currentFloor === 0 && currentY <= 0.6 && sy <= 1.8;
      const fromTop = (currentFloor >= 1 || currentY >= DECK_Y - 0.6) && sy >= DECK_Y - 1.8;
      if (midFlight || fromBottom || fromTop) {
        onStairs = true;
        return { floor: sy >= DECK_Y * 0.5 ? 1 : 0, y: sy };
      }
      // Otherwise horse is walking underneath the upper half of the staircase on floor 0.
      return { floor: 0, y: 0 };
    }

    // Standing on floor 1 balconies / catwalk.
    if (currentFloor >= 1 || currentY >= DECK_Y - 0.3) {
      if (isOnAnyDeck(x, z, -1.0)) {
        return { floor: 1, y: DECK_Y };
      }
      return { floor: currentFloor, y: currentFloor * DECK_Y };
    }

    return { floor: 0, y: 0 };
  }

  function resolve(pos: THREE.Vector3, radius: number, currentFloor: number, currentY: number): void {
    // Reset stale stair state if the horse teleported/respawned before elevationAt ran.
    if (onStairs && Number.isFinite(lastX) && Math.hypot(pos.x - lastX, pos.z - lastZ) > 3.0) {
      onStairs = false;
    }

    const erodedDecks: Rect[] = [
      { minX: WEST_DECK.minX + radius, maxX: WEST_DECK.maxX - radius, minZ: WEST_DECK.minZ + radius, maxZ: WEST_DECK.maxZ - radius },
      { minX: EAST_DECK.minX + radius, maxX: EAST_DECK.maxX - radius, minZ: EAST_DECK.minZ + radius, maxZ: EAST_DECK.maxZ - radius },
      { minX: SOUTH_DECK.minX + radius, maxX: SOUTH_DECK.maxX - radius, minZ: SOUTH_DECK.minZ + radius, maxZ: SOUTH_DECK.maxZ - radius },
      { minX: CATWALK_WALKABLE.minX + radius, maxX: CATWALK_WALKABLE.maxX - radius, minZ: CATWALK_WALKABLE.minZ + radius, maxZ: CATWALK_WALKABLE.maxZ - radius },
      // Top stair opening has no north railing at minZ so horse walks cleanly down onto the stairs.
      { minX: STAIR_TOP_WALKABLE.minX + radius, maxX: STAIR_TOP_WALKABLE.maxX - radius, minZ: STAIR_TOP_WALKABLE.minZ, maxZ: STAIR_TOP_WALKABLE.maxZ - radius },
    ];

    const nearChuteX = pos.x >= STAIR_MIN_X - 1.5 && pos.x <= STAIR_MAX_X + 1.5;
    const climbing = (currentY > 0.3 && currentY < DECK_Y - 0.3) || (onStairs && nearChuteX);
    if (climbing) {
      if (pos.z > STAIR_MAX_Z) {
        // Head/rear probe extended onto south balcony near top of stairs.
        clampToUnion(pos, erodedDecks);
      } else if (pos.z >= STAIR_MIN_Z) {
        // Inside stair chute: keep laterally inside steel railings.
        pos.x = Math.max(STAIR_MIN_X + radius, Math.min(pos.x, STAIR_MAX_X - radius));
      }
      return;
    }

    if (currentY >= DECK_Y - 0.3 || (currentFloor >= 1 && currentY >= DECK_Y * 0.5)) {
      // Only constrain when in/near main_hall gallery footprint (ignore other rooms if floor 1 exists elsewhere).
      if (pos.x >= hallMinX - 2 && pos.x <= hallMaxX + 2 && pos.z >= 10 && pos.z <= hallMaxZ + 2) {
        clampToUnion(pos, erodedDecks);
        for (const p of deckPillars) {
          pushOutOfRect(pos, radius, p);
        }
        // Re-clamp once in case a pillar pushed the horse past a catwalk railing.
        clampToUnion(pos, erodedDecks);
      }
      return;
    }

    // Floor 0: prevent clipping sideways into the low-headroom underside of the staircase,
    // while keeping the stair entry mouth completely open.
    const enteringMouth = pos.x > STAIR_MIN_X && pos.x < STAIR_MAX_X && pos.z < STAIR_LOW_BLOCK.minZ;
    if (!enteringMouth) {
      pushOutOfRect(pos, radius, STAIR_LOW_BLOCK);
    }
  }

  return { root, elevationAt, resolve };
}
