// World: Panorama Bar, a real room on the 9 m south gallery (floor 1). Issue #71.
// The floor-1 grid lives in levels/level1_floor1.json (one grid per floor), same cell mapping as level1.json.
// Talks to other systems only through the World class; no bus events of its own.
import * as THREE from 'three';
import { CELL, FLOOR_HEIGHT, cellCenter } from '../contracts';
import { placeModel } from '../look/models';
import { applyWorldUVs, boardConcreteTextures, CONCRETE_DARK_COLOR, CONCRETE_TILE_SIZE } from './architecture';
import { buildBarCounter } from './props';
import type { Collider } from './level';
import floor1Json from '../../levels/level1_floor1.json';

interface FloorGrid {
  legend: Record<string, string>;
  grid: string[];
}
const data = floor1Json as unknown as FloorGrid;

const DECK_Y = FLOOR_HEIGHT; // 9 m
const WALL_H = 3;

const barMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8 });

export interface Panorama {
  root: THREE.Group;
  /** Solid boxes on floor 1. World applies them only when the horse is upstairs. */
  colliders: Collider[];
  /** True inside the Panorama room: the zone there is panorama_bar (warm mix upstairs). */
  contains(x: number, z: number): boolean;
}

export function buildPanorama(): Panorama {
  const root = new THREE.Group();
  root.name = 'panorama';
  const colliders: Collider[] = [];
  const concreteTex = boardConcreteTextures();
  const wallMat = new THREE.MeshStandardMaterial({
    color: CONCRETE_DARK_COLOR,
    map: concreteTex.map,
    bumpMap: concreteTex.bumpMap,
    bumpScale: 0.11,
    roughnessMap: concreteTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });
  const MODULES: Record<string, { size: { x: number; y: number; z: number }; solid?: { x: number; z: number }; offset?: { x: number; z: number }; material: THREE.Material }> = {
    pano_wall: { size: { x: CELL, y: WALL_H, z: 0.3 }, solid: { x: CELL, z: 0.3 }, offset: { x: 0, z: -CELL / 2 + 0.15 }, material: wallMat },
    pano_bar: { size: { x: 4, y: 1.1, z: 1.2 }, solid: { x: 4, z: 1.2 }, offset: { x: 0, z: CELL / 2 - 0.8 }, material: barMat },
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  data.grid.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      const name = data.legend[ch];
      if (!name || name === 'open') return;
      const c = cellCenter(col, row);

      if (name === 'pano_window') {
        // A lit window in the north wall, looking down into the hall. Visual only.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 0.12), wallMat);
        frame.position.set(c.x, DECK_Y + 1.9, c.z - CELL / 2 + 0.15);
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, 1.2),
          new THREE.MeshBasicMaterial({ color: 0x9fc4e8, toneMapped: false }),
        );
        glass.position.set(c.x, DECK_Y + 1.9, c.z - CELL / 2 + 0.22);
        root.add(frame, glass);
      } else {
        const spec = MODULES[name];
        if (!spec) return;
        const obj = placeModel(`f1_${name}`, spec.size, spec.material);
        const ox = spec.offset?.x ?? 0;
        const oz = spec.offset?.z ?? 0;
        if (name === 'pano_bar') {
          obj.clear();
          obj.add(buildBarCounter(4.0, false));
        } else if (name === 'pano_wall') {
          const mesh = obj.children[0] as THREE.Mesh | undefined;
          if (mesh?.isMesh && mesh.geometry) {
            applyWorldUVs(mesh.geometry, CONCRETE_TILE_SIZE, c.x + ox, spec.size.y / 2, c.z + oz);
          }
        }
        obj.position.set(c.x + ox, DECK_Y, c.z + oz);
        root.add(obj);
        if (spec.solid) {
          colliders.push({
            minX: c.x + ox - spec.solid.x / 2,
            maxX: c.x + ox + spec.solid.x / 2,
            minZ: c.z + oz - spec.solid.z / 2,
            maxZ: c.z + oz + spec.solid.z / 2,
            height: spec.size.y,
            enabled: true,
          });
        }
      }

      minX = Math.min(minX, c.x - CELL / 2);
      maxX = Math.max(maxX, c.x + CELL / 2);
      minZ = Math.min(minZ, c.z - CELL / 2);
      maxZ = Math.max(maxZ, c.z + CELL / 2);
    });
  });

  // A soft warm strip over the bar so the room reads at night.
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff9a5c, toneMapped: false }),
  );
  strip.position.set((minX + maxX) / 2, DECK_Y + WALL_H - 0.15, minZ + 0.3);
  root.add(strip);

  return {
    root,
    colliders,
    contains: (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ,
  };
}
