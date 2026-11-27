// Security patrols. Issue #12.
// Guards walk fixed routes from levels/level1.json with a torch. If the torch finds you and stays on you,
// you're caught: player:caught, and animal control drives you back to your last checkpoint.
// A tourist selfie flash (selfie:flash) pulls the nearest guard over to look.
// Rats are beneath their notice.
import * as THREE from 'three';
import { bus, state, cellCenter } from '../contracts';
import { placeModel } from '../look/models';
import { resolveCircle, type BuiltLevel } from './level';

const WALK = 2;
const RUN = 3.6;
const SIGHT = 8.5;
const SIGHT_ANGLE = 0.5; // radians either side
const CATCH_SECONDS = 1.1;
const GRACE = 4;
const LOOK_AROUND = 4;

interface Guard {
  obj: THREE.Group;
  route: { x: number; z: number }[];
  next: number;
  heading: number;
  alert: { x: number; z: number; linger: number; timeout: number } | null;
  seen: number;
  spotted: boolean;
}

export class Patrols {
  readonly root = new THREE.Group();
  private guards: Guard[] = [];
  private grace = 0;
  private lastSeen = 0;
  private level: BuiltLevel;

  constructor(level: BuiltLevel, routes: [number, number][][]) {
    this.level = level;
    const mat = new THREE.MeshStandardMaterial({ color: 0x15192a, roughness: 0.8 });
    const cone = new THREE.MeshBasicMaterial({
      color: 0xfff1c8,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (const r of routes) {
      const route = r.map(([c, row]) => cellCenter(c, row));
      if (!route.length) continue;
      const obj = new THREE.Group();
      obj.add(placeModel('npc_security', { x: 0.6, y: 1.85, z: 0.4 }, mat));

      // Torch: a real spot light plus a visible beam in the haze.
      const torch = new THREE.SpotLight(0xfff1c8, 140, SIGHT + 2, SIGHT_ANGLE, 0.5, 1.5);
      torch.position.set(0.25, 1.4, 0.3);
      torch.target.position.set(0, 0, SIGHT);
      obj.add(torch, torch.target);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(SIGHT_ANGLE) * SIGHT, SIGHT, 20, 1, true), cone);
      beam.rotation.x = -Math.PI / 2 - 0.12;
      beam.position.set(0.25, 1, SIGHT / 2 + 0.3);
      obj.add(beam);

      obj.position.set(route[0].x, 0, route[0].z);
      this.root.add(obj);
      this.guards.push({ obj, route, next: 1 % route.length, heading: 0, alert: null, seen: 0, spotted: false });
    }

    bus.on('selfie:flash', ({ x, z }) => this.alert(x, z));
    bus.on('player:teleport', () => {
      this.grace = GRACE;
      this.guards.forEach((g) => (g.seen = 0));
    });
  }

  update(dt: number, player: THREE.Vector3): void {
    this.grace = Math.max(0, this.grace - dt);
    const ignore = !state.started || !!state.ending || state.inputLocked || state.rat || this.grace > 0;
    let worst = 0;

    for (const g of this.guards) {
      const p = g.obj.position;
      const canSee = !ignore && this.sees(g, player);

      if (canSee) {
        // Freeze and keep the torch on you.
        g.heading = turn(g.heading, Math.atan2(player.x - p.x, player.z - p.z), dt * 6);
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        g.seen += (dt / CATCH_SECONDS) * (1.4 - (d / SIGHT) * 0.7);
        if (!g.spotted) {
          g.spotted = true;
          bus.emit('npc:talk', { npc: 'security', lineId: 'npcs:security.lines.0' });
        }
      } else {
        g.seen = Math.max(0, g.seen - dt * 0.5);
        if (g.seen === 0) g.spotted = false;
        this.walk(g, dt);
      }
      g.obj.rotation.y = g.heading;
      worst = Math.max(worst, g.seen);

      if (g.seen >= 1) {
        this.guards.forEach((o) => {
          o.seen = 0;
          o.spotted = false;
        });
        worst = 0;
        bus.emit('player:caught', { by: 'security' });
        break;
      }
    }

    if (worst > 0 || this.lastSeen > 0) bus.emit('player:seen', { amount: Math.min(1, worst) });
    if (worst > 0 && this.lastSeen === 0) bus.emit('ui:say', { key: 'story:spirit_guide.seen', seconds: 2.5 });
    this.lastSeen = worst;
  }

  private walk(g: Guard, dt: number): void {
    const p = g.obj.position;
    let target: { x: number; z: number };
    let speed = WALK;
    if (g.alert) {
      target = g.alert;
      speed = RUN;
      g.alert.timeout -= dt;
      if (Math.hypot(target.x - p.x, target.z - p.z) < 1.2 || g.alert.timeout <= 0) {
        // Look around where the flash was, then go back to the route.
        g.alert.linger -= dt;
        g.heading += dt * 1.8;
        if (g.alert.linger <= 0) {
          g.alert = null;
          g.next = this.nearestPoint(g);
        }
        return;
      }
    } else {
      target = g.route[g.next];
      if (Math.hypot(target.x - p.x, target.z - p.z) < 0.3) {
        g.next = (g.next + 1) % g.route.length;
        return;
      }
    }
    const want = Math.atan2(target.x - p.x, target.z - p.z);
    g.heading = turn(g.heading, want, dt * 4);
    p.x += Math.sin(want) * speed * dt;
    p.z += Math.cos(want) * speed * dt;
    resolveCircle(this.level.colliders, p, 0.35);
  }

  private sees(g: Guard, player: THREE.Vector3): boolean {
    const p = g.obj.position;
    const dx = player.x - p.x;
    const dz = player.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT || d < 0.01) return false;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - g.heading), Math.cos(Math.atan2(dx, dz) - g.heading)));
    if (off > SIGHT_ANGLE) return false;
    // Walls, pillars and counters block the torch.
    const steps = Math.ceil(d / 0.4);
    for (let i = 1; i < steps; i++) {
      const x = p.x + (dx * i) / steps;
      const z = p.z + (dz * i) / steps;
      for (const c of this.level.colliders) {
        if (c.enabled && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
      }
    }
    return true;
  }

  private alert(x: number, z: number): void {
    let best: Guard | null = null;
    let bestD = Infinity;
    for (const g of this.guards) {
      const d = Math.hypot(g.obj.position.x - x, g.obj.position.z - z);
      if (d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) best.alert = { x, z, linger: LOOK_AROUND, timeout: 12 };
  }

  private nearestPoint(g: Guard): number {
    let best = 0;
    let bestD = Infinity;
    g.route.forEach((r, i) => {
      const d = Math.hypot(r.x - g.obj.position.x, r.z - g.obj.position.z);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }
}

function turn(from: number, to: number, amount: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-amount, Math.min(amount, diff));
}
