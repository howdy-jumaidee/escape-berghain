// The crowd. Berghain is packed: a few hundred dancers drawn in one batch (instanced), thickest on the main floor.
// They dance on the beat, push the horse around, block security torches (hide in the crowd),
// and the higher your trip, the more of them have horse heads.
// Shared low-poly body, colour variants, and a few animal guests (horse, unicorn, donkey).
// Named characters are separate glTFs loaded through placeModel(). Instancing keeps this crowd cheap.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state, cellCenter, CELL, TRIP_MAX, type ZoneId } from '../contracts';
import type { LevelData } from '../data';

const DEFAULT_DENSITY: Partial<Record<ZoneId, number>> = {
  main_hall: 3.2,
  panorama_bar: 1.6,
  bar_cloakroom: 0.7,
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
  /** 0 human, 1 horse, 2 unicorn, 3 donkey. Animals are guests, not the trip effect. */
  private species: number[] = [];
  private slot: number[] = [];
  /** Floor height. 0 is the dance floor. Gallery guests stand at 9. */
  private baseY: number[] = [];
  private outfit: number[] = [];
  private skinHex: number[] = [];
  private hairHex: number[] = [];
  private clothes: THREE.InstancedMesh;
  private skin: THREE.InstancedMesh;
  private humanHead: THREE.InstancedMesh | null = null;
  private hair: THREE.InstancedMesh | null = null;
  private eyes: THREE.InstancedMesh | null = null;
  private tripHead: THREE.InstancedMesh | null = null;
  private guestHorse: THREE.InstancedMesh | null = null;
  private guestUni: THREE.InstancedMesh | null = null;
  private guestDonkey: THREE.InstancedMesh | null = null;
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
      if (avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) return;
      this.home.push(x, z);
      this.origin.push(x, z);
      this.drift.push(x, z);
      this.pos.push(x, z);
      this.baseY.push(y);
      const r = rand();
      this.style.push(queue ? 0 : r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3);
      const roll = rand();
      const cut = queue ? 0.16 : 0.1;
      this.species.push(roll < cut ? (roll < cut * 0.34 ? 1 : roll < cut * 0.67 ? 2 : 3) : 0);
      const oc = rand();
      this.outfit.push(
        oc < 0.62 ? 0x121216 : oc < 0.74 ? 0xc4476a : oc < 0.84 ? 0x1f8f86 : oc < 0.92 ? 0xd7a441 : oc < 0.96 ? 0x3a4e72 : 0xd8d4cc,
      );
      const skins = [0xf0c7a8, 0xe0b08a, 0xc68642, 0x8d5524, 0x6b3e26, 0x4a2c1a, 0xf3d2b5];
      const hairs = [0x14110e, 0x2a2118, 0x6b4a32, 0xc4a05a, 0x8a8a8a, 0x1a1a1a];
      this.skinHex.push(skins[Math.floor(rand() * skins.length)] ?? skins[0]);
      this.hairHex.push(hairs[Math.floor(rand() * hairs.length)] ?? hairs[0]);
      this.vel.push(0, 0);
      this.phase.push(rand() * Math.PI * 2);
      this.yaw.push(rand() * Math.PI * 2);
      // Most dancers hop on the beat, some on the off beat, some barely move.
      this.hop.push(rand() < 0.15 ? 0.02 : 0.05 + rand() * 0.12);
      this.horseRank.push(rand());
      this.queue.push(queue);
      this.n++;
    };

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
            add(x, z);
            break;
          }
        }
      });
    });

    // The toilet queue: a line along the cubicles, leaving the doorway from the bar free.
    const q = level.zones.toilet_corridor;
    if (q) {
      const z = q[0][1] * CELL + CELL + 1.2;
      for (let x = (q[0][0] + 1) * CELL + 1; x < q[0][0] * CELL + 11.5; x += 1.05) add(x, z + (rand() - 0.5) * 0.3, true);
    }

    // Floor 1: the 9 m galleries and catwalk. Same guests as downstairs, kept in from the rails.
    // Rectangles match the walkable decks in src/world/galleries.ts. Stairs stay clear.
    const pillars: { x: number; z: number }[] = [];
    level.grid.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        if (level.legend[ch] === 'hall_pillar') pillars.push(cellCenter(col, row));
      });
    });
    const deckBlocked = (x: number, z: number) =>
      pillars.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.4 ** 2) || (x > 24.2 && x < 30.4 && z > 46 && z < 54);
    const GY = 9;
    const column = (x: number, z0: number, z1: number) => {
      for (let z = z0; z <= z1; z += 2.6) if (!deckBlocked(x, z)) add(x, z, false, GY);
    };
    column(8.6, 15, 46);
    column(10.8, 15, 46);
    column(61.2, 15, 46);
    column(63.8, 15, 46);
    for (let x = 10; x <= 62; x += 2.6) {
      if (!deckBlocked(x, 49.3)) add(x, 49.3, false, GY);
      if (!deckBlocked(x, 51.7)) add(x, 51.7, false, GY);
    }
    for (let x = 16; x <= 56; x += 3.4) if (!deckBlocked(x, 28.2)) add(x, 28.2, false, GY);

    const counts = [0, 0, 0, 0];
    this.slot = this.species.map((s) => counts[s]++);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.12 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 });
    const coatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true });
    this.clothes = makeMesh(clothesGeo(), clothMat, Math.max(this.n, 1));
    this.skin = makeMesh(skinGeo(), skinMat, Math.max(this.n, 1));
    this.root.add(this.clothes, this.skin);
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < this.n; i++) {
      this.clothes.setColorAt(i, new THREE.Color(this.outfit[i]));
      this.skin.setColorAt(i, new THREE.Color(this.skinHex[i]));
    }
    const paintHumans = (m: THREE.InstancedMesh, hexes: number[]) => {
      for (let i = 0; i < this.n; i++) if (this.species[i] === 0) m.setColorAt(this.slot[i], new THREE.Color(hexes[i]));
    };
    this.humanHead = addSpecies(this, headGeo(), skinMat, counts[0]);
    this.hair = addSpecies(this, hairGeo(), hairMat, counts[0]);
    this.eyes = addSpecies(this, eyesGeo(), eyeMat, counts[0]);
    this.tripHead = addSpecies(this, equineGeo('horse'), coatMat, counts[0]);
    this.guestHorse = addSpecies(this, equineGeo('horse'), coatMat, counts[1]);
    this.guestUni = addSpecies(this, equineGeo('unicorn'), coatMat, counts[2]);
    this.guestDonkey = addSpecies(this, equineGeo('donkey'), coatMat, counts[3]);
    if (this.humanHead) paintHumans(this.humanHead, this.skinHex);
    if (this.hair) paintHumans(this.hair, this.hairHex);
    for (const m of [this.tripHead, this.guestHorse, this.guestUni, this.guestDonkey]) {
      if (!m) continue;
      for (let s = 0; s < m.count; s++) m.setColorAt(s, white);
    }
    for (const m of [this.clothes, this.skin, this.humanHead, this.hair, this.eyes, this.tripHead, this.guestHorse, this.guestUni, this.guestDonkey]) {
      if (m?.instanceColor) m.instanceColor.needsUpdate = true;
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

  update(dt: number, beatPulse: number, beatN = 0): void {
    this.t += dt;
    this.cheer = Math.max(0, this.cheer - dt);
    const horseShare = 0.1 + (state.trip / TRIP_MAX) * 0.75;
    const pulse = beatPulse * beatPulse;
    const frenzy = state.finale ? 1.6 : 1;
    this.hash.clear();
    const d = this.dummy;

    const side = beatN % 2 === 0 ? 1 : -1;
    for (let i = 0; i < this.n; i++) {
      const ix = i * 2;
      // Shuffle around: now and then pick a new spot near where they started, and drift there slowly.
      if (!this.queue[i]) {
        if (Math.random() < dt * 0.12) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 1.1;
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
      if (queue) yaw = -Math.PI / 2 + Math.sin(this.t * 0.3 + ph) * 0.1;
      const style = this.style[i];
      const big = style === 3 ? 2.6 : 1;
      const jump = queue ? 0 : pulse * this.hop[i] * frenzy * big + (this.cheer > 0 ? Math.abs(Math.sin(this.t * 9 + ph)) * 0.3 : 0);
      const sway = Math.sin(this.t * 2.2 + ph) * (queue ? 0.03 : 0.09) * frenzy;
      // Side steppers move left and right with the beat; twisters swing their hips.
      const stepOut = style === 1 ? side * 0.16 * (1 - pulse * 0.5) : 0;
      if (style === 2) yaw += Math.sin(beatN * Math.PI * 0.5 + ph) * 0.5;

      d.position.set(x + Math.cos(yaw) * stepOut, this.baseY[i] + jump, z - Math.sin(yaw) * stepOut);
      d.rotation.set(0, yaw, sway);
      d.updateMatrix();
      this.clothes.setMatrixAt(i, d.matrix);
      this.skin.setMatrixAt(i, d.matrix);
      const sp = this.species[i];
      const s = this.slot[i];
      if (sp === 0) {
        const horse = this.horseRank[i] < horseShare;
        this.humanHead?.setMatrixAt(s, horse ? this.hidden : d.matrix);
        this.hair?.setMatrixAt(s, horse ? this.hidden : d.matrix);
        this.eyes?.setMatrixAt(s, horse ? this.hidden : d.matrix);
        this.tripHead?.setMatrixAt(s, horse ? d.matrix : this.hidden);
      } else if (sp === 1) this.guestHorse?.setMatrixAt(s, d.matrix);
      else if (sp === 2) this.guestUni?.setMatrixAt(s, d.matrix);
      else this.guestDonkey?.setMatrixAt(s, d.matrix);
    }
    for (const m of [this.clothes, this.skin, this.humanHead, this.hair, this.eyes, this.tripHead, this.guestHorse, this.guestUni, this.guestDonkey]) {
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

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(r: number, h: number, x: number, y: number, z: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.9, h, 6);
  g.translate(x, y, z);
  return g;
}

function sphere(r: number, x: number, y: number, z: number): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  g.translate(x, y, z);
  return g;
}

function clothesGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    cyl(0.07, 0.74, -0.09, 0.4, 0),
    cyl(0.07, 0.74, 0.09, 0.4, 0),
    box(0.12, 0.06, 0.18, -0.09, 0.03, 0.03),
    box(0.12, 0.06, 0.18, 0.09, 0.03, 0.03),
    box(0.3, 0.16, 0.16, 0, 0.82, 0),
    box(0.34, 0.4, 0.18, 0, 1.1, 0),
    box(0.44, 0.1, 0.16, 0, 1.32, 0),
  ])!;
}

function skinGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    cyl(0.045, 0.46, -0.24, 1.08, 0),
    cyl(0.045, 0.46, 0.24, 1.08, 0),
  ])!;
}

function headGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    cyl(0.055, 0.1, 0, 1.4, 0.02),
    sphere(0.115, 0, 1.56, 0.02),
    box(0.04, 0.045, 0.04, 0, 1.5, 0.12),
  ])!;
}

function hairGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.12, 7, 5);
  g.scale(1, 0.55, 1);
  g.translate(0, 1.66, 0);
  return g;
}

function eyesGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    sphere(0.02, -0.045, 1.58, 0.12),
    sphere(0.02, 0.045, 1.58, 0.12),
  ])!;
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

function equineGeo(kind: 'horse' | 'unicorn' | 'donkey'): THREE.BufferGeometry {
  const coat = kind === 'unicorn' ? 0xf3f0ea : kind === 'donkey' ? 0x8e8e94 : 0x6a4324;
  const mane = 0x1a120e;
  const earH = kind === 'donkey' ? 0.28 : 0.13;
  const parts = [
    paint(cyl(0.07, 0.16, 0, 1.42, 0.02), coat),
    paint(box(0.2, 0.18, 0.2, 0, 1.58, 0.04), coat),
    paint(box(kind === 'donkey' ? 0.12 : 0.1, 0.08, kind === 'donkey' ? 0.12 : 0.18, 0, 1.52, 0.18), coat),
    paint(box(0.04, earH, 0.04, -0.07, 1.74, 0.02), mane),
    paint(box(0.04, earH, 0.04, 0.07, 1.74, 0.02), mane),
    paint(box(0.07, 0.1, 0.06, 0, 1.66, -0.02), mane),
    paint(sphere(0.018, -0.045, 1.6, 0.14), 0x111111),
    paint(sphere(0.018, 0.045, 1.6, 0.14), 0x111111),
  ];
  if (kind === 'unicorn') {
    parts.push(paint(box(0.04, 0.14, 0.04, 0, 1.8, 0.06), 0xf6e7a8));
    parts.push(paint(box(0.02, 0.12, 0.02, 0, 1.92, 0.06), 0xfff4c8));
  }
  return mergeGeometries(parts, false)!;
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
