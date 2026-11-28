// World: level, collisions, zones, pickups, checkpoints, the exit. Issues #9 and #11.
// Talks to other systems only through the bus. game-boot calls update() and resolve().
import * as THREE from 'three';
import { bus, state, cellCenter, CELL, type FragmentId, type ItemId } from '../contracts';
import { level as levelData, story, debug } from '../data';
import { placeModel } from '../look/models';
import { buildLevel, resolveCircle, type BuiltLevel } from './level';
import { buildGalleries, type Galleries } from './galleries';
import { buildPanorama, type Panorama } from './panorama';
import { Patrols } from './patrols';

/** Panorama Bar shutters open after this much play time. */
const SHUTTERS_AFTER = 600;
const DOOR_RANGE = 1.5;

const GRAB_RANGE = 1.8;
const EXIT_RANGE = 2.4;
const OFF_FLOOR_PLAYER = new THREE.Vector3(-999, 0, -999);

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
  private galleries: Galleries;
  private pano: Panorama;
  private pickups: Pickup[] = [];
  private exitPos: { x: number; z: number } | null = null;
  private exitDone = false;
  private gateOpen = false;
  private gateHintAt = -99;
  private iceCreamAt = -99;
  private t = 0;
  private player = new THREE.Vector3();
  private wasNear = false;
  private beam: THREE.Mesh | null = null;
  private patrols: Patrols;
  private playTime = debug.time;
  private shuttersOpen = false;
  private morning: THREE.SpotLight;
  private doorPos: { x: number; z: number } | null = null;
  private doorAt = -99;
  private djScreen: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null = null;

  constructor() {
    this.level = buildLevel(levelData);
    this.root = this.level.root;

    // Walkable 9 m mezzanine galleries, catwalk bridge, and monumental steel staircase.
    this.galleries = buildGalleries(levelData);
    this.root.add(this.galleries.root);

    // Panorama Bar: a real room on the 9 m south gallery (floor 1), grid in levels/level1_floor1.json.
    this.pano = buildPanorama();
    this.root.add(this.pano.root);

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

    // Security.
    this.patrols = new Patrols(this.level, this.level.data.patrols ?? []);
    this.root.add(this.patrols.root);

    // Front door: the bouncer never lets you out this way.
    const door = this.level.cells.get('front_door')?.[0];
    if (door) {
      const c = cellCenter(door[0], door[1]);
      this.doorPos = { x: c.x + CELL / 2, z: c.z };
    }

    // Morning light for when the shutters go up. Created now at zero, so the light count never changes.
    this.morning = new THREE.SpotLight(0xffd9a0, 0, 40, Math.PI / 4, 0.8);
    this.morning.position.set(5 * CELL, 8, 13.5 * CELL);
    this.morning.target.position.set(5 * CELL, 0, 10 * CELL);
    this.root.add(this.morning, this.morning.target);

    // DJ booth screen with the track names. Unreadable until you find your glasses.
    const booth = this.level.data.markers?.dj_booth;
    if (booth) {
      const c = cellCenter(booth[0], booth[1]);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 160;
      const texture = new THREE.CanvasTexture(canvas);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      screen.position.set(c.x, 2.2, c.z - 0.6);
      screen.rotation.x = -0.5;
      this.root.add(screen);
      this.djScreen = { canvas, texture };
      this.drawDjScreen(false);
    }
    bus.on('fragment:found', ({ id }) => {
      if (id === 1) this.drawDjScreen(true);
    });

    bus.on('player:moved', ({ x, z }) => this.player.set(x, 0, z));
    // Fragment pickups all lie on the ground floor (floor 0).
    bus.on('game:start', () => {
      for (const pu of this.pickups) this.announceSpot(pu);
    });
    bus.on('player:grab', ({ x, z }) => this.grab(x, z));
    bus.on('player:respawn', ({ zone }) => {
      if (state.floor !== 0) {
        state.floor = 0;
        bus.emit('player:floor', { floor: 0 });
      }
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

  /** Collision for the horse on floor 0, the stairs, or the 9 m galleries. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number, floor = state.floor, y = 0): void {
    if (floor === 0 && y < 0.5) {
      resolveCircle(this.level.colliders, pos, radius);
    }
    this.galleries.resolve(pos, radius, floor, y);
    // Upstairs room walls (Panorama Bar) only block on floor 1.
    if (floor >= 1 || y >= 9 - 0.3) resolveCircle(this.pano.colliders, pos, radius);
  }

  /** Smoothly ramps elevation up/down the monumental steel stairs and across the 9 m mezzanine galleries. */
  elevationAt(x: number, z: number, currentFloor: number, currentY: number): { floor: number; y: number } {
    return this.galleries.elevationAt(x, z, currentFloor, currentY);
  }

  /**
   * Pull a camera target `to` forward along the ray from `from` so it never sits inside or behind a wall,
   * and keep it above the active floor. Mutates `to`.
   */
  clipCamera(from: THREE.Vector3, to: THREE.Vector3, margin = 0.35, minFloorY = 0): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const minY = Math.min(from.y, to.y);
    let bestT = 1;
    if (dx * dx + dz * dz > 1e-6) {
      for (const c of this.level.colliders) {
        if (!c.enabled || c.height < minY) continue;
        const t = rayBox2D(from.x, from.z, dx, dz, c.minX - margin, c.maxX + margin, c.minZ - margin, c.maxZ + margin);
        if (t !== null && t < bestT) bestT = t;
      }
    }
    if (bestT < 1) {
      const clamped = Math.max(0.05, bestT);
      to.x = from.x + dx * clamped;
      to.z = from.z + dz * clamped;
    }
    const tall = this.level.colliders.filter((c) => c.enabled && c.height >= minY);
    resolveCircle(tall, to, margin);
    const floorCap = Math.max(0.45, minFloorY + 0.45);
    if (to.y < floorCap) to.y = floorCap;
  }

  update(dt: number, cameraPos: THREE.Vector3, useCutaway = false): void {
    this.t += dt;
    const p = this.player;
    this.announceNear();

    // Zones. Upstairs in the Panorama room the zone is panorama_bar (warm mix), anywhere else on
    // floor 1 the hall zone below still applies.
    const zone = state.floor >= 1 && this.pano.contains(p.x, p.z) ? 'panorama_bar' : this.level.zoneAt(p.x, p.z);
    if (zone && zone !== state.zone && !state.ending) {
      state.zone = zone;
      bus.emit('zone:entered', { zone });
    }

    // Pickups bob and spin so they read in the dark.
    for (const pu of this.pickups) {
      pu.object.rotation.y += dt * 1.5;
      pu.object.position.y = pu.baseY + Math.sin(this.t * 3) * 0.08;
      if (state.floor === 0 && pu.kind === 'item' && !pu.hinted && dist(pu.object.position, p) < 2.5) {
        pu.hinted = true;
        bus.emit('ui:say', { key: 'story:items.mate_found', seconds: 3 });
      }
    }

    // Gate hint.
    const gate = this.level.gates.get('gate_shortcut');
    if (state.floor === 0 && gate && !this.gateOpen && dist(gate.object.position, p) < 2.6 && this.t - this.gateHintAt > 10) {
      this.gateHintAt = this.t;
      bus.emit('ui:say', { key: 'story:gate.locked', seconds: 4 });
    }
    if (gate && this.gateOpen && gate.object.position.y < 3.2) {
      gate.object.position.y = Math.min(3.2, gate.object.position.y + dt * 1.5);
    }

    // Exit.
    if (state.floor === 0 && this.exitPos && !this.exitDone && !state.ending) {
      const dx = p.x - this.exitPos.x;
      const dz = p.z - this.exitPos.z;
      if (dx * dx + dz * dz < EXIT_RANGE * EXIT_RANGE) {
        this.exitDone = true;
        bus.emit('exit:reached', {});
      }
    }

    if (this.beam) (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(this.t * 4) * 0.05;

    // Front door.
    if (state.floor === 0 && this.doorPos && !state.ending && Math.hypot(p.x - this.doorPos.x, p.z - this.doorPos.z) < DOOR_RANGE && this.t - this.doorAt > 1.5) {
      this.doorAt = this.t;
      bus.emit('door:refused', {});
      bus.emit('player:teleport', { x: this.doorPos.x + 3, z: this.doorPos.z });
    }

    // Morning.
    if (state.started && !state.ending) this.playTime += dt;
    if (!this.shuttersOpen && this.playTime > SHUTTERS_AFTER) {
      this.shuttersOpen = true;
      bus.emit('shutters:open', {});
    }
    if (this.shuttersOpen) {
      this.morning.intensity = Math.min(900, this.morning.intensity + dt * 200);
      for (const o of this.root.children) {
        if (o.name === 'panorama_shutter' && o.position.y < 9) o.position.y += dt * 1.2;
      }
    }

    // Patrols walk on floor 0; guards can't spot you through the 9 m gallery deck.
    this.patrols.update(dt, state.floor === 0 ? p : OFF_FLOOR_PLAYER);
    this.cutaway(dt, cameraPos, useCutaway);
  }

  private drawDjScreen(sharp: boolean): void {
    if (!this.djScreen) return;
    const { canvas, texture } = this.djScreen;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#050805';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#22ff66';
    g.font = '600 30px ui-monospace, Menlo, monospace';
    const lines = sharp ? story.dj.tracks : [story.dj.screen_blurry, story.dj.screen_blurry, story.dj.screen_blurry];
    lines.forEach((line, i) => g.fillText(line, 18, 46 + i * 44));
    if (!sharp) {
      g.filter = 'blur(6px)';
      g.drawImage(canvas, 0, 0);
      g.filter = 'none';
    }
    texture.needsUpdate = true;
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

  private announceSpot(pu: Pickup): void {
    if (pu.kind !== 'fragment' || !pu.fragment) return;
    bus.emit('fragment:spot', { id: pu.fragment, x: pu.object.position.x, z: pu.object.position.z, floor: 0 });
  }

  /** Tell the bus when a pickup comes into or leaves grab range. Only sends on change. */
  private announceNear(): void {
    let near = false;
    if (state.floor === 0 && !state.ending) {
      for (const pu of this.pickups) {
        if (Math.hypot(pu.object.position.x - this.player.x, pu.object.position.z - this.player.z) < GRAB_RANGE) {
          near = true;
          break;
        }
      }
    }
    if (near !== this.wasNear) {
      this.wasNear = near;
      bus.emit('player:near', { by: 'world', near });
    }
  }

  private grab(x: number, z: number): void {
    if (state.ending || state.floor !== 0) return;
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
      this.announceSpot(best);
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
    bus.emit('fragment:claim', { id });
  }

  /** Something other than walls that blocks a torch beam at (x, z), e.g. dancers. Wired by game-boot. */
  setTorchBlocker(blocks: (x: number, z: number) => boolean): void {
    this.patrols.setBlocker(blocks);
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

  /** Fade walls between the camera and the horse. Follow and first person leave them solid. */
  private cutaway(dt: number, cam: THREE.Vector3, active: boolean): void {
    const p = this.player;
    for (const o of this.level.tall) {
      const dz = o.position.z - p.z;
      const dx = o.position.x - p.x;
      const between = active && dz > 0.6 && o.position.z < cam.z + 2 && Math.abs(dx) < 3.2 + dz * 0.15;
      const target = between ? 0.18 : 1;
      const cur: number = o.userData.opacity ?? 1;
      if (Math.abs(cur - target) < 0.01) {
        if (cur < 0.99) setOpacity(o, cur);
        continue;
      }
      const next = cur + (target - cur) * (1 - Math.exp(-10 * dt));
      o.userData.opacity = Math.abs(next - target) < 0.01 ? target : next;
      setOpacity(o, o.userData.opacity);
    }
  }
}

/** 2D slab ray-vs-AABB intersection for t in [0, 1]. Returns entry t or null. */
function rayBox2D(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number | null {
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
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
