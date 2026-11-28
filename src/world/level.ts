// World: builds a level from grid JSON and answers collision queries. Issue #9.
import * as THREE from 'three';
import { CELL, CEILING, cellCenter, type ZoneId } from '../contracts';
import { placeModel } from '../look/models';
import {
  applyWorldUVs,
  boardConcreteTextures,
  buildArchitecture,
  CONCRETE_DARK_COLOR,
  CONCRETE_LIGHT_COLOR,
  CONCRETE_PLINTH_COLOR,
  CONCRETE_TILE_SIZE,
  FLOOR_CONCRETE_COLOR,
  FLOOR_TILE_SIZE,
  floorConcreteTextures,
} from './architecture';
import { buildClubSignage, buildFamiliarModule } from './props';

export type { LevelData } from '../data';
import type { LevelData } from '../data';

/** A solid box on the floor plan, in world metres. */
export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height in metres, so cameras above low counters aren't clipped. */
  height: number;
  /** Turned off by gates when they open. */
  enabled: boolean;
}

/** Greybox size per module, metres. Emma's .glb of the same name replaces the box. */
interface ModuleSpec {
  size: { x: number; y: number; z: number };
  /** Footprint that blocks the horse. Omit for walkable modules. */
  solid?: { x: number; z: number };
  /** Offset of the model inside the cell, metres. */
  offset?: { x: number; z: number };
  material: THREE.Material;
  /** Tall things fade out when they block the camera's view of the horse. */
  tall?: boolean;
}

const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 1 });
const steel = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8 });
const tile = new THREE.MeshStandardMaterial({ color: 0x4a4f4a, roughness: 0.6 });
const grate = new THREE.MeshStandardMaterial({ color: 0x202022, roughness: 0.7, metalness: 0.5 });
const door = new THREE.MeshStandardMaterial({ color: 0x3b4a3b, roughness: 0.6, metalness: 0.6 });

/** Outer walls go most of the way up. Follow and first person see them. */
const WALL_HEIGHT = 16;

const MODULES: Record<string, ModuleSpec> = {
  hall_wall: { size: { x: CELL, y: WALL_HEIGHT, z: CELL }, solid: { x: CELL, z: CELL }, material: darkConcrete, tall: true },
  hall_pillar: { size: { x: 2.2, y: CEILING, z: 2.2 }, solid: { x: 2.2, z: 2.2 }, material: concrete, tall: true },
  hall_speaker: { size: { x: 2.4, y: 6.5, z: 2.4 }, solid: { x: 2.4, z: 2.4 }, material: steel, tall: true },
  hall_dj_booth: { size: { x: 3, y: 1.2, z: 2 }, solid: { x: 3, z: 2 }, material: steel },
  bar_counter: { size: { x: 4, y: 1.1, z: 1.2 }, solid: { x: 4, z: 1.2 }, material: wood },
  cloakroom_counter: { size: { x: 4, y: 1.1, z: 1.2 }, solid: { x: 4, z: 1.2 }, material: wood },
  toilet_cubicle: { size: { x: 4, y: 2.4, z: 2 }, solid: { x: 4, z: 2 }, offset: { x: 0, z: -1 }, material: tile, tall: true },
  panorama_ice_cream: { size: { x: 3, y: 1.1, z: 1.2 }, solid: { x: 3, z: 1.2 }, material: wood },
  staircase_up: { size: { x: 3, y: 0.25, z: 4 }, material: grate },
  exit_door: { size: { x: 2, y: 2.6, z: 0.2 }, offset: { x: 0, z: CELL / 2 - 0.1 }, material: door },
  gate_shortcut: { size: { x: CELL, y: 3, z: 0.3 }, solid: { x: CELL, z: 0.6 }, material: steel, tall: true },
  front_door: { size: { x: 0.3, y: 3, z: 2.4 }, solid: { x: 0.3, z: CELL }, offset: { x: CELL / 2 - 0.15, z: 0 }, material: door },
  panorama_shutter: { size: { x: CELL, y: WALL_HEIGHT, z: 0.4 }, solid: { x: CELL, z: 0.4 }, offset: { x: 0, z: -CELL / 2 + 0.2 }, material: steel, tall: true },
};

