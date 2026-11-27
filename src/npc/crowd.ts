// The crowd. Berghain is packed: a few hundred dancers drawn in one batch (instanced), thickest on the main floor.
// They dance on the beat, push the horse around, block security torches (hide in the crowd),
// and the higher your trip, the more of them have horse heads.
// Model names for Emma: npc_dancer_body, npc_dancer_head, npc_dancer_horse_head are not loaded yet;
// instanced boxes keep this fast. Swap for real meshes in instanced form later.
import * as THREE from 'three';
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
const KEEP_CLEAR: Record<string, number> = { hall_pillar: 1.15, hall_speaker: 1.35 };

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
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private horseHeads: THREE.InstancedMesh;
  private hash = new Map<number, number[]>();
  private dummy = new THREE.Object3D();
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

    const add = (x: number, z: number, queue = false) => {
      if (avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) return;
      this.home.push(x, z);
      this.pos.push(x, z);
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
      for (let x = q[0][0] * CELL + 1; x < q[0][0] * CELL + 11.5; x += 1.05) add(x, z + (rand() - 0.5) * 0.3, true);
    }

    // Dark bodies so they read as silhouettes against the haze and strobes. A few pale shirts catch the light.
    const body = new THREE.BoxGeometry(0.5, 1.5, 0.3);
    body.translate(0, 0.75, 0);
    const head = new THREE.BoxGeometry(0.26, 0.3, 0.28);
    head.translate(0, 1.68, 0);
    const horseHead = new THREE.BoxGeometry(0.24, 0.3, 0.6);
    horseHead.translate(0, 1.72, 0.14);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), this.n);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.8 }), this.n);
    this.horseHeads = new THREE.InstancedMesh(horseHead, new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.8 }), this.n);
    const shirt = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      const r = rand();
      shirt.set(r < 0.7 ? 0x0c0c0e : r < 0.9 ? 0x26262a : 0x7a7a7a);
      this.bodies.setColorAt(i, shirt);
    }
    for (const m of [this.bodies, this.heads, this.horseHeads]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.root.add(m);
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

  update(dt: number, beatPulse: number): void {
    this.t += dt;
    this.cheer = Math.max(0, this.cheer - dt);
    const horseShare = 0.1 + (state.trip / TRIP_MAX) * 0.75;
    const pulse = beatPulse * beatPulse;
    const frenzy = state.finale ? 1.6 : 1;
    this.hash.clear();
    const d = this.dummy;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    for (let i = 0; i < this.n; i++) {
      const ix = i * 2;
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
      const jump = queue ? 0 : pulse * this.hop[i] * frenzy + (this.cheer > 0 ? Math.abs(Math.sin(this.t * 9 + ph)) * 0.3 : 0);
      const sway = Math.sin(this.t * 2.2 + ph) * (queue ? 0.03 : 0.09) * frenzy;

      d.position.set(x, jump, z);
      d.rotation.set(0, yaw, sway);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      const horse = this.horseRank[i] < horseShare;
      this.heads.setMatrixAt(i, horse ? hidden : d.matrix);
      this.horseHeads.setMatrixAt(i, horse ? d.matrix : hidden);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.horseHeads.instanceMatrix.needsUpdate = true;
  }

  /** Push the horse out of dancers and shove them a little. Returns true on a real bump. Mutates pos. */
  push(pos: THREE.Vector3, radius: number): boolean {
    let bumped = false;
    const min = radius + RADIUS;
    this.near(pos.x, pos.z, (i) => {
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
