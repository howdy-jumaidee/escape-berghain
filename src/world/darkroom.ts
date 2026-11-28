// World: the darkroom maze behind the toilets. ROADMAP "Labyrinth mystery".
// Grid in levels/darkroom.json (3 m tiles, half a CELL). Entered through the door cell [16, 6] in level1.json.
// No lights in here: every surface glows faintly, and the glow follows state.trip (higher = you see more).
// Shifter walls swap every 4 beats. Clues are flyers and stamps you read with Space. The far door is a
// secret way out to the back exit for horses carrying at least three memories.
// Talks to other systems only through the World class and the bus.
import * as THREE from 'three';
import { bus, state, TRIP_MAX, type TextKey } from '../contracts';
import { resolveCircle, type Collider } from './level';
import darkroomJson from '../../levels/darkroom.json';

export interface DarkroomData {
  originX: number;
  originZ: number;
  tile: number;
  wallHeight: number;
  /** Where the staff door lets you out, metres [x, z]. */
  exitTo: [number, number];
  legend: Record<string, string>;
  clues: Record<string, { kind: 'flyer' | 'stamp'; key: TextKey }>;
  grid: string[];
}

export const darkroomData = darkroomJson as unknown as DarkroomData;

/** Beats between wall swaps. */
const SWAP_EVERY = 4;
/** How long a shifter takes to slide up or down, seconds. */
const SLIDE_SECONDS = 0.3;
/** A wall never rises within this many metres of the horse's centre (the horse is long). */
const CRUSH_MARGIN = 1.1;
/** Sober is dark but never black: the glow never drops below this share of full. */
const GLOW_FLOOR = 0.2;
/** Trip at which the maze is fully lit. */
const GLOW_FULL_TRIP = 75;
const CLUE_RANGE = 2.2;
const EXIT_RANGE = 2.4;
/** Memories needed before the staff door opens. */
const EXIT_MEMORIES = 3;

// Deep colours only. Bloom turns bright pixels white in a dark scene.
const WALL_GLOW = 0x5a1a8c;
const SHIFT_GLOW = 0x8c1030;
const FLOOR_GLOW = 0x3a0f52;
const CLUE_GLOW = 0x7a3ab0;
const STAMP_GLOW = 0xa0183c;
const EXIT_GLOW = 0xa01428;

/** Peak emissive intensity per material at full trip. */
const WALL_PEAK = 2.6;
const FLOOR_PEAK = 1.6;
const CLUE_PEAK = 3.2;

export type Phase = 0 | 1;

/** True if the tile blocks the horse in this phase. Pure, so it can be checked without a scene. */
export function tileSolid(data: DarkroomData, col: number, row: number, phase: Phase): boolean {
  const ch = data.grid[row]?.[col];
  if (ch === undefined) return true;
  const name = data.legend[ch];
  if (!name || name === 'dark_wall' || name === 'dark_exit') return true;
  if (name === 'shift_a') return phase === 0;
  if (name === 'shift_b') return phase === 1;
  return false;
}

/** Tiles with this legend name. */
export function tilesOf(data: DarkroomData, name: string): [number, number][] {
  const out: [number, number][] = [];
  data.grid.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (data.legend[ch] === name) out.push([col, row]);
    });
  });
  return out;
}

/** Breadth-first walk from the entrance to the tile in front of the exit door. Pure. */
export function pathExists(data: DarkroomData, phase: Phase): boolean {
  const start = tilesOf(data, 'dark_entrance')[0];
  const exit = tilesOf(data, 'dark_exit')[0];
  if (!start || !exit) return false;
  const rows = data.grid.length;
  const cols = data.grid[0].length;
  const seen = new Uint8Array(rows * cols);
  const queue: number[] = [start[1] * cols + start[0]];
  seen[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const col = queue[i] % cols;
    const row = Math.floor(queue[i] / cols);
    if (Math.abs(col - exit[0]) + Math.abs(row - exit[1]) === 1) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const k = r * cols + c;
      if (seen[k] || tileSolid(data, c, r, phase)) continue;
      seen[k] = 1;
      queue.push(k);
    }
  }
  return false;
}