/** Grid characters that are just markers on an ordinary floor cell. */
const FLOOR_MARKERS = new Set(['hall_floor', 'player_start', 'fragment_1', 'fragment_3', 'mate', 'hoof_bag']);

export interface BuiltLevel {
  root: THREE.Group;
  colliders: Collider[];
  /** Objects that fade when they hide the horse. */
  tall: THREE.Object3D[];
  /** Cells by legend name, e.g. cells.get('fragment_1') = [[5, 3]]. */
  cells: Map<string, [number, number][]>;
  /** Collider and model for each gate, keyed by legend name. */
  gates: Map<string, { collider: Collider; object: THREE.Object3D }>;
  start: { x: number; z: number };
  zoneAt(x: number, z: number): ZoneId | null;
  spawn(zone: ZoneId): { x: number; z: number };
  data: LevelData;
}

/** Recomputes world-scale UVs on placeModel's fallback box geometry (keeps future .glb swaps intact). */
function applyWorldUVsToPlaceholder(
  group: THREE.Group,
  tileSize: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
): void {
  const mesh = group.children[0] as THREE.Mesh | undefined;
  if (mesh?.isMesh && mesh.geometry) {
    applyWorldUVs(mesh.geometry, tileSize, offsetX, offsetY, offsetZ);
  }
}

