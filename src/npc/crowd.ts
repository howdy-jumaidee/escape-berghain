// The crowd. Berghain is packed: a few hundred dancers drawn in one batch (instanced), thickest on the main floor.
// They dance on the beat, push the horse around, block security torches (hide in the crowd),
// and the higher your trip, the more of them have horse heads.
// Horsey low-poly club character models (instanced, dark/shirtless/leather Berliner weighting)
// with resilient procedural PS2 fallback, plus sculpted animal guests (horses, donkeys, and rare glowing-horn unicorns).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state, cellCenter, CELL, TRIP_MAX, type ZoneId } from '../contracts';
import type { LevelData } from '../data';

const DEFAULT_DENSITY: Partial<Record<ZoneId, number>> = {
  main_hall: 3.2,
  panorama_bar: 4.4,
  bar_cloakroom: 3.4,
  toilet_corridor: 5.5,
  back_exit: 1.4,
};
const RADIUS = 0.28;
const HASH = 1.5;
/** Cells that are solid or special: nobody dances there. */
const NO_DANCE = new Set([
  'hall_wall', 'hall_dj_booth', 'bar_counter', 'cloakroom_counter', 'toilet_cubicle', 'panorama_ice_cream',
  'exit_door', 'gate_shortcut', 'front_door', 'panorama_shutter', 'staircase_up', 'player_start',
  'fragment_1', 'fragment_3', 'mate',
]);
/** Partly solid cells: keep this far from the centre. */
const KEEP_CLEAR: Record<string, number> = { hall_pillar: 1.7, hall_speaker: 1.9 };

// Gallery walkable bounds mirrored from src/world/galleries.ts (read-only reference).
const GALLERY_Y = 9;
const GALLERY_DECKS = [
  { minX: 6.5, maxX: 12.5, minZ: 12.0, maxZ: 53.5 },  // WEST_DECK
  { minX: 59.5, maxX: 65.5, minZ: 12.0, maxZ: 53.5 }, // EAST_DECK
  { minX: 6.5, maxX: 65.5, minZ: 47.5, maxZ: 53.5 },  // SOUTH_DECK
  { minX: 12.5, maxX: 59.5, minZ: 26.0, maxZ: 30.5 }, // CATWALK_VISUAL
];
const GALLERY_MARGIN = 1.05;

// Module-level scratch objects so update() does zero per-frame allocations.
const _torsoEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _joint = new THREE.Vector3();
const _bodyMatrix = new THREE.Matrix4();
const _identityMatrix = new THREE.Matrix4();
const _gltfLoader = new GLTFLoader();

// Horsey crowd archetypes (crowd_0..crowd_7), weighted for a Berlin gay techno club
// (~86% naked/shirtless/black leather/dark gear, ~14% dark-accented glam/color):
// 0: Alex Shrub shirtless BDSM lingerie (22%)
// 1: Jezz Torrent shirtless tattooed + black leather lace-up (22%)
// 2: Mitch Baker black leather biker vest + beard (16%)
// 3: Phil Cassidy black sleeveless tank + bare arms (12%)
// 4: SWAT all-black rubber/tactical gear (10%)
// 5: Candy Suxxx minimal bikini (8%)
// 6: Mercedes black leather corset + magenta skirt (6%)
// 7: Percy red leather lace-up + glam (4%)
const VC_ARCHETYPE_WEIGHTS = [0.22, 0.22, 0.16, 0.12, 0.10, 0.08, 0.06, 0.04] as const;
const VC_ARCHETYPE_COUNT = VC_ARCHETYPE_WEIGHTS.length;

// Horse coat tints (multiplied onto bright-base horse head vertex colors for varied bay/chestnut/dark coats).
const HORSE_COATS = [0x965834, 0xb06236, 0x563522, 0xc8995a, 0x3a302c, 0xaba6a0, 0x7c4426];

export interface Spot {
  x: number;
  z: number;
  r: number;
}

export class Crowd {
  readonly root = new THREE.Group();
  private n = 0;
  private home: number[] = [];
  private pos: number[] = [];
  private vel: number[] = [];
  private phase: number[] = [];
  private yaw: number[] = [];
  private hop: number[] = [];
  private horseRank: number[] = [];
  private queue: boolean[] = [];
  /** Where each dancer started; their spot drifts around it. */
  private origin: number[] = [];
  private drift: number[] = [];
  /** 0 bob, 1 side step, 2 twist, 3 big jumper. */
  private style: number[] = [];
  /** 0 human, 1 horse, 2 unicorn (rarest), 3 donkey. Animals are guests, not the trip effect. */
  private species: number[] = [];
  private slot: number[] = [];
  /** Floor height. 0 is the dance floor. Gallery guests stand at 9. */
  private baseY: number[] = [];
  private outfit: number[] = [];
  private pants: number[] = [];
  private skinHex: number[] = [];
  private hairHex: number[] = [];
  private scaleY: number[] = [];
  /** Berliner archetype index 0..7 for human dancers (species === 0), -1 for animal guests. */
  private vcArchetype: number[] = [];
  /** Instance slot within vcMeshes[vcArchetype[i]] for human dancers, -1 for animal guests. */
  private vcSlot: number[] = [];
  private vcCounts: number[] = Array(VC_ARCHETYPE_COUNT).fill(0);
  private vcMeshes: (THREE.InstancedMesh | null)[] = Array(VC_ARCHETYPE_COUNT).fill(null);
  private clothes: THREE.InstancedMesh;
  private armL: THREE.InstancedMesh;
  private armR: THREE.InstancedMesh;
  private legL: THREE.InstancedMesh;
  private legR: THREE.InstancedMesh;
  private humanHead: THREE.InstancedMesh | null = null;
  private hair: THREE.InstancedMesh | null = null;
  private tripHead: THREE.InstancedMesh | null = null;
  private guestHorse: THREE.InstancedMesh | null = null;
  private guestUni: THREE.InstancedMesh | null = null;
  private guestUniHorn: THREE.InstancedMesh | null = null;
  private guestDonkey: THREE.InstancedMesh | null = null;
  private uniHornMat: THREE.MeshStandardMaterial | null = null;
  private hash = new Map<number, number[]>();
  private dummy = new THREE.Object3D();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private t = 0;
  private cheer = 0;
  private faceTarget: { x: number; z: number } | null;