interface Shifter {
  set: Phase;
  collider: Collider;
  index: number;
  x: number;
  z: number;
  up: boolean;
  /** Current slide offset, 0 = standing, -depth = sunk into the floor. */
  y: number;
}

interface Clue {
  key: TextKey;
  x: number;
  z: number;
}

const dummy = new THREE.Object3D();

/** A tile-sized edge texture: bright border, dim middle. The glow reads as outlines in the dark. */
function edgeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1c1c';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 120);
  g.strokeStyle = '#5a5a5a';
  g.lineWidth = 3;
  g.strokeRect(16, 16, 96, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A flyer: a pale sheet with blocky "type" bars. No words: the words live in content/story.json. */
function flyerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 64, 96);
  g.fillStyle = '#ffffff';
  g.fillRect(6, 8, 52, 14);
  g.fillStyle = '#202020';
  for (let i = 0; i < 6; i++) g.fillRect(8, 32 + i * 9, 20 + ((i * 17) % 28), 4);
  g.fillRect(8, 84, 48, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A club stamp: a ring with a bar through it. */
function stampTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.fillRect(14, 29, 36, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowMaterial(glow: number, map: THREE.Texture, base = 0x060509): THREE.MeshStandardMaterial {
  // Near-black diffuse, so the hall's lights barely touch it. All you see is the emissive glow.
  return new THREE.MeshStandardMaterial({ color: base, roughness: 1, metalness: 0, emissive: glow, emissiveMap: map, emissiveIntensity: 1 });
}

export class Darkroom {
  readonly root = new THREE.Group();
  /** Static walls plus shifters. Shifters toggle `enabled` when they swap. */
  readonly colliders: Collider[] = [];
  /** Maze walls and ceiling height, metres. */
  readonly wallHeight = darkroomData.wallHeight;
  private readonly data = darkroomData;
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minZ: number;
  private readonly maxZ: number;
  private readonly depth: number;
  private shifters: Shifter[] = [];
  private shiftMesh: THREE.InstancedMesh | null = null;
  private sliding = false;
  private clues: Clue[] = [];
  private exit: { x: number; z: number } | null = null;
  private phase: Phase = 0;
  private player = new THREE.Vector3(-999, 0, -999);
  private pulse = 0;
  private entered = false;
  private shiftSeen = false;
  private shutCount = 0;
  private sayAt = -99;
  private t = 0;
  private wallMat: THREE.MeshStandardMaterial;
  private shiftMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private clueMat: THREE.MeshStandardMaterial;
  private stampMat: THREE.MeshStandardMaterial;
  private exitMat: THREE.MeshStandardMaterial;

  constructor() {
    this.root.name = 'darkroom';
    const d = this.data;
    const T = d.tile;
    const H = d.wallHeight;
    const rows = d.grid.length;
    const cols = Math.max(...d.grid.map((l) => l.length));
    this.minX = d.originX;
    this.maxX = d.originX + cols * T;
    this.minZ = d.originZ;
    this.maxZ = d.originZ + rows * T;
    this.depth = H + 0.15;

    const edge = edgeTexture();
    this.wallMat = glowMaterial(WALL_GLOW, edge);
    this.shiftMat = glowMaterial(SHIFT_GLOW, edge);
    const floorEdge = edge.clone();
    floorEdge.wrapS = floorEdge.wrapT = THREE.RepeatWrapping;
    floorEdge.repeat.set(cols, rows);
    floorEdge.needsUpdate = true;
    this.floorMat = glowMaterial(FLOOR_GLOW, floorEdge, 0x040306);
    this.clueMat = glowMaterial(CLUE_GLOW, flyerTexture());
    this.stampMat = glowMaterial(STAMP_GLOW, stampTexture());
    this.stampMat.transparent = true;
    this.stampMat.alphaMap = this.stampMat.emissiveMap;
    this.stampMat.depthWrite = false;
    this.exitMat = glowMaterial(EXIT_GLOW, edge);

    const center = (col: number, row: number) => ({ x: d.originX + (col + 0.5) * T, z: d.originZ + (row + 0.5) * T });
    const box = (col: number, row: number): Collider => ({
      minX: d.originX + col * T,
      maxX: d.originX + (col + 1) * T,
      minZ: d.originZ + row * T,
      maxZ: d.originZ + (row + 1) * T,
      height: H,
      enabled: true,
    });

    // Walls: one instanced mesh for all static tiles, one for the shifters.
    const statics: { x: number; z: number }[] = [];
    const shifts: { x: number; z: number; set: Phase; col: number; row: number }[] = [];
    d.grid.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        const name = d.legend[ch];
        const c = center(col, row);
        if (name === 'dark_wall' || name === 'dark_exit') {
          statics.push(c);
          this.colliders.push(box(col, row));
        } else if (name === 'shift_a' || name === 'shift_b') {
          shifts.push({ ...c, set: name === 'shift_a' ? 0 : 1, col, row });
        } else if (name?.startsWith('clue_')) {
          this.addClue(name, col, row, center);
        }
        if (name === 'dark_exit') this.addExit(col, row, center);
      });
    });

    const wallGeo = new THREE.BoxGeometry(T, H, T);
    wallGeo.translate(0, H / 2, 0);
    const walls = new THREE.InstancedMesh(wallGeo, this.wallMat, statics.length);
    statics.forEach((c, i) => {
      dummy.position.set(c.x, 0, c.z);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
    });
    walls.computeBoundingSphere();
    this.root.add(walls);

    if (shifts.length) {
      // Slightly thinner than a tile so a rising wall never z-fights its neighbours.
      const shiftGeo = new THREE.BoxGeometry(T - 0.06, H, T - 0.06);
      shiftGeo.translate(0, H / 2, 0);
      this.shiftMesh = new THREE.InstancedMesh(shiftGeo, this.shiftMat, shifts.length);
      this.shiftMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.shiftMesh.frustumCulled = false;
      shifts.forEach((s, index) => {
        const up = s.set === this.phase;
        const collider = box(s.col, s.row);
        collider.enabled = up;
        this.colliders.push(collider);
        this.shifters.push({ set: s.set, collider, index, x: s.x, z: s.z, up, y: up ? 0 : -this.depth });
      });
      this.writeShifters();
      this.root.add(this.shiftMesh);
    }

    // Floor and a low black ceiling. The ceiling keeps the hall's glow out.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.maxX - this.minX, this.maxZ - this.minZ), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((this.minX + this.maxX) / 2, -0.02, (this.minZ + this.maxZ) / 2);
    this.root.add(floor);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(this.maxX - this.minX, this.maxZ - this.minZ),
      new THREE.MeshBasicMaterial({ color: 0x020203 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((this.minX + this.maxX) / 2, H, (this.minZ + this.maxZ) / 2);
    this.root.add(ceiling);

    this.addDoorway();

    bus.on('player:moved', ({ x, z }) => this.player.set(x, 0, z));
    bus.on('beat', ({ n }) => {
      this.pulse = 1;
      if (n % SWAP_EVERY === 0) this.swap();
    });
    this.applyGlow();
  }

  /** True inside the maze footprint. */
  contains(x: number, z: number, margin = 0): boolean {
    return x >= this.minX - margin && x <= this.maxX + margin && z >= this.minZ - margin && z <= this.maxZ + margin;
  }

  /** Collision for the horse. Cheap when the horse is nowhere near. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number): void {
    if (!this.contains(pos.x, pos.z, radius + 1)) return;
    resolveCircle(this.colliders, pos, radius);
  }

  /** Something here answers Space: a clue or the exit door. */
  near(x: number, z: number): boolean {
    if (!this.contains(x, z, 1)) return false;
    for (const c of this.clues) if (Math.hypot(c.x - x, c.z - z) < CLUE_RANGE) return true;
    return !!this.exit && Math.hypot(this.exit.x - x, this.exit.z - z) < EXIT_RANGE;
  }

  /** Space in the maze. Returns true if something here took it. */
  grab(x: number, z: number): boolean {
    if (!this.contains(x, z, 1)) return false;
    if (this.exit && Math.hypot(this.exit.x - x, this.exit.z - z) < EXIT_RANGE) {
      this.tryExit();
      return true;
    }
    let best: Clue | null = null;
    let bestD = CLUE_RANGE;
    for (const c of this.clues) {
      const dd = Math.hypot(c.x - x, c.z - z);
      if (dd < bestD) {
        best = c;
        bestD = dd;
      }
    }
    if (!best) return false;
    bus.emit('ui:say', { key: best.key, seconds: 6 });
    return true;
  }

  update(dt: number): void {
    this.t += dt;
    const p = this.player;
    const inside = this.contains(p.x, p.z);
    if (inside && !this.entered && state.started && !state.ending) {
      this.entered = true;
      this.say('story:darkroom.enter', 5);
    }

    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.applyGlow();

    if (this.sliding && this.shiftMesh) {
      const step = (this.depth / SLIDE_SECONDS) * dt;
      let moving = false;
      for (const s of this.shifters) {
        const target = s.up ? 0 : -this.depth;
        if (s.y === target) continue;
        s.y = s.y < target ? Math.min(target, s.y + step) : Math.max(target, s.y - step);
        if (s.y !== target) moving = true;
      }
      this.writeShifters();
      this.sliding = moving;
    }
  }

  /** Flip the shifter phase. A wall that would rise on the horse stays down this time. */
  private swap(): void {
    if (!this.shifters.length) return;
    this.phase = this.phase === 0 ? 1 : 0;
    const p = this.player;
    const half = this.data.tile / 2 + CRUSH_MARGIN;
    let changed = false;
    for (const s of this.shifters) {
      const want = s.set === this.phase;
      if (want === s.up) continue;
      if (want && Math.abs(p.x - s.x) < half && Math.abs(p.z - s.z) < half) continue;
      s.up = want;
      s.collider.enabled = want;
      changed = true;
    }
    if (!changed) return;
    this.sliding = true;
    if (!this.shiftSeen && this.contains(p.x, p.z) && state.started && !state.ending) {
      this.shiftSeen = true;
      this.say('story:darkroom.walls_moved', 4);
    }
  }

  private writeShifters(): void {
    const mesh = this.shiftMesh;
    if (!mesh) return;
    for (const s of this.shifters) {
      dummy.position.set(s.x, s.y, s.z);
      // Fully sunk walls shrink to nothing so they never peek through the floor.
      dummy.scale.setScalar(s.y <= -this.depth ? 0 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(s.index, dummy.matrix);
    }
    dummy.scale.setScalar(1);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Glow follows the trip, with a small kick on every beat. Never fully dark. */
  private applyGlow(): void {
    const trip = Math.min(1, Math.max(0, state.trip / Math.min(TRIP_MAX, GLOW_FULL_TRIP)));
    const lit = GLOW_FLOOR + (1 - GLOW_FLOOR) * trip;
    const kick = 1 + this.pulse * 0.18;
    this.wallMat.emissiveIntensity = lit * WALL_PEAK * kick;
    this.shiftMat.emissiveIntensity = lit * WALL_PEAK * (1 + this.pulse * 0.35);
    this.floorMat.emissiveIntensity = lit * FLOOR_PEAK * kick;
    // Clues and the exit stay a bit easier to spot than the walls, even sober.
    const clueLit = 0.4 + 0.6 * lit;
    this.clueMat.emissiveIntensity = clueLit * CLUE_PEAK;
    this.stampMat.emissiveIntensity = clueLit * CLUE_PEAK;
    this.exitMat.emissiveIntensity = clueLit * WALL_PEAK * (1 + this.pulse * 0.25);
  }

  private tryExit(): void {
    if (state.ending) return;
    if (state.fragments.length >= EXIT_MEMORIES) {
      bus.emit('ui:say', { key: 'story:darkroom.exit_open', seconds: 5 });
      bus.emit('item:consumed', { item: 'mate' });
      // Respawn gives the back exit zone and a moment of grace from security; then step clear of the spawn's hoof bag.
      bus.emit('player:respawn', { zone: 'back_exit' });
      bus.emit('player:teleport', { x: this.data.exitTo[0], z: this.data.exitTo[1] });
      return;
    }
    const n = this.shutCount++ % 3;
    bus.emit('ui:say', { key: `story:darkroom.exit_shut_${n + 1}`, seconds: 5 });
  }

  private say(key: TextKey, seconds: number): void {
    if (this.t - this.sayAt < 2) return;
    this.sayAt = this.t;
    bus.emit('ui:say', { key, seconds });
  }

  private addClue(name: string, col: number, row: number, center: (c: number, r: number) => { x: number; z: number }): void {
    const spec = this.data.clues[name];
    if (!spec) return;
    const c = center(col, row);
    this.clues.push({ key: spec.key, x: c.x, z: c.z });
    const T = this.data.tile;
    if (spec.kind === 'stamp') {
      const stamp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), this.stampMat);
      stamp.rotation.x = -Math.PI / 2;
      stamp.position.set(c.x, 0.01, c.z);
      this.root.add(stamp);
      return;
    }
    // Flyer: on the nearest static wall face around the tile.
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (!tileSolid(this.data, col + dc, row + dr, 0) || !tileSolid(this.data, col + dc, row + dr, 1)) continue;
      const flyer = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.05), this.clueMat);
      flyer.position.set(c.x + dc * (T / 2 - 0.03), 1.55, c.z + dr * (T / 2 - 0.03));
      flyer.rotation.y = Math.atan2(-dc, -dr);
      flyer.rotation.z = (((col * 7 + row * 3) % 5) - 2) * 0.04;
      this.root.add(flyer);
      return;
    }
  }

  private addExit(col: number, row: number, center: (c: number, r: number) => { x: number; z: number }): void {
    const T = this.data.tile;
    const c = center(col, row);
    // The door sits on whichever face of the exit tile is open floor.
    for (const [dc, dr] of [[-1, 0], [0, 1], [0, -1], [1, 0]]) {
      if (tileSolid(this.data, col + dc, row + dr, 0)) continue;
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.8, 0.16), this.exitMat);
      door.position.set(c.x + dc * (T / 2 + 0.08), 1.4, c.z + dr * (T / 2 + 0.08));
      door.rotation.y = Math.atan2(dc, dr);
      this.root.add(door);
      this.exit = { x: c.x + dc * T, z: c.z + dr * T };
      return;
    }
  }

  /** The way in from the toilets: a lintel over the door cell [16, 6] and a glowing frame. */
  private addDoorway(): void {
    const H = this.data.wallHeight;
    const x0 = this.minX - 6;
    const zc = this.entranceZ();
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6, 16 - H, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 }));
    lintel.position.set(x0 + 3, H + (16 - H) / 2, zc);
    this.root.add(lintel);
    // Frame on the toilet side, so you can find it.
    const frameGeo = new THREE.BoxGeometry(0.2, H, 0.2);
    for (const dz of [-2.9, 2.9]) {
      const post = new THREE.Mesh(frameGeo, this.wallMat);
      post.position.set(x0 + 0.1, H / 2, zc + dz);
      this.root.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 6), this.wallMat);
    top.position.set(x0 + 0.1, H - 0.1, zc);
    this.root.add(top);
  }

  private entranceZ(): number {
    const e = tilesOf(this.data, 'dark_entrance')[0];
    return e ? this.data.originZ + (e[1] + 0.5) * this.data.tile : this.minZ;
  }
}
