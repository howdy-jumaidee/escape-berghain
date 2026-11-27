// World: level, collisions, zones, pickups, checkpoints, the exit. Issues #9 and #11.
// Talks to other systems only through the bus. game-boot calls update() and resolve().
import * as THREE from 'three';
import { bus, state, cellCenter, CELL, type FragmentId, type ItemId } from '../contracts';
import { placeModel } from '../look/models';
import { buildLevel, resolveCircle, type BuiltLevel, type LevelData } from './level';
import level1 from '../../levels/level1.json';

const GRAB_RANGE = 1.8;
const EXIT_RANGE = 2.4;

interface Pickup {
  kind: 'fragment' | 'item';
  fragment?: FragmentId;
  item?: ItemId;
  object: THREE.Object3D;
  /** How many more grabs slip before it sticks. */
  slips: number;
  baseY: number;
  hinted: boolean;
}

const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

export class World {
  readonly level: BuiltLevel;
  readonly root: THREE.Group;
  private pickups: Pickup[] = [];
  private exitPos: { x: number; z: number } | null = null;
  private exitDone = false;
  private gateOpen = false;
  private gateHintAt = -99;
  private iceCreamAt = -99;
  private t = 0;
  private player = new THREE.Vector3();
  private beam: THREE.Mesh | null = null;