  constructor(level: LevelData, avoid: Spot[]) {
    const rand = mulberry(47);
    const zoneOf = (col: number, row: number): ZoneId | null => {
      for (const [zone, [[c0, r0], [c1, r1]]] of Object.entries(level.zones) as [ZoneId, [[number, number], [number, number]]][]) {
        if (col >= c0 && col <= c1 && row >= r0 && row <= r1) return zone;
      }
      return null;
    };
    const booth = level.markers.dj_booth;
    this.faceTarget = booth ? cellCenter(booth[0], booth[1]) : null;

    const add = (x: number, z: number, queue = false, y = 0) => {
      if (y === 0 && avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) return;
      this.home.push(x, z);
      this.origin.push(x, z);
      this.drift.push(x, z);
      this.pos.push(x, z);
      this.baseY.push(y);
      const r = rand();
      this.style.push(queue ? 0 : r < 0.38 ? 0 : r < 0.68 ? 1 : r < 0.88 ? 2 : 3);
      // Species is assigned in a deterministic pass after all spots are generated.
      this.species.push(0);

      const skins = [0xf0c7a8, 0xe0b08a, 0xc68642, 0x8d5524, 0x6b3e26, 0x4a2c1a, 0xf3d2b5];
      const hairs = [0x14110e, 0x2a2118, 0x6b4a32, 0xc4a05a, 0x8a8a8a, 0x1a1a1a, 0x4c2b1e];
      const skin = skins[Math.floor(rand() * skins.length)] ?? skins[0];
      const hair = hairs[Math.floor(rand() * hairs.length)] ?? hairs[0];

      // Berlin gay techno club palette for equine guests, fallback clubbers & trip-hallucination bodies:
      // ~85% shirtless bare skin / black leather / dark charcoal / harness, ~15% subtle dark burgundy/navy/plum accents.
      const oc = rand();
      const pantsRoll = rand();
      let topHex: number;
      let pantsHex: number;
      if (oc < 0.32) {
        topHex = skin; // shirtless bare skin + dark chest harness texture
        pantsHex = pantsRoll < 0.72 ? 0x111216 : 0x1c1e25;
      } else if (oc < 0.64) {
        topHex = 0x121318; // matte black leather / rubber
        pantsHex = pantsRoll < 0.75 ? 0x0f1015 : 0x1b1d24;
      } else if (oc < 0.85) {
        topHex = 0x20222a; // dark charcoal / harness slate
        pantsHex = pantsRoll < 0.65 ? 0x121318 : 0x232630;
      } else if (oc < 0.92) {
        topHex = 0x3a1622; // deep oxblood / dark burgundy
        pantsHex = 0x121318;
      } else if (oc < 0.97) {
        topHex = 0x162033; // midnight navy
        pantsHex = pantsRoll < 0.65 ? 0x12151e : 0x1f2b3d;
      } else {
        topHex = 0x2a1832; // dark aubergine / muted plum
        pantsHex = 0x13141a;
      }
      this.outfit.push(topHex);
      this.pants.push(pantsHex);
      this.skinHex.push(skin);
      this.hairHex.push(hair);
      this.vel.push(0, 0);
      this.phase.push(rand() * Math.PI * 2);
      this.yaw.push(rand() * Math.PI * 2);
      // Most dancers hop on the beat, some on the off beat, some barely move.
      this.hop.push(rand() < 0.15 ? 0.02 : 0.05 + rand() * 0.12);
      this.horseRank.push(rand());
      this.queue.push(queue);
      this.n++;
    };

    // Keep clear of the ground-floor Panorama Bar Selector stand ([8, 10]), bar doorway, gate_shortcut ([13, 9]), and rare ghoul ([15, 7]).
    const floorSpotBlocked = (x: number, z: number) =>
      (x - 51.7) ** 2 + (z - 63.7) ** 2 < 1.55 ** 2 ||
      (x >= 85.8 && x <= 88.2 && z >= 30.0 && z <= 36.2) ||
      (x - 81) ** 2 + (z - 53.5) ** 2 < 1.85 ** 2 ||
      (x - 93.4) ** 2 + (z - 45.8) ** 2 < 1.5 ** 2;

    const density = { ...DEFAULT_DENSITY, ...(level.crowd ?? {}) };
    level.grid.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        const name = level.legend[ch];
        if (!name || NO_DANCE.has(name)) return;
        const zone = zoneOf(col, row);
        const d = zone ? density[zone] ?? 0 : 0;
        const count = Math.floor(d + rand());
        const c = cellCenter(col, row);
        const clear = KEEP_CLEAR[name] ?? 0;
        for (let i = 0; i < count; i++) {
          for (let tries = 0; tries < 6; tries++) {
            const x = c.x + (rand() - 0.5) * (CELL - 0.8);
            const z = c.z + (rand() - 0.5) * (CELL - 0.8);
            if (clear && Math.hypot(x - c.x, z - c.z) < clear) continue;
            if (floorSpotBlocked(x, z)) continue;
            add(x, z);
            break;
          }
        }
      });
    });

    // Overcrowded Berghain toilets: a dense, buzzing multi-row staggered queue along the cubicles
    // plus tight social clusters around toilet_corridor, while keeping squeezable paths clear.
    const q = level.zones.toilet_corridor;
    if (q) {
      const xMin = (q[0][0] + 1) * CELL + 0.85; // col 12 left edge (~72.85)
      const zCubicleFront = q[0][1] * CELL + CELL - 1.55; // row 5 south edge (~34.45)

      // 3-row staggered queue in front of cubicles [12,5] & [13,5] (~28-32 people), plus right-cubicle queue (~6-7 people).
      const rows = [
        { z: zCubicleFront, x0: xMin, x1: xMin + 12.1, step: 0.98 },
        { z: zCubicleFront + 1.08, x0: xMin + 0.45, x1: xMin + 12.2, step: 1.02 },
        { z: zCubicleFront + 2.15, x0: xMin + 0.2, x1: xMin + 12.2, step: 1.12 },
      ];
      for (const rowSpec of rows) {
        for (let x = rowSpec.x0; x <= rowSpec.x1; x += rowSpec.step) {
          const qx = x + (rand() - 0.5) * 0.26;
          const qz = rowSpec.z + (rand() - 0.5) * 0.28;
          if (!floorSpotBlocked(qx, qz)) add(qx, qz, true);
        }
      }
      // Right cubicle [15,5] mini-queue past the bar doorway.
      for (let x = 89.2; x <= 95.0; x += 1.08) {
        const qx = x + (rand() - 0.5) * 0.2;
        const qz = zCubicleFront + (rand() - 0.5) * 0.24;
        if (!floorSpotBlocked(qx, qz)) add(qx, qz, true);
      }
      for (let x = 89.7; x <= 94.6; x += 1.35) {
        const qx = x + (rand() - 0.5) * 0.22;
        const qz = zCubicleFront + 1.05 + (rand() - 0.5) * 0.24;
        if (!floorSpotBlocked(qx, qz)) add(qx, qz, true);
      }

      // Extra buzzing clusters hanging out & chatting in the green toilet light.
      const clusters: [number, number, number, number, number][] = [
        [79.2, 85.0, 39.2, 46.8, 1.45],
        [89.2, 94.8, 41.5, 49.4, 1.55],
        [73.2, 77.6, 43.2, 51.0, 1.55],
      ];
      for (const [cx0, cx1, cz0, cz1, step] of clusters) {
        for (let z = cz0; z <= cz1; z += step) {
          for (let x = cx0; x <= cx1; x += step) {
            if (rand() < 0.24) continue;
            const px = x + (rand() - 0.5) * 0.45;
            const pz = z + (rand() - 0.5) * 0.45;
            if (!floorSpotBlocked(px, pz)) add(px, pz, false);
          }
        }
      }
    }

    // Floor 1: the 9 m galleries and catwalk. Strictly inside walkable decks from src/world/galleries.ts,
    // kept well clear of rails, hall pillars, the top stair opening (x = 25.5..29.1, z = 47.5..53.5),
    // the upstairs Panorama Bar DJ console at (33, 51.3), and the pano_bar counter (x > 60.2, z > 51.9).
    const pillars: { x: number; z: number }[] = [];
    level.grid.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        if (level.legend[ch] === 'hall_pillar') pillars.push(cellCenter(col, row));
      });
    });
    const inWalkableDeck = (x: number, z: number) =>
      GALLERY_DECKS.some(
        (dk) => x >= dk.minX + GALLERY_MARGIN && x <= dk.maxX - GALLERY_MARGIN && z >= dk.minZ + GALLERY_MARGIN && z <= dk.maxZ - GALLERY_MARGIN,
      );
    const deckBlocked = (x: number, z: number) =>
      !inWalkableDeck(x, z) ||
      pillars.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.5 ** 2) ||
      (x > 24.0 && x < 30.6 && z > 46.0 && z < 54.0) ||
      (x - 33) ** 2 + (z - 51.3) ** 2 < 1.85 ** 2 ||
      (x > 60.2 && z > 51.9);
    const column = (x: number, z0: number, z1: number) => {
      for (let z = z0; z <= z1; z += 2.6) if (!deckBlocked(x, z)) add(x, z, false, GALLERY_Y);
    };
    column(8.6, 15, 46);
    column(10.8, 15, 46);
    column(61.2, 15, 46);
    column(63.8, 15, 46);
    // Lively, packed upstairs Panorama Bar along SOUTH_DECK (z = 48..53, y = 9.0).
    const southRows = [
      { z: 48.9, offset: 0 },
      { z: 50.35, offset: 0.72 },
      { z: 51.8, offset: 0.35 },
    ];
    for (const rowSpec of southRows) {
      for (let x = 8.4 + rowSpec.offset; x <= 63.8; x += 1.45) {
        const gx = x + (rand() - 0.5) * 0.36;
        const gz = rowSpec.z + (rand() - 0.5) * 0.28;
        if (!deckBlocked(gx, gz)) add(gx, gz, false, GALLERY_Y);
      }
    }
    for (let x = 16; x <= 56; x += 3.4) if (!deckBlocked(x, 28.2)) add(x, 28.2, false, GALLERY_Y);

    // Deterministic species distribution:
    // ~5% horses, ~2% donkeys, and very rare unicorns (capped at 1..2 total across the club).
    const order = Array.from({ length: this.n }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const uniTarget = this.n >= 2 ? Math.max(1, Math.min(2, Math.round(this.n * 0.005))) : 0;
    const horseTarget = Math.round(this.n * 0.05);
    const donkeyTarget = Math.round(this.n * 0.02);

    // Spread the rare unicorns out on the dance floors (prefer floor 0, well spaced apart) so finding one feels magical.
    const uniPicked: number[] = [];
    const pickUnicorn = (minDist: number, floorZeroOnly: boolean) => {
      for (const idx of order) {
        if (uniPicked.length >= uniTarget) break;
        if (this.species[idx] !== 0 || this.queue[idx]) continue;
        if (floorZeroOnly && this.baseY[idx] !== 0) continue;
        const ux = this.origin[idx * 2];
        const uz = this.origin[idx * 2 + 1];
        if (uniPicked.some((u) => Math.hypot(this.origin[u * 2] - ux, this.origin[u * 2 + 1] - uz) < minDist)) continue;
        this.species[idx] = 2;
        uniPicked.push(idx);
        // Dark-club obsidian / muted deep plum body for the rare unicorns so the pearlescent head + glowing golden horn pop.
        this.outfit[idx] = uniPicked.length % 2 === 0 ? 0x242230 : 0x31203d;
        this.pants[idx] = 0x13131b;
      }
    };
    pickUnicorn(9, true);
    pickUnicorn(4, false);
    pickUnicorn(0, false);

    let horsesLeft = horseTarget;
    let donkeysLeft = donkeyTarget;
    for (const idx of order) {
      if (this.species[idx] !== 0) continue;
      if (horsesLeft > 0) {
        this.species[idx] = 1;
        horsesLeft--;
      } else if (donkeysLeft > 0) {
        this.species[idx] = 3;
        donkeysLeft--;
      } else {
        break;
      }
    }

    const counts = [0, 0, 0, 0];
    this.slot = this.species.map((s) => counts[s]++);

    // Deterministic horsey archetype assignment for human dancers (species === 0)
    // using the already-shuffled `order` so archetypes are organically mixed across all rooms and galleries.
    this.vcArchetype = new Array(this.n).fill(-1);
    this.vcSlot = new Array(this.n).fill(-1);
    this.vcCounts = new Array(VC_ARCHETYPE_COUNT).fill(0);
    const humanIndices = order.filter((idx) => this.species[idx] === 0);
    const totalHumans = humanIndices.length;
    let assigned = 0;
    let cumWeight = 0;
    for (let k = 0; k < VC_ARCHETYPE_COUNT; k++) {
      cumWeight += VC_ARCHETYPE_WEIGHTS[k];
      const targetEnd = k === VC_ARCHETYPE_COUNT - 1 ? totalHumans : Math.round(totalHumans * cumWeight);
      for (let p = assigned; p < targetEnd; p++) {
        const idx = humanIndices[p];
        this.vcArchetype[idx] = k;
        this.vcSlot[idx] = this.vcCounts[k]++;
      }
      assigned = targetEnd;
    }

    // Subtle natural height variation (0.94..1.06) so the crowd feels organic, not cloned.
    this.scaleY = Array.from({ length: this.n }, () => 0.94 + rand() * 0.12);

    // Procedural PS2-era retro textures.
    const clothTex = makeClothesTexture();
    const pantsTex = makePantsTexture();
    const faceTex = makeFaceTexture();
    const hairTex = makeHairTexture();

    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: clothTex,
      roughness: 0.62,
      metalness: 0.14,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: pantsTex,
      roughness: 0.72,
      metalness: 0.08,
      vertexColors: true,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      vertexColors: true,
    });
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.78,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hairTex,
      roughness: 0.68,
    });
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      vertexColors: true,
    });
    const uniCoatMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x261d36,
      emissiveIntensity: 0.28,
      roughness: 0.44,
      metalness: 0.1,
      vertexColors: true,
    });
    this.uniHornMat = new THREE.MeshStandardMaterial({
      color: 0xffe484,
      emissive: 0xffb830,
      emissiveIntensity: 1.35,
      roughness: 0.22,
      metalness: 0.68,
    });

    const n = Math.max(this.n, 1);
    this.clothes = makeMesh(clothesGeo(), clothMat, n);
    this.armL = makeMesh(armGeo(), skinMat, n);
    this.armR = makeMesh(armGeo(), skinMat, n);
    this.legL = makeMesh(legGeo(), pantsMat, n);
    this.legR = makeMesh(legGeo(), pantsMat, n);
    this.root.add(this.clothes, this.armL, this.armR, this.legL, this.legR);

    const white = new THREE.Color(0xffffff);
    const tmpColor = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      tmpColor.setHex(this.outfit[i]);
      this.clothes.setColorAt(i, tmpColor);
      tmpColor.setHex(this.pants[i]);
      this.legL.setColorAt(i, tmpColor);
      this.legR.setColorAt(i, tmpColor);
      tmpColor.setHex(this.skinHex[i]);
      this.armL.setColorAt(i, tmpColor);
      this.armR.setColorAt(i, tmpColor);
    }

    const paintHumans = (m: THREE.InstancedMesh, hexes: number[]) => {
      for (let i = 0; i < this.n; i++) {
        if (this.species[i] === 0) {
          tmpColor.setHex(hexes[i]);
          m.setColorAt(this.slot[i], tmpColor);
        }
      }
    };

    this.humanHead = addSpecies(this, headGeo(), faceMat, counts[0]);
    this.hair = addSpecies(this, hairGeo(), hairMat, counts[0]);
    this.tripHead = addSpecies(this, equineGeo('horse'), coatMat, counts[0]);
    this.guestHorse = addSpecies(this, equineGeo('horse'), coatMat, counts[1]);
    this.guestUni = addSpecies(this, equineGeo('unicorn'), uniCoatMat, counts[2]);
    this.guestUniHorn = addSpecies(this, unicornHornGeo(), this.uniHornMat, counts[2]);
    this.guestDonkey = addSpecies(this, equineGeo('donkey'), coatMat, counts[3]);

    if (this.humanHead) paintHumans(this.humanHead, this.skinHex);
    if (this.hair) paintHumans(this.hair, this.hairHex);

    // Varied bay/chestnut/dark coats for horses and hallucinated trip horses.
    if (this.tripHead) {
      for (let s = 0; s < this.tripHead.count; s++) {
        tmpColor.setHex(HORSE_COATS[Math.floor(rand() * HORSE_COATS.length)] ?? HORSE_COATS[0]);
        this.tripHead.setColorAt(s, tmpColor);
      }
    }
    if (this.guestHorse) {
      for (let s = 0; s < this.guestHorse.count; s++) {
        tmpColor.setHex(HORSE_COATS[s % HORSE_COATS.length]);
        this.guestHorse.setColorAt(s, tmpColor);
      }
    }
    for (const m of [this.guestUni, this.guestUniHorn, this.guestDonkey]) {
      if (!m) continue;
      for (let s = 0; s < m.count; s++) m.setColorAt(s, white);
    }

    for (const m of [
      this.clothes, this.armL, this.armR, this.legL, this.legR,
      this.humanHead, this.hair, this.tripHead,
      this.guestHorse, this.guestUni, this.guestUniHorn, this.guestDonkey,
    ]) {
      if (m?.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Kick off async loading for the 8 horsey crowd archetypes (crowd_0.glb .. crowd_7.glb).
    // Each archetype swaps seamlessly from procedural fallback to InstancedMesh as soon as its GLB loads;
    // missing or failing GLBs cleanly remain on the procedural fallback without crashing.
    this.loadHorseyArchetypes();
  }

  private loadHorseyArchetypes(): void {
    const base = import.meta.env?.BASE_URL ?? '/';
    for (let k = 0; k < VC_ARCHETYPE_COUNT; k++) {
      const count = this.vcCounts[k];
      if (count <= 0) continue;
      const url = `${base}models/crowd_${k}.glb`;
      try {
        _gltfLoader
          .loadAsync(url)
          .then((gltf) => {
            gltf.scene.updateMatrixWorld(true);
            let firstMesh: THREE.Mesh | null = null;
            gltf.scene.traverse((child) => {
              if (firstMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.isMesh && mesh.geometry?.attributes?.position?.count > 0) {
                firstMesh = mesh;
              }
            });
            if (!firstMesh) return;
            const found = firstMesh as THREE.Mesh;
            const rawMat = Array.isArray(found.material) ? found.material[0] : found.material;
            if (!rawMat) return;

            const geo = found.geometry.clone();
            if (!found.matrixWorld.equals(_identityMatrix)) {
              geo.applyMatrix4(found.matrixWorld);
            }
            geo.computeBoundingSphere();

            const mat = rawMat.clone();
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.78;
              mat.metalness = Math.min(mat.metalness, 0.12);
              // Keep embedded horsey textures subtly readable in Berghain's dark club lighting.
              if (!mat.emissiveMap && mat.map) mat.emissiveMap = mat.map;
              mat.emissive.setRGB(
                Math.max(mat.emissive.r, 0.08),
                Math.max(mat.emissive.g, 0.08),
                Math.max(mat.emissive.b, 0.08),
              );
              mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1);
              mat.needsUpdate = true;
            }

            const inst = makeMesh(geo, mat, count);
            // Hide all slots until the next update() writes live dancer transforms (prevents origin-cluster flash).
            for (let s = 0; s < count; s++) inst.setMatrixAt(s, this.hidden);
            inst.instanceMatrix.needsUpdate = true;
            this.root.add(inst);
            this.vcMeshes[k] = inst;
          })
          .catch(() => {
            // Missing or unreadable crowd GLB: cleanly keep procedural fallback.
          });
      } catch {
        // Guard non-browser environments where loader/fetch throws synchronously.
      }
    }
  }

  get count(): number {
    return this.n;
  }

  /** Everyone faces the DJ booth anyway, but this makes them stop and stare. */
  turnTo(x: number, z: number): void {
    this.faceTarget = { x, z };
    this.cheer = 3;
  }

  cheerNow(seconds = 2): void {
    this.cheer = Math.max(this.cheer, seconds);
  }

  /** Nearest animal guest within maxD of (x, z) on the dance floor: 1 horse, 2 unicorn, 3 donkey, else 0. */
  animalNear(x: number, z: number, maxD: number): number {
    let best = 0;
    let bestD = maxD;
    for (let i = 0; i < this.n; i++) {
      const sp = this.species[i];
      if (sp === 0 || this.baseY[i] !== 0) continue;
      const d = Math.hypot(this.origin[i * 2] - x, this.origin[i * 2 + 1] - z);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    return best;
  }

  update(dt: number, beatPulse: number, beatN = 0): void {
    this.t += dt;
    this.cheer = Math.max(0, this.cheer - dt);
    // Real guest horses & donkeys are always present (~18%); hallucination horse heads ramp smoothly with trip.
    const horseShare = (state.trip / TRIP_MAX) * 0.8;
    const pulse = beatPulse * beatPulse;
    const frenzy = state.finale ? 1.6 : 1;
    if (this.uniHornMat) {
      this.uniHornMat.emissiveIntensity = 1.15 + Math.sin(this.t * 2.6) * 0.25 + pulse * 0.45;
    }
    this.hash.clear();
    const d = this.dummy;

    const side = beatN % 2 === 0 ? 1 : -1;
    for (let i = 0; i < this.n; i++) {
      const ix = i * 2;
      const onGallery = this.baseY[i] > 0;
      // Shuffle around: now and then pick a new spot near where they started, and drift there slowly.
      if (!this.queue[i]) {
        if (Math.random() < dt * 0.12) {
          const a = Math.random() * Math.PI * 2;
          // Gallery dancers stay tighter to origin so they never drift near rails, pillars, or stairs.
          const r = Math.random() * (onGallery ? 0.45 : 1.1);
          this.drift[ix] = this.origin[ix] + Math.cos(a) * r;
          this.drift[ix + 1] = this.origin[ix + 1] + Math.sin(a) * r;
        }
        this.home[ix] += (this.drift[ix] - this.home[ix]) * Math.min(1, dt * 0.4);
        this.home[ix + 1] += (this.drift[ix + 1] - this.home[ix + 1]) * Math.min(1, dt * 0.4);
      }
      // Spring back home after being pushed.
      this.vel[ix] += (this.home[ix] - this.pos[ix]) * 4 * dt;
      this.vel[ix + 1] += (this.home[ix + 1] - this.pos[ix + 1]) * 4 * dt;
      this.vel[ix] *= Math.exp(-5 * dt);
      this.vel[ix + 1] *= Math.exp(-5 * dt);
      this.pos[ix] += this.vel[ix] * dt;
      this.pos[ix + 1] += this.vel[ix + 1] * dt;
      if (onGallery) {
        // Hard-clamp gallery dancers within 0.7 m of origin so shoves never push them over a railing.
        const dx = this.pos[ix] - this.origin[ix];
        const dz = this.pos[ix + 1] - this.origin[ix + 1];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.7) {
          this.pos[ix] = this.origin[ix] + (dx / dist) * 0.7;
          this.pos[ix + 1] = this.origin[ix + 1] + (dz / dist) * 0.7;
        }
      }
      const x = this.pos[ix];
      const z = this.pos[ix + 1];

      const key = hashKey(x, z);
      const list = this.hash.get(key);
      if (list) list.push(i);
      else this.hash.set(key, [i]);

      const queue = this.queue[i];
      const ph = this.phase[i];
      let yaw = this.yaw[i] + Math.sin(this.t * 0.5 + ph) * 0.3;
      if (this.faceTarget && !queue && Math.hypot(this.faceTarget.x - x, this.faceTarget.z - z) < 30) {
        yaw = Math.atan2(this.faceTarget.x - x, this.faceTarget.z - z) + Math.sin(this.t * 0.7 + ph) * 0.4;
      }
      if (queue) yaw = -Math.PI / 2 + Math.sin(ph * 3.7) * 0.45 + Math.sin(this.t * 0.45 + ph) * 0.14;
      const style = this.style[i];
      const big = style === 3 ? 2.4 : 1;
      const jump = queue ? 0 : pulse * this.hop[i] * frenzy * big + (this.cheer > 0 ? Math.abs(Math.sin(this.t * 9 + ph)) * 0.28 : 0);
      const sway = Math.sin(this.t * 2.2 + ph) * (queue ? 0.03 : 0.09) * frenzy;
      // Side steppers move left and right with the beat; twisters swing their hips.
      const stepOut = style === 1 ? side * (onGallery ? 0.1 : 0.16) * (1 - pulse * 0.5) : 0;
      if (style === 2) yaw += Math.sin(beatN * Math.PI * 0.5 + ph) * 0.5;

      const px = x + Math.cos(yaw) * stepOut;
      const pz = z - Math.sin(yaw) * stepOut;
      const py = this.baseY[i] + jump;
      const sp = this.species[i];
      const s = this.slot[i];
      const horseTrip = sp === 0 && this.horseRank[i] < horseShare;
      const arch = sp === 0 ? this.vcArchetype[i] : -1;
      const vcMesh = arch >= 0 ? this.vcMeshes[arch] : null;
      const useVc = sp === 0 && !horseTrip && vcMesh !== null;

      if (useVc) {
        // Horsey instanced dancer: energetic beat bounce, hip sway, forward/back groove,
        // twist, side-steps, kick squash-and-stretch, and subtle natural height variation.
        const vcPitch = queue ? Math.sin(this.t * 2.4 + ph) * 0.025 : Math.sin(this.t * 6.2 + ph) * 0.08 * frenzy;
        const b = queue ? 0 : Math.min(1.5, pulse * frenzy);
        const sx = 1 + b * 0.03;
        const sy = this.scaleY[i] * (1 - b * 0.04);
        const sz = 1 + b * 0.03;
        d.position.set(px, py, pz);
        d.rotation.order = 'YXZ';
        d.rotation.set(vcPitch, yaw, sway);
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
        vcMesh.setMatrixAt(this.vcSlot[i], d.matrix);

        // Hide procedural fallback body & heads for this dancer.
        this.clothes.setMatrixAt(i, this.hidden);
        this.armL.setMatrixAt(i, this.hidden);
        this.armR.setMatrixAt(i, this.hidden);
        this.legL.setMatrixAt(i, this.hidden);
        this.legR.setMatrixAt(i, this.hidden);
        this.humanHead?.setMatrixAt(s, this.hidden);
        this.hair?.setMatrixAt(s, this.hidden);
        this.tripHead?.setMatrixAt(s, this.hidden);
      } else {
        // Hide horsey human instance when hallucinating horse-head on trip.
        if (vcMesh) vcMesh.setMatrixAt(this.vcSlot[i], this.hidden);

        const stride = Math.sin(this.t * (queue ? 2.4 : 6.2) + ph) * (queue ? 0.16 : 0.52 + pulse * 0.22);
        const pitch = stride * 0.1;

        _torsoEuler.set(pitch, yaw, sway, 'YXZ');
        d.position.set(px, py, pz);
        d.rotation.copy(_torsoEuler);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        _bodyMatrix.copy(d.matrix);
        this.clothes.setMatrixAt(i, _bodyMatrix);

        // Update head matrices using the exact torso matrix BEFORE limbAt() mutates `d`.
        if (sp === 0) {
          this.humanHead?.setMatrixAt(s, horseTrip ? this.hidden : _bodyMatrix);
          this.hair?.setMatrixAt(s, horseTrip ? this.hidden : _bodyMatrix);
          this.tripHead?.setMatrixAt(s, horseTrip ? _bodyMatrix : this.hidden);
        } else if (sp === 1) {
          this.guestHorse?.setMatrixAt(s, _bodyMatrix);
        } else if (sp === 2) {
          this.guestUni?.setMatrixAt(s, _bodyMatrix);
          this.guestUniHorn?.setMatrixAt(s, _bodyMatrix);
        } else {
          this.guestDonkey?.setMatrixAt(s, _bodyMatrix);
        }

        // Limbs stay locked to exact shoulder/hip sockets rotated by torso Euler (pitch, yaw, sway).
        const armSwing = stride * 0.78;
        const cheerLift = this.cheer > 0 ? -1.85 - Math.abs(Math.sin(this.t * 8 + ph)) * 0.4 : 0;
        const armLift = queue ? 0 : cheerLift || (style === 3 ? -0.58 - pulse * 0.35 : -0.18 - pulse * 0.16);
        limbAt(this.legL, i, d, px, py, pz, pitch * 0.25, yaw, sway * 0.4, -0.105, 0.80, 0, stride * 0.82, 0);
        limbAt(this.legR, i, d, px, py, pz, pitch * 0.25, yaw, sway * 0.4, 0.105, 0.80, 0, -stride * 0.82, 0);
        limbAt(this.armL, i, d, px, py, pz, pitch, yaw, sway, -0.245, 1.28, 0, armLift - armSwing, -0.09);
        limbAt(this.armR, i, d, px, py, pz, pitch, yaw, sway, 0.245, 1.28, 0, armLift + armSwing, 0.09);
      }
    }

    for (const m of [
      this.clothes, this.armL, this.armR, this.legL, this.legR,
      this.humanHead, this.hair, this.tripHead,
      this.guestHorse, this.guestUni, this.guestUniHorn, this.guestDonkey,
    ]) {
      if (m) m.instanceMatrix.needsUpdate = true;
    }
    for (const m of this.vcMeshes) {
      if (m) m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Push the horse out of dancers and shove them a little. Returns true on a real bump. Mutates pos. */
  push(pos: THREE.Vector3, radius: number, playerY = 0): boolean {
    let bumped = false;
    const min = radius + RADIUS;
    this.near(pos.x, pos.z, (i) => {
      if (Math.abs(this.baseY[i] - playerY) > 2.2) return;
      const ix = i * 2;
      const dx = pos.x - this.pos[ix];
      const dz = pos.z - this.pos[ix + 1];
      const dist = Math.hypot(dx, dz);
      if (dist >= min || dist < 1e-5) return;
      const overlap = min - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      // Dancers give way a bit; the horse gets shoved the rest.
      pos.x += nx * overlap * 0.55;
      pos.z += nz * overlap * 0.55;
      this.vel[ix] -= nx * overlap * 6;
      this.vel[ix + 1] -= nz * overlap * 6;
      if (overlap > 0.08) bumped = true;
    });
    return bumped;
  }

  /**
   * Keep a ring clear around (x, z) on this floor: anyone inside is set on the ring's edge.
   * Called every frame while you talk to someone, so no dancer walks through the conversation camera.
   */
  clearRing(x: number, z: number, radius: number, y = 0): void {
    const n = this.pos.length / 2;
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.baseY[i] - y) > 2.2) continue;
      const ix = i * 2;
      const dx = this.pos[ix] - x;
      const dz = this.pos[ix + 1] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      const d = Math.sqrt(d2);
      // Dead centre: pick a fixed direction from the index so they don't all stack on one side.
      const nx = d > 1e-4 ? dx / d : Math.cos(i);
      const nz = d > 1e-4 ? dz / d : Math.sin(i);
      this.pos[ix] = x + nx * radius;
      this.pos[ix + 1] = z + nz * radius;
      this.vel[ix] = 0;
      this.vel[ix + 1] = 0;
    }
  }

  /** True if one of the rare unicorns is within range on the same floor. */
  nearUnicorn(x: number, z: number, playerY = 0, range = 2.4): boolean {
    let found = false;
    const r2 = range * range;
    this.near(x, z, (i) => {
      if (found || this.species[i] !== 2) return;
      if (Math.abs(this.baseY[i] - playerY) > 2.2) return;
      const dx = this.pos[i * 2] - x;
      const dz = this.pos[i * 2 + 1] - z;
      if (dx * dx + dz * dz < r2) found = true;
    });
    return found;
  }

  /** True if a dancer stands at (x, z). Used to block torch beams. */
  blocks(x: number, z: number): boolean {
    let hit = false;
    this.near(x, z, (i) => {
      if (this.baseY[i] > 3) return;
      if (!hit && (this.pos[i * 2] - x) ** 2 + (this.pos[i * 2 + 1] - z) ** 2 < 0.38 * 0.38) hit = true;
    });
    return hit;
  }

  private near(x: number, z: number, fn: (i: number) => void): void {
    const cx = Math.floor(x / HASH);
    const cz = Math.floor(z / HASH);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = this.hash.get((cx + ox) * 100000 + (cz + oz));
        if (list) for (const i of list) fn(i);
      }
    }
  }
}