export function buildLevel(data: LevelData): BuiltLevel {
  const root = new THREE.Group();
  root.name = 'level';
  const colliders: Collider[] = [];
  const tall: THREE.Object3D[] = [];
  const cells = new Map<string, [number, number][]>();
  const gates = new Map<string, { collider: Collider; object: THREE.Object3D }>();
  let start = cellCenter(1, 1);

  // Shared cold brutalist Sichtbeton & scuffed poured-concrete floor materials (reusing GPU textures).
  const concreteTex = boardConcreteTextures();
  const floorTex = floorConcreteTextures();

  const wallConcreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_DARK_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.12,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });

  const pillarConcreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_LIGHT_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.14,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });

  const plinthConcreteMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_PLINTH_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.13,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.95,
    metalness: 0.05,
  });

  const floorConcreteMat = new THREE.MeshStandardMaterial({
    color: FLOOR_CONCRETE_COLOR,
    map: floorTex.map,
    bumpMap: floorTex.bumpMap,
    bumpScale: 0.05,
    roughnessMap: floorTex.roughnessMap,
    roughness: 1.0, // roughnessMap directly encodes 0.45..0.92 damp/scuffed dance-floor sheen
    metalness: 0.08,
  });

  const baseFloorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f47,
    map: floorTex.map,
    bumpMap: floorTex.bumpMap,
    bumpScale: 0.04,
    roughnessMap: floorTex.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
  });

  data.grid.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      const name = data.legend[ch];
      if (!name) return;
      const list = cells.get(name) ?? [];
      list.push([col, row]);
      cells.set(name, list);

      const c = cellCenter(col, row);
      if (name === 'player_start') start = c;

      // Every non wall cell gets a scuffed dark poured-concrete floor slab.
      if (name !== 'hall_wall') {
        const floor = placeModel('hall_floor', { x: CELL, y: 0.05, z: CELL }, floorConcreteMat);
        applyWorldUVsToPlaceholder(floor, FLOOR_TILE_SIZE, c.x, 0.025, c.z);
        floor.position.set(c.x, -0.05, c.z);
        root.add(floor);
      }
      if (FLOOR_MARKERS.has(name)) return;

      const spec = MODULES[name];
      if (!spec) return;
      const mat =
        name === 'hall_wall' ? wallConcreteMat : name === 'hall_pillar' ? pillarConcreteMat : spec.material;
      const obj = placeModel(name, spec.size, mat);
      const ox = spec.offset?.x ?? 0;
      const oz = spec.offset?.z ?? 0;

      // Replace plain fallback boxes for doors, counters, speakers, booths, cubicles, and shutters with familiar shapes.
      const familiar = buildFamiliarModule(name);
      if (familiar) {
        obj.clear();
        obj.add(familiar);
      } else if (name === 'hall_wall' || name === 'hall_pillar') {
        applyWorldUVsToPlaceholder(obj, CONCRETE_TILE_SIZE, c.x + ox, spec.size.y / 2, c.z + oz);
      }

      // Monumental dark concrete plinth base collar anchoring every 19 m column (non-blocking visual flange).
      if (name === 'hall_pillar') {
        const plinthH = 0.85;
        const plinthGeo = new THREE.BoxGeometry(2.55, plinthH, 2.55);
        applyWorldUVs(plinthGeo, CONCRETE_TILE_SIZE, c.x + ox, plinthH / 2, c.z + oz);
        const plinth = new THREE.Mesh(plinthGeo, plinthConcreteMat);
        plinth.name = 'hall_pillar_plinth';
        plinth.position.y = plinthH / 2;
        obj.add(plinth);
      }

      obj.position.set(c.x + ox, 0, c.z + oz);
      root.add(obj);
      if (spec.tall) tall.push(obj);

      if (spec.solid) {
        const col: Collider = {
          minX: c.x + ox - spec.solid.x / 2,
          maxX: c.x + ox + spec.solid.x / 2,
          minZ: c.z + oz - spec.solid.z / 2,
          maxZ: c.z + oz + spec.solid.z / 2,
          height: spec.size.y,
          enabled: true,
        };
        colliders.push(col);
        if (name.startsWith('gate_')) gates.set(name, { collider: col, object: obj });
      }
    });
  });

  // Monumental Berghain hall architecture: flared pillar capitals, hanging coal hoppers, beams, 19 m ceiling, tall tiled windows.
  root.add(buildArchitecture(data));
  // Backlit club wayfinding & zone signs (EXIT, BAR, COAT CHECK, WC, PANORAMA BAR, DARKROOM).
  root.add(buildClubSignage());

  // The floor under the walls, so the fog has something to sit on at the edges.
  const rows = data.grid.length;
  const cols = Math.max(...data.grid.map((l) => l.length));
  const baseW = cols * CELL + 40;
  const baseD = rows * CELL + 40;
  const baseGeo = new THREE.PlaneGeometry(baseW, baseD);
  const baseUv = baseGeo.getAttribute('uv');
  if (baseUv) {
    for (let i = 0; i < baseUv.count; i++) {
      baseUv.setXY(i, baseUv.getX(i) * (baseW / FLOOR_TILE_SIZE), baseUv.getY(i) * (baseD / FLOOR_TILE_SIZE));
    }
    baseUv.needsUpdate = true;
  }
  const base = new THREE.Mesh(baseGeo, baseFloorMat);
  base.rotation.x = -Math.PI / 2;
  base.position.set((cols * CELL) / 2, -0.06, (rows * CELL) / 2);
  root.add(base);

  function zoneAt(x: number, z: number): ZoneId | null {
    const col = Math.floor(x / CELL);
    const row = Math.floor(z / CELL);
    for (const [zone, [[c0, r0], [c1, r1]]] of Object.entries(data.zones) as [ZoneId, [[number, number], [number, number]]][]) {
      if (col >= c0 && col <= c1 && row >= r0 && row <= r1) return zone;
    }
    return null;
  }

  function spawn(zone: ZoneId): { x: number; z: number } {
    const cell = data.spawns[zone];
    return cell ? cellCenter(cell[0], cell[1]) : start;
  }

  return { root, colliders, tall, cells, gates, start, zoneAt, spawn, data };
}

/** Push a circle of `radius` at `pos` out of every enabled collider. Mutates pos. */
export function resolveCircle(colliders: Collider[], pos: THREE.Vector3, radius: number): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (!c.enabled) continue;
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre is inside the box: push out along the shortest axis.
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
  }
}