  constructor() {
    this.level = buildLevel(level1 as unknown as LevelData);
    this.root = this.level.root;

    for (const [col, row] of this.level.cells.get('fragment_1') ?? []) {
      this.addPickup({ kind: 'fragment', fragment: 1, slips: 2 }, 'prop_glasses', { x: 0.45, y: 0.12, z: 0.18 }, 0x9fe8ff, col, row);
    }
    for (const [col, row] of this.level.cells.get('fragment_3') ?? []) {
      this.addPickup({ kind: 'fragment', fragment: 3, slips: 0 }, 'prop_ticket', { x: 0.3, y: 0.45, z: 0.05 }, 0xffe08a, col, row);
    }
    for (const [col, row] of this.level.cells.get('mate') ?? []) {
      this.addPickup({ kind: 'item', item: 'mate', slips: 0 }, 'prop_mate', { x: 0.14, y: 0.45, z: 0.14 }, 0xffb300, col, row);
    }
    const exit = this.level.cells.get('exit_door')?.[0];
    if (exit) {
      const c = cellCenter(exit[0], exit[1]);
      this.exitPos = { x: c.x, z: c.z + 1 };
    }

    // The only mirror in the building, on the wall behind the ice cream counter.
    const mirror = this.level.data.markers?.mirror;
    if (mirror) {
      const c = cellCenter(mirror[0], mirror[1]);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.05, metalness: 1 }),
      );
      glass.position.set(c.x, 1.4, c.z - CELL / 2 + 0.03);
      this.root.add(glass);
    }

    bus.on('player:moved', ({ x, z }) => this.player.set(x, 0, z));
    bus.on('player:grab', ({ x, z }) => this.grab(x, z));
    bus.on('player:respawn', ({ zone }) => {
      const p = this.level.spawn(zone);
      bus.emit('player:teleport', p);
    });
    bus.on('item:spawn', ({ item, x, z }) => {
      if (item !== 'mate') return;
      this.addPickupAt({ kind: 'item', item, slips: 0 }, 'prop_mate', { x: 0.14, y: 0.45, z: 0.14 }, 0xffb300, x, z);
    });
    bus.on('riddle:answered', ({ correct }) => {
      if (correct) this.openGate();
    });
    bus.on('herd:synced', () => this.showTicketBeam());
  }

  /** Collision for the horse. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number): void {
    resolveCircle(this.level.colliders, pos, radius);
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.t += dt;
    const p = this.player;

    // Zones.
    const zone = this.level.zoneAt(p.x, p.z);
    if (zone && zone !== state.zone) {
      state.zone = zone;
      bus.emit('zone:entered', { zone });
    }

    // Pickups bob and spin so they read in the dark.
    for (const pu of this.pickups) {
      pu.object.rotation.y += dt * 1.5;
      pu.object.position.y = pu.baseY + Math.sin(this.t * 3) * 0.08;
      if (pu.kind === 'item' && !pu.hinted && dist(pu.object.position, p) < 2.5) {
        pu.hinted = true;
        bus.emit('ui:say', { key: 'story:items.mate_found', seconds: 3 });
      }
    }

    // Gate hint.
    const gate = this.level.gates.get('gate_shortcut');
    if (gate && !this.gateOpen && dist(gate.object.position, p) < 2.6 && this.t - this.gateHintAt > 10) {
      this.gateHintAt = this.t;
      bus.emit('ui:say', { key: 'story:gate.locked', seconds: 4 });
    }
    if (gate && this.gateOpen && gate.object.position.y < 3.2) {
      gate.object.position.y = Math.min(3.2, gate.object.position.y + dt * 1.5);
    }

    // Exit.
    if (this.exitPos && !this.exitDone && !state.ending) {
      const dx = p.x - this.exitPos.x;
      const dz = p.z - this.exitPos.z;
      if (dx * dx + dz * dz < EXIT_RANGE * EXIT_RANGE) {
        this.exitDone = true;
        bus.emit('exit:reached', {});
      }
    }

    if (this.beam) (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(this.t * 4) * 0.05;

    this.cutaway(dt, cameraPos);
  }

  private addPickup(
    base: Pick<Pickup, 'kind' | 'fragment' | 'item' | 'slips'>,
    model: string,
    size: THREE.Vector3Like,
    color: number,
    col: number,
    row: number,
  ): void {
    const c = cellCenter(col, row);
    this.addPickupAt(base, model, size, color, c.x, c.z);
  }

  private addPickupAt(
    base: Pick<Pickup, 'kind' | 'fragment' | 'item' | 'slips'>,
    model: string,
    size: THREE.Vector3Like,
    color: number,
    x: number,
    z: number,
  ): void {
    const object = placeModel(model, size, glow(color));
    const baseY = 0.35;
    object.position.set(x, baseY, z);
    // A halo so it's findable in the haze. A sprite, not a light: changing the light count recompiles every shader.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    halo.scale.setScalar(1.6);
    halo.position.y = 0.1;
    object.add(halo);
    this.root.add(object);
    this.pickups.push({ ...base, object, baseY, hinted: false });
  }

  private grab(x: number, z: number): void {
    if (state.ending) return;
    const here = new THREE.Vector3(x, 0, z);

    // Ice cream counter.
    const ice = this.level.cells.get('panorama_ice_cream')?.[0];
    if (ice) {
      const c = cellCenter(ice[0], ice[1]);
      if (dist(new THREE.Vector3(c.x, 0, c.z), here) < 2.6 && this.t - this.iceCreamAt > 15) {
        this.iceCreamAt = this.t;
        bus.emit('item:consumed', { item: 'ice_cream' });
        bus.emit('ui:say', { key: 'story:items.ice_cream', seconds: 3 });
        return;
      }
    }

    let best: Pickup | null = null;
    let bestD = GRAB_RANGE;
    for (const pu of this.pickups) {
      const d = dist(pu.object.position, here);
      if (d < bestD) {
        best = pu;
        bestD = d;
      }
    }
    if (!best) return;

    if (best.slips > 0) {
      const n = 3 - best.slips;
      best.slips--;
      bus.emit('item:slipped', {});
      bus.emit('ui:say', { key: `story:items.glasses_slip_${n}`, seconds: 2.5 });
      // Hop away a little, never into a wall.
      const a = Math.random() * Math.PI * 2;
      const pos = best.object.position.clone();
      pos.x += Math.cos(a) * 1.4;
      pos.z += Math.sin(a) * 1.4;
      this.resolve(pos, 0.4);
      best.object.position.x = pos.x;
      best.object.position.z = pos.z;
      return;
    }

    this.root.remove(best.object);
    this.pickups.splice(this.pickups.indexOf(best), 1);
    if (best.kind === 'item' && best.item) {
      bus.emit('item:consumed', { item: best.item });
      if (best.item === 'mate') bus.emit('ui:say', { key: 'story:spirit_guide.mate', seconds: 3 });
      return;
    }
    if (best.fragment) this.foundFragment(best.fragment);
    if (best.fragment === 3) this.hideTicketBeam();
  }

  private foundFragment(id: FragmentId): void {
    if (state.fragments.includes(id)) return;
    state.fragments.push(id);
    bus.emit('fragment:found', { id });
    state.checkpoint = state.zone;
    bus.emit('checkpoint:set', { zone: state.zone });
  }

  private openGate(): void {
    const gate = this.level.gates.get('gate_shortcut');
    if (!gate || this.gateOpen) return;
    this.gateOpen = true;
    gate.collider.enabled = false;
    bus.emit('ui:say', { key: 'story:gate.open', seconds: 3 });
  }

  private showTicketBeam(): void {
    const ticket = this.pickups.find((p) => p.fragment === 3);
    if (!ticket || this.beam) return;
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 1.2, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.set(ticket.object.position.x, 7, ticket.object.position.z);
    this.root.add(this.beam);
  }

  private hideTicketBeam(): void {
    if (this.beam) this.root.remove(this.beam);
    this.beam = null;
  }

  /** Fade walls and pillars that stand between the camera and the horse. */
  private cutaway(dt: number, cam: THREE.Vector3): void {
    const p = this.player;
    for (const o of this.level.tall) {
      const dz = o.position.z - p.z;
      const dx = o.position.x - p.x;
      const between = dz > 0.6 && o.position.z < cam.z + 2 && Math.abs(dx) < 3.2 + dz * 0.15;
      const target = between ? 0.18 : 1;
      const cur: number = o.userData.opacity ?? 1;
      if (Math.abs(cur - target) < 0.01) continue;
      const next = cur + (target - cur) * (1 - Math.exp(-10 * dt));
      o.userData.opacity = Math.abs(next - target) < 0.01 ? target : next;
      setOpacity(o, o.userData.opacity);
    }
  }
}

function setOpacity(o: THREE.Object3D, opacity: number): void {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.userData.ownMaterial) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => x.clone()) : mesh.material.clone();
      mesh.userData.ownMaterial = true;
    }
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      mat.transparent = opacity < 0.99;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 0.99;
    }
  });
}

let halo: THREE.Texture | null = null;
function haloTexture(): THREE.Texture {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c);
  return halo;
}

function dist(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