/**
 * Place one limb locked to its torso socket.
 * Rotates local joint offset (ox, oy, oz) by the module-level _torsoEuler (pitch, yaw, sway) in 'YXZ' order
 * so shoulders and hips stay 100% attached to the swaying, pitching torso with zero GC allocations.
 */
function limbAt(
  mesh: THREE.InstancedMesh,
  index: number,
  d: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  pitch: number,
  yaw: number,
  sway: number,
  ox: number,
  oy: number,
  oz: number,
  swing: number,
  splay: number,
): void {
  _joint.set(ox, oy, oz).applyEuler(_torsoEuler);
  d.position.set(x + _joint.x, y + _joint.y, z + _joint.z);
  d.rotation.order = 'YXZ';
  d.rotation.set(pitch + swing, yaw, sway + splay);
  d.updateMatrix();
  mesh.setMatrixAt(index, d.matrix);
}

function makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  return m;
}

function addSpecies(crowd: Crowd, geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh | null {
  if (count <= 0) {
    geo.dispose();
    return null;
  }
  const m = makeMesh(geo, mat, count);
  crowd.root.add(m);
  return m;
}

// ---------- Low-poly PS2 geometry builders ----------

interface RingSpec {
  y: number;
  rx: number;
  rz: number;
  xOff?: number;
  zOff?: number;
}

/**
 * Build a watertight, UV-mapped tapered low-poly silhouette from stacked elliptical rings.
 * UV u = 0.5 faces exact +Z (front center); UV seam sits cleanly on the back (-Z).
 */
function ringGeo(rings: RingSpec[], segs = 8): THREE.BufferGeometry {
  const rows = rings.length;
  const cols = segs + 1;
  const minY = rings[0].y;
  const spanY = Math.max(1e-4, rings[rows - 1].y - minY);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    const v = (ring.y - minY) / spanY;
    const xo = ring.xOff ?? 0;
    const zo = ring.zOff ?? 0;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const a = (u - 0.5) * Math.PI * 2; // u=0.5 => a=0 => (0, +rz) front +Z
      positions.push(xo + Math.sin(a) * ring.rx, ring.y, zo + Math.cos(a) * ring.rz);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    const base = r * cols;
    const next = (r + 1) * cols;
    for (let s = 0; s < segs; s++) {
      const a = base + s;
      const b = base + s + 1;
      const c = next + s + 1;
      const d = next + s;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Bottom cap
  const botCenter = positions.length / 3;
  positions.push(rings[0].xOff ?? 0, rings[0].y, rings[0].zOff ?? 0);
  uvs.push(0.5, 0);
  for (let s = 0; s < segs; s++) {
    indices.push(botCenter, s + 1, s);
  }

  // Top cap
  const topCenter = positions.length / 3;
  const topStart = (rows - 1) * cols;
  const topRing = rings[rows - 1];
  positions.push(topRing.xOff ?? 0, topRing.y, topRing.zOff ?? 0);
  uvs.push(0.5, 1);
  for (let s = 0; s < segs; s++) {
    indices.push(topCenter, topStart + s, topStart + s + 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function taperCyl(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segs = 7,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function sphere(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Tapered athletic PS2 club torso with broad shoulders, V-taper waist, pelvis, and shoulder caps (works for both shirtless harness and dark leather clubwear). */
function clothesGeo(): THREE.BufferGeometry {
  const torso = ringGeo(
    [
      { y: 0.72, rx: 0.145, rz: 0.095 },
      { y: 0.82, rx: 0.188, rz: 0.118 },
      { y: 0.94, rx: 0.165, rz: 0.106 },
      { y: 1.12, rx: 0.215, rz: 0.126, zOff: 0.01 },
      { y: 1.29, rx: 0.252, rz: 0.128, zOff: 0.005 },
      { y: 1.36, rx: 0.184, rz: 0.102 },
      { y: 1.40, rx: 0.095, rz: 0.086 },
    ],
    8,
  );
  // Rounded deltoid / shoulder caps centered cleanly on the arm pivots (±0.245, 1.28, 0).
  const capL = sphere(0.084, -0.236, 1.28, 0, 0.94, 1.02, 0.98);
  const capR = sphere(0.084, 0.236, 1.28, 0, 0.94, 1.02, 0.98);
  return mergeGeometries([torso, capL, capR], false)!;
}

/** Chunky tapered PS2 arm hanging from shoulder origin (0, 0, 0) with rounded deltoid, angled elbow, and blocky hand. */
function armGeo(): THREE.BufferGeometry {
  const limb = paint(
    ringGeo(
      [
        { y: -0.57, rx: 0.032, rz: 0.042, zOff: 0.062 }, // fingertips
        { y: -0.50, rx: 0.048, rz: 0.064, zOff: 0.056 }, // blocky PS2 palm/knuckles
        { y: -0.45, rx: 0.038, rz: 0.040, zOff: 0.044 }, // wrist
        { y: -0.39, rx: 0.050, rz: 0.052, zOff: 0.036 }, // forearm
        { y: -0.26, rx: 0.058, rz: 0.060, zOff: 0.016 }, // elbow
        { y: -0.12, rx: 0.066, rz: 0.066, zOff: 0.004 }, // bicep
        { y: 0.0, rx: 0.072, rz: 0.072 },                // shoulder joint
        { y: 0.045, rx: 0.046, rz: 0.046 },              // upper deltoid tucked in socket
      ],
      7,
    ),
    0xffffff,
  );
  // Subtle chunky watch / wristband ring at the wrist.
  const watch = paint(taperCyl(0.043, 0.043, 0.028, 0, -0.44, 0.044, 7), 0x424248);
  return mergeGeometries([limb, watch], false)!;
}

/** Chunky tapered PS2 trouser leg + wedge shoe, hanging from hip origin (0, 0, 0) to sole at y = -0.80. */
function legGeo(): THREE.BufferGeometry {
  const trouser = paint(
    ringGeo(
      [
        { y: -0.71, rx: 0.064, rz: 0.070 },               // cuff
        { y: -0.56, rx: 0.070, rz: 0.075, zOff: -0.004 }, // calf
        { y: -0.40, rx: 0.076, rz: 0.082, zOff: 0.012 },  // knee
        { y: -0.20, rx: 0.088, rz: 0.094, zOff: 0.006 },  // mid thigh
        { y: 0.0, rx: 0.098, rz: 0.102 },                 // hip
        { y: 0.055, rx: 0.072, rz: 0.072 },               // hip ball tucked in pelvis
      ],
      7,
    ),
    0xffffff,
  );
  // Chunky wedge shoe / boot with sloped toe box and sole.
  const shoeHeel = paint(box(0.128, 0.082, 0.145, 0, -0.758, 0.01), 0x2c2d34);
  const shoeToe = paint(box(0.118, 0.058, 0.105, 0, -0.77, 0.105, 0.16, 0, 0), 0x2c2d34);
  const shoeSole = paint(box(0.132, 0.022, 0.245, 0, -0.79, 0.045), 0x52545e);
  return mergeGeometries([trouser, shoeHeel, shoeToe, shoeSole], false)!;
}

/** Faceted chiseled horsey PS2-style human head with neck, nose, and low-poly ears. */
function headGeo(): THREE.BufferGeometry {
  const cranium = ringGeo(
    [
      { y: 1.44, rx: 0.052, rz: 0.068, zOff: 0.032 }, // chiseled chin
      { y: 1.49, rx: 0.094, rz: 0.104, zOff: 0.026 }, // jawline
      { y: 1.565, rx: 0.115, rz: 0.124, zOff: 0.022 }, // cheekbones
      { y: 1.635, rx: 0.112, rz: 0.125, zOff: 0.018 }, // brow / temples
      { y: 1.695, rx: 0.095, rz: 0.108, zOff: 0.010 }, // upper forehead
      { y: 1.735, rx: 0.056, rz: 0.066, zOff: 0.004 }, // crown
    ],
    8,
  );
  const neck = taperCyl(0.062, 0.070, 0.12, 0, 1.41, 0.012, 7);
  const nose = box(0.034, 0.056, 0.046, 0, 1.565, 0.138, -0.18, 0, 0);
  const earL = box(0.026, 0.058, 0.036, -0.116, 1.575, 0.012, 0, 0, 0.12);
  const earR = box(0.026, 0.058, 0.036, 0.116, 1.575, 0.012, 0, 0, -0.12);
  return mergeGeometries([cranium, neck, nose, earL, earR], false)!;
}

/** Chunky 80s PS2 hair cap: swept front pompadour, feathered back/nape, and sideburns. */
function hairGeo(): THREE.BufferGeometry {
  const crown = ringGeo(
    [
      { y: 1.63, rx: 0.122, rz: 0.132, zOff: 0.008 },
      { y: 1.70, rx: 0.118, rz: 0.132, zOff: 0.014 },
      { y: 1.755, rx: 0.092, rz: 0.110, zOff: 0.018 },
      { y: 1.78, rx: 0.048, rz: 0.060, zOff: 0.012 },
    ],
    8,
  );
  // Swept 80s front wave / fringe.
  const pompadour = box(0.175, 0.072, 0.095, 0, 1.725, 0.095, -0.22, 0, 0);
  // Feathered back hair covering the nape.
  const backHair = box(0.185, 0.175, 0.082, 0, 1.565, -0.088, 0.14, 0, 0);
  // Chunky sideburns / temple locks.
  const sideL = box(0.042, 0.11, 0.085, -0.112, 1.62, -0.015, 0.08, 0, 0.08);
  const sideR = box(0.042, 0.11, 0.085, 0.112, 1.62, -0.015, 0.08, 0, -0.08);
  return mergeGeometries([crown, pompadour, backHair, sideL, sideR], false)!;
}

/**
 * Sculpted tapered equine heads:
 * - horse: neutral-bright base tinted per-instance into varied bay/chestnut/dark coats, arched mane, upright ears.
 * - donkey: grey-taupe coat, unmistakable pale cream muzzle, dark shaggy upright mane, extra-long splayed ears!
 * - unicorn: pure pearlescent white coat, flowing silver-lavender mane (horn is a separate glowing InstancedMesh).
 */
function equineGeo(kind: 'horse' | 'unicorn' | 'donkey'): THREE.BufferGeometry {
  const isDonkey = kind === 'donkey';
  const isUni = kind === 'unicorn';
  // Horse uses bright neutral base so per-instance color tints bay/chestnut/dark coats cleanly.
  const coat = isUni ? 0xf6f4fc : isDonkey ? 0x86848a : 0xe8dfd5;
  const muzzleCoat = isUni ? 0xefe7f0 : isDonkey ? 0xe0d8c8 : 0xcab8a8;
  const mane = isUni ? 0xc2b0e8 : isDonkey ? 0x262326 : 0x2a201a;
  const innerEar = isUni ? 0xe5bedb : isDonkey ? 0xc8c0b6 : 0xb59586;
  const eyeHex = isUni ? 0x1c1830 : 0x141212;
  const nostrilHex = 0x1a1515;

  const parts: THREE.BufferGeometry[] = [];

  // Thick arched equine neck emerging from the collar.
  parts.push(
    paint(
      ringGeo(
        [
          { y: 1.35, rx: 0.095, rz: 0.108, zOff: -0.01 },
          { y: 1.46, rx: 0.088, rz: 0.102, zOff: 0.005 },
          { y: 1.56, rx: 0.082, rz: 0.098, zOff: 0.018 },
        ],
        7,
      ),
      coat,
    ),
  );

  // Sculpted tapered cranium + cheek/jowl.
  parts.push(
    paint(
      ringGeo(
        [
          { y: 1.50, rx: 0.092, rz: 0.112, zOff: 0.032 },
          { y: 1.59, rx: isUni ? 0.104 : 0.114, rz: 0.132, zOff: 0.042 },
          { y: 1.68, rx: 0.096, rz: 0.118, zOff: 0.036 },
          { y: 1.74, rx: 0.068, rz: 0.082, zOff: 0.022 },
        ],
        7,
      ),
      coat,
    ),
  );

  // Elongated angled tapered snout/muzzle pointing forward (+Z) and slightly down.
  const snoutLen = isDonkey ? 0.21 : isUni ? 0.25 : 0.24;
  const snoutTopR = isDonkey ? 0.084 : 0.080;
  const snoutTipR = isDonkey ? 0.070 : 0.056;
  const snoutMid = taperCyl(snoutTipR, snoutTopR, snoutLen, 0, 1.545, 0.185, 7, Math.PI * 0.5 + 0.34, 0, 0);
  parts.push(paint(snoutMid, coat));

  // Distinct pale/shaded muzzle tip + jawline chin + dark nostrils.
  const muzzleZ = isDonkey ? 0.285 : 0.305;
  const muzzleY = isDonkey ? 1.505 : 1.495;
  parts.push(paint(box(isDonkey ? 0.125 : 0.106, isDonkey ? 0.10 : 0.088, 0.095, 0, muzzleY, muzzleZ, 0.30, 0, 0), muzzleCoat));
  // Lower jaw / chin taper.
  parts.push(paint(box(0.085, 0.05, 0.16, 0, 1.49, 0.19, 0.28, 0, 0), coat));
  // Nostrils.
  parts.push(paint(sphere(0.017, -0.034, muzzleY + 0.008, muzzleZ + 0.044, 0.9, 1.1, 0.6), nostrilHex));
  parts.push(paint(sphere(0.017, 0.034, muzzleY + 0.008, muzzleZ + 0.044, 0.9, 1.1, 0.6), nostrilHex));

  // Subtle white blaze on horses' bridge of nose.
  if (kind === 'horse') {
    parts.push(paint(box(0.026, 0.012, 0.15, 0, 1.595, 0.19, 0.36, 0, 0), 0xf6f0e8));
  }

  // Expressive side-set equine eyes (plus pale eye rings on donkeys).
  if (isDonkey) {
    parts.push(paint(sphere(0.032, -0.095, 1.635, 0.095, 0.65, 1.0, 1.0), muzzleCoat));
    parts.push(paint(sphere(0.032, 0.095, 1.635, 0.095, 0.65, 1.0, 1.0), muzzleCoat));
  }
  parts.push(paint(sphere(0.022, -0.102, 1.635, 0.102), eyeHex));
  parts.push(paint(sphere(0.022, 0.102, 1.635, 0.102), eyeHex));

  // Ears: unmistakable long splayed ears for donkeys, sleek pointed upright ears for horses & unicorns.
  if (isDonkey) {
    // Extra-long splayed donkey ears (~0.34 m tall, tilted outward ~28 deg!).
    const earH = 0.34;
    parts.push(paint(taperCyl(0.016, 0.044, earH, -0.135, 1.855, 0.005, 6, -0.14, 0, 0.48), coat));
    parts.push(paint(taperCyl(0.016, 0.044, earH, 0.135, 1.855, 0.005, 6, -0.14, 0, -0.48), coat));
    // Pale inner-ear strips facing forward.
    parts.push(paint(box(0.028, 0.24, 0.012, -0.128, 1.845, 0.030, -0.14, 0, 0.48), innerEar));
    parts.push(paint(box(0.028, 0.24, 0.012, 0.128, 1.845, 0.030, -0.14, 0, -0.48), innerEar));
    // Dark ear tips.
    parts.push(paint(taperCyl(0.008, 0.022, 0.07, -0.202, 1.995, -0.015, 6, -0.14, 0, 0.48), mane));
    parts.push(paint(taperCyl(0.008, 0.022, 0.07, 0.202, 1.995, -0.015, 6, -0.14, 0, -0.48), mane));
  } else {
    const earH = isUni ? 0.165 : 0.145;
    parts.push(paint(taperCyl(0.009, 0.038, earH, -0.075, 1.795, 0.018, 6, 0.15, 0, 0.16), coat));
    parts.push(paint(taperCyl(0.009, 0.038, earH, 0.075, 1.795, 0.018, 6, 0.15, 0, -0.16), coat));
    parts.push(paint(box(0.022, earH * 0.65, 0.01, -0.073, 1.79, 0.038, 0.15, 0, 0.16), innerEar));
    parts.push(paint(box(0.022, earH * 0.65, 0.01, 0.073, 1.79, 0.038, 0.15, 0, -0.16), innerEar));
  }

  // Sculpted arched mane crest running from forelock down the back of the neck.
  if (isUni) {
    // Flowing layered silver-lavender unicorn mane + bright forelock tuft.
    parts.push(paint(box(0.068, 0.11, 0.085, 0, 1.74, -0.035, 0.25, 0, 0), 0xe2d8ff));
    parts.push(paint(box(0.074, 0.14, 0.105, 0, 1.63, -0.088, 0.18, 0, 0), mane));
    parts.push(paint(box(0.080, 0.16, 0.11, 0, 1.49, -0.115, 0.10, 0, 0), mane));
    parts.push(paint(box(0.072, 0.11, 0.09, 0, 1.38, -0.118, 0.05, 0, 0), 0xd8ccff));
  } else if (isDonkey) {
    // Dark shaggy upright brush mane along the donkey's crest.
    parts.push(paint(box(0.055, 0.10, 0.09, 0, 1.74, -0.025, 0.15, 0, 0), mane));
    parts.push(paint(box(0.052, 0.14, 0.085, 0, 1.61, -0.078, 0.12, 0, 0), mane));
    parts.push(paint(box(0.050, 0.14, 0.08, 0, 1.47, -0.098, 0.08, 0, 0), mane));
  } else {
    // Arched horse mane crest + forelock tuft.
    parts.push(paint(box(0.056, 0.085, 0.08, 0, 1.745, 0.035, -0.35, 0, 0), mane));
    parts.push(paint(box(0.062, 0.13, 0.095, 0, 1.67, -0.065, 0.22, 0, 0), mane));
    parts.push(paint(box(0.066, 0.15, 0.10, 0, 1.54, -0.102, 0.15, 0, 0), mane));
    parts.push(paint(box(0.062, 0.12, 0.09, 0, 1.41, -0.112, 0.08, 0, 0), mane));
  }

  return mergeGeometries(parts, false)!;
}

/** Prominent tapered glowing golden spiral horn for the rare unicorns (separate emissive InstancedMesh). */
function unicornHornGeo(): THREE.BufferGeometry {
  const segs = 7;
  const totalLen = 0.39;
  const step = totalLen / segs;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    // Slight ridge bulge on each fluted segment to read as a spiral twist.
    const rBot = 0.036 * (1 - t0 * 0.86);
    const rTop = 0.031 * (1 - t1 * 0.90);
    const yLocal = (i + 0.5) * step;
    const g = new THREE.CylinderGeometry(Math.max(0.003, rTop), Math.max(0.005, rBot), step * 1.06, 6);
    g.rotateY(i * 0.55); // spiral twist per flute
    g.translate(0, yLocal, 0);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  // Angle ~28 deg forward from the unicorn's forehead so the golden horn gleams above the crowd.
  merged.rotateX(0.48);
  merged.translate(0, 1.69, 0.115);
  return merged;
}

// ---------- Procedural PS2 CanvasTextures ----------

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  return [c, g];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Berlin techno club torso texture: clean tintable base (bare skin or black leather) with dark leather chest harness straps, center O-ring, and studded belt. */
function makeClothesTexture(): THREE.CanvasTexture | null {
  const pair = makeCanvas(128, 128);
  if (!pair) return null;
  const [c, g] = pair;

  // Bright neutral base so both shirtless skinHex and black/charcoal leather outfit tints read cleanly.
  g.fillStyle = '#eceae8';
  g.fillRect(0, 0, 128, 128);

  // Subtle athletic chest/rib shading & side contour AO (u = 0.25 -> x = 32, u = 0.75 -> x = 96).
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(29, 10, 6, 86);
  g.fillRect(93, 10, 6, 86);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(62, 20, 4, 62);
  g.fillRect(42, 42, 44, 4);

  // Dark leather chest harness straps crossing at center chest (u = 0.5 -> x = 64).
  g.strokeStyle = '#1b1c22';
  g.lineWidth = 6;
  g.beginPath();
  // Diagonal shoulder-to-chest straps
  g.moveTo(42, 4);
  g.lineTo(64, 46);
  g.lineTo(86, 4);
  // Horizontal chest band wrapping torso
  g.moveTo(0, 46);
  g.lineTo(128, 46);
  // Center sternum strap down to belt
  g.moveTo(64, 46);
  g.lineTo(64, 98);
  g.stroke();

  // Metallic silver O-ring at chest harness center & buckle studs.
  g.strokeStyle = '#c8cbd4';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(64, 46, 6, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#b4b8c2';
  for (const sx of [20, 44, 84, 108]) {
    g.fillRect(sx, 44, 3, 3);
  }

  // Heavy black leather waist belt & metallic buckle at bottom.
  g.fillStyle = '#18191f';
  g.fillRect(0, 95, 128, 13);
  g.fillStyle = '#d4d6de';
  g.fillRect(57, 97, 14, 9);
  g.fillStyle = '#1d1e24';
  g.fillRect(60, 99, 8, 5);

  // Pelvis / hem shadow.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 108, 128, 20);

  return toTexture(c);
}

/** Retro PS2 denim/trouser texture with outer seams, knee highlight, and cuff fold. */
function makePantsTexture(): THREE.CanvasTexture | null {
  const pair = makeCanvas(64, 64);
  if (!pair) return null;
  const [c, g] = pair;

  g.fillStyle = '#ececf0';
  g.fillRect(0, 0, 64, 64);

  // Subtle vertical denim grain.
  for (let x = 0; x < 64; x += 4) {
    g.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, 0, 2, 64);
  }
  // Outer leg seams.
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.fillRect(15, 0, 2, 64);
  g.fillRect(47, 0, 2, 64);
  // Subtle knee fade & cuff shadow.
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(22, 26, 20, 12);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 56, 64, 8);
  g.fillRect(0, 0, 64, 6);

  return toTexture(c);
}

/** Retro PS2 painted face texture centered at u = 0.5 (x = 64): eyes, brows, cheekbones, lips. */
function makeFaceTexture(): THREE.CanvasTexture | null {
  const pair = makeCanvas(128, 128);
  if (!pair) return null;
  const [c, g] = pair;

  // Bright neutral skin base (tinted per-dancer by skinHex).
  g.fillStyle = '#f2efec';
  g.fillRect(0, 0, 128, 128);

  // Subtle hairline & under-jaw shading.
  g.fillStyle = 'rgba(30,22,18,0.26)';
  g.fillRect(0, 0, 128, 18);
  g.fillStyle = 'rgba(42,26,20,0.2)';
  g.fillRect(0, 106, 128, 22);

  // Chiseled PS2 cheekbone & brow-socket shading.
  g.fillStyle = 'rgba(72,44,34,0.15)';
  g.fillRect(42, 46, 18, 14);
  g.fillRect(68, 46, 18, 14);
  g.fillRect(44, 70, 12, 18);
  g.fillRect(72, 70, 12, 18);

  // Bold retro PS2 eyebrows.
  g.fillStyle = '#281f1a';
  g.fillRect(45, 42, 14, 4);
  g.fillRect(69, 42, 14, 4);

  // Crisp PS2 eyes: eyelid, white sclera, dark iris, specular pixel.
  for (const ex of [47, 71]) {
    g.fillStyle = '#5c463e';
    g.fillRect(ex - 1, 50, 12, 9);
    g.fillStyle = '#ffffff';
    g.fillRect(ex, 52, 10, 6);
    g.fillStyle = '#141214';
    g.fillRect(ex + 3, 52, 5, 6);
    g.fillStyle = '#ffffff';
    g.fillRect(ex + 4, 53, 2, 2);
  }

  // Nose bridge shadow & nostrils.
  g.fillStyle = 'rgba(60,36,28,0.2)';
  g.fillRect(62, 54, 4, 22);
  g.fillStyle = 'rgba(45,25,20,0.45)';
  g.fillRect(60, 74, 3, 3);
  g.fillRect(65, 74, 3, 3);

  // Painted mouth / lips.
  g.fillStyle = '#a4746e';
  g.fillRect(55, 88, 18, 6);
  g.fillStyle = '#482c28';
  g.fillRect(56, 90, 16, 2);

  return toTexture(c);
}

/** Combed 80s PS2 hair strand texture. */
function makeHairTexture(): THREE.CanvasTexture | null {
  const pair = makeCanvas(64, 64);
  if (!pair) return null;
  const [c, g] = pair;

  g.fillStyle = '#dcdad8';
  g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 3) {
    g.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.24)';
    g.fillRect(x, 0, 2, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 52, 64, 12);

  return toTexture(c);
}

function hashKey(x: number, z: number): number {
  return Math.floor(x / HASH) * 100000 + Math.floor(z / HASH);
}

/** Small seeded random, so the crowd is the same every run. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
