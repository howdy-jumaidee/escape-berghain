// Security patrols. Issue #12.
// Guards walk fixed routes from levels/level1.json with a torch. If the torch finds you and stays on you,
// you're caught: player:caught, and animal control drives you back to your last checkpoint.
// A tourist selfie flash (selfie:flash) pulls the nearest guard over to look.
import * as THREE from 'three';
import { bus, state, cellCenter } from '../contracts';
import { placeModel } from '../look/models';
import { resolveCircle, type BuiltLevel } from './level';

const WALK = 2;
const RUN = 3.1;
const SIGHT = 6.5; // detection distance, metres. Smaller = more room to hide in the crowd (#68 balance). Playtests: 8 was too punishing.
/** Closing time: everyone moves faster and sees further. */
const FINALE_SPEED = 1.5;
const FINALE_SIGHT = 1.25;
const SIGHT_ANGLE = 0.5; // radians either side
const CATCH_SECONDS = 2; // seconds of torchlight before you're caught. Playtests: 1.1 left no time to react.
const GRACE = 4;
/** No torchlight for the first 40 s after landing, so the opening minute is safe to explore. */
const START_GRACE = 40;
const LOOK_AROUND = 4;

interface GuardRig {
  body?: THREE.Object3D;
  spine?: THREE.Object3D;
  head?: THREE.Object3D;
  armL?: THREE.Object3D;
  foreArmL?: THREE.Object3D;
  armR?: THREE.Object3D;
  foreArmR?: THREE.Object3D;
  legL?: THREE.Object3D;
  calfL?: THREE.Object3D;
  legR?: THREE.Object3D;
  calfR?: THREE.Object3D;
  bodyY: number;
  bodyIsRoot: boolean;
}

interface Guard {
  obj: THREE.Group;
  model: THREE.Group;
  route: { x: number; z: number }[];
  next: number;
  heading: number;
  alert: { x: number; z: number; linger: number; timeout: number } | null;
  seen: number;
  spotted: boolean;
  phase: number;
  lookPhase: number;
  stride: number;
  rigSource: THREE.Object3D | null;
  rig: GuardRig | null;
}

export class Patrols {
  readonly root = new THREE.Group();
  private guards: Guard[] = [];
  private grace = 0;
  private lastSeen = 0;
  private level: BuiltLevel;
  private blocker: (x: number, z: number) => boolean = () => false;
  private finale = false;
  private torches: THREE.SpotLight[] = [];
  private beamMeshes: THREE.Mesh[] = [];
  private beams: THREE.MeshBasicMaterial;

  constructor(level: BuiltLevel, routes: [number, number][][]) {
    this.level = level;
    const mat = new THREE.MeshStandardMaterial({ color: 0x15192a, roughness: 0.8 });
    const cone = new THREE.MeshBasicMaterial({
      color: 0xfff1c8,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Guards start at the route point farthest from the player spawn, so nobody is near you when you land.
    const spawn = this.level.spawn('main_hall');

    for (const r of routes) {
      const route = r.map(([c, row]) => cellCenter(c, row));
      if (!route.length) continue;
      let start = 0;
      let startD = -1;
      route.forEach((pt, i) => {
        const d = Math.hypot(pt.x - spawn.x, pt.z - spawn.z);
        if (d > startD) {
          startD = d;
          start = i;
        }
      });
      const obj = new THREE.Group();
      const model = placeModel('npc_security', { x: 0.6, y: 1.85, z: 0.4 }, mat);
      obj.add(model);

      // Torch: a real spot light plus a visible beam in the haze.
      const torch = new THREE.SpotLight(0xfff1c8, 80, SIGHT + 2, SIGHT_ANGLE, 0.5, 1.5);
      torch.position.set(0.25, 1.4, 0.3);
      torch.target.position.set(0, 0, SIGHT);
      obj.add(torch, torch.target);
      this.torches.push(torch);
      // Visible beam only: narrower and fainter than the real sight cone so the lamp doesn't fill the hall.
      const beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(SIGHT_ANGLE) * SIGHT * 0.55, SIGHT, 20, 1, true), cone);
      beam.rotation.x = -Math.PI / 2 - 0.12;
      beam.position.set(0.25, 1, SIGHT / 2 + 0.3);
      obj.add(beam);
      this.beamMeshes.push(beam);

      obj.position.set(route[start].x, 0, route[start].z);
      this.root.add(obj);
      this.guards.push({
        obj,
        model,
        route,
        next: (start + 1) % route.length,
        heading: 0,
        alert: null,
        seen: 0,
        spotted: false,
        phase: 0,
        lookPhase: 0,
        stride: 0,
        rigSource: null,
        rig: null,
      });
    }

    this.beams = cone;
    bus.on('selfie:flash', ({ x, z }) => this.alert(x, z));
    bus.on('game:finale', () => {
      this.finale = true;
      this.beams.color.set(0xff3030);
      this.beams.opacity = 0.08;
      this.torches.forEach((t) => {
        t.color.set(0xff5040);
        t.distance = (SIGHT + 2) * FINALE_SIGHT;
        t.target.position.z = SIGHT * FINALE_SIGHT;
      });
      this.beamMeshes.forEach((b) => {
        b.scale.setScalar(FINALE_SIGHT);
        b.position.z = (SIGHT * FINALE_SIGHT) / 2 + 0.3;
      });
    });
    bus.on('player:respawn', () => {
      this.grace = GRACE;
      this.guards.forEach((g) => {
        g.seen = 0;
        g.spotted = false;
      });
    });
    // The respawn grace only fires on player:respawn; the game start needs its own, longer one.
    bus.on('intro:land', () => {
      this.grace = START_GRACE;
      this.guards.forEach((g) => {
        g.seen = 0;
        g.spotted = false;
      });
    });
  }

  update(dt: number, player: THREE.Vector3): void {
    this.grace = Math.max(0, this.grace - dt);
    const ignore = !state.started || !!state.ending || state.inputLocked || this.grace > 0;
    const sight = SIGHT * (this.finale ? FINALE_SIGHT : 1);
    let worst = 0;

    for (const g of this.guards) {
      const p = g.obj.position;
      const prevX = p.x;
      const prevZ = p.z;
      const canSee = !ignore && this.sees(g, player);
      let looking = false;

      if (canSee) {
        // Freeze and keep the torch on you.
        g.heading = turn(g.heading, Math.atan2(player.x - p.x, player.z - p.z), dt * 6);
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        g.seen += (dt / CATCH_SECONDS) * (1.4 - (d / sight) * 0.7) * (this.finale ? 1.3 : 1);
        if (!g.spotted) {
          g.spotted = true;
          bus.emit('npc:talk', { npc: 'security', lineId: 'npcs:security.lines.0' });
        }
      } else {
        g.seen = Math.max(0, g.seen - dt * 0.5);
        if (g.seen === 0) g.spotted = false;
        looking = this.walk(g, dt);
      }
      g.obj.rotation.y = g.heading;
      const moveSpeed = dt > 1e-4 ? Math.hypot(p.x - prevX, p.z - prevZ) / dt : 0;
      this.animateGuard(g, moveSpeed, dt, looking);
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
    this.lastSeen = worst;
  }

  /** Returns true when the guard is paused and looking around at an alert spot. */
  private walk(g: Guard, dt: number): boolean {
    const p = g.obj.position;
    let target: { x: number; z: number };
    let speed = WALK * (this.finale ? FINALE_SPEED : 1);
    if (g.alert) {
      target = g.alert;
      speed = RUN * (this.finale ? FINALE_SPEED : 1);
      g.alert.timeout -= dt;
      if (Math.hypot(target.x - p.x, target.z - p.z) < 1.2 || g.alert.timeout <= 0) {
        // Look around where the flash was, then go back to the route.
        g.alert.linger -= dt;
        g.heading += dt * 1.8;
        if (g.alert.linger <= 0) {
          g.alert = null;
          g.next = this.nearestPoint(g);
        }
        return true;
      }
    } else {
      target = g.route[g.next];
      if (Math.hypot(target.x - p.x, target.z - p.z) < 0.3) {
        g.next = (g.next + 1) % g.route.length;
        return false;
      }
    }
    const want = Math.atan2(target.x - p.x, target.z - p.z);
    g.heading = turn(g.heading, want, dt * 4);
    p.x += Math.sin(want) * speed * dt;
    p.z += Math.cos(want) * speed * dt;
    resolveCircle(this.level.colliders, p, 0.35);
    return false;
  }

  private getRig(g: Guard): GuardRig | null {
    const modelNode = g.model.children[0] ?? null;
    if (!modelNode) return null;
    if (g.rigSource === modelNode) return g.rig;
    const rig: GuardRig = { bodyY: 0, bodyIsRoot: false };
    let found = false;
    g.model.traverse((c) => {
      if (
        c.name === 'body' ||
        c.name === 'spine' ||
        c.name === 'head' ||
        c.name === 'armL' ||
        c.name === 'foreArmL' ||
        c.name === 'armR' ||
        c.name === 'foreArmR' ||
        c.name === 'legL' ||
        c.name === 'calfL' ||
        c.name === 'legR' ||
        c.name === 'calfR'
      ) {
        rig[c.name] = c;
        found = true;
      }
    });
    if (rig.body) {
      rig.bodyY = rig.body.position.y;
      rig.bodyIsRoot = Boolean((rig.body as THREE.Bone).isBone);
    }
    g.rigSource = modelNode;
    g.rig = found ? rig : null;
    return g.rig;
  }

  private animateGuard(g: Guard, speed: number, dt: number, looking: boolean): void {
    const rig = this.getRig(g);
    if (!rig) return;
    const moving = speed > 0.15;
    const targetAmp = moving ? Math.min(0.68, 0.25 + speed * 0.11) : 0;
    g.stride += (targetAmp - g.stride) * (1 - Math.exp(-10 * dt));
    if (moving) g.phase += dt * (3.2 + speed * 1.55);

    const strideBlend = Math.min(1, g.stride / 0.28);
    const s = Math.sin(g.phase);
    const swing = s * g.stride;

    // Articulated leg stride with rear-swing knee flexion (+rotation.x bends calf backward).
    const liftL = Math.max(0, Math.cos(g.phase - 0.35));
    const liftR = Math.max(0, -Math.cos(g.phase - 0.35));
    const kneeAmp = 0.58 + Math.min(0.28, speed * 0.08);
    if (rig.legL) rig.legL.rotation.x = -swing;
    if (rig.legR) rig.legR.rotation.x = swing;
    if (rig.calfL) rig.calfL.rotation.x = strideBlend * (0.06 + liftL * kneeAmp);
    if (rig.calfR) rig.calfR.rotation.x = strideBlend * (0.06 + liftR * kneeAmp);

    // Subtle vertical pelvis stride bob when rooted on a skinned skeleton.
    if (rig.body && rig.bodyIsRoot) {
      rig.body.position.y = rig.bodyY - 0.014 * strideBlend + Math.abs(s) * 0.032 * strideBlend;
    }

    // Torch is mounted on the +X side (armL): keep torch arm steady & aimed forward while off-hand (armR) swings.
    const torchBob = Math.abs(s) * 0.05 * strideBlend;
    if (rig.armL) {
      rig.armL.rotation.x = -0.62 - torchBob;
      rig.armL.rotation.z = 0.06;
    }
    if (rig.foreArmL) {
      rig.foreArmL.rotation.x = -0.56 + torchBob * 0.5;
    }
    if (rig.armR) {
      rig.armR.rotation.x = -swing * 0.85;
      rig.armR.rotation.z = -0.08;
    }
    if (rig.foreArmR) {
      rig.foreArmR.rotation.x = -0.34 - strideBlend * (0.12 + Math.max(0, s) * 0.28);
    }

    if (looking) g.lookPhase += dt;
    else g.lookPhase = 0;

    // Spine counter-twist during walk/run, or alert scan sweep when looking around.
    if (rig.spine) {
      if (looking) {
        rig.spine.rotation.x = 0.05;
        rig.spine.rotation.y = Math.sin(g.lookPhase * 1.6) * 0.22;
        rig.spine.rotation.z = 0;
      } else {
        rig.spine.rotation.x = 0.03 + Math.min(0.08, speed * 0.022) * strideBlend;
        rig.spine.rotation.y = swing * 0.24;
        rig.spine.rotation.z = -swing * 0.04;
      }
    }

    if (rig.head) {
      rig.head.rotation.y = looking ? Math.sin(g.lookPhase * 1.6) * 0.45 : -swing * 0.10;
      rig.head.rotation.x = moving ? Math.abs(Math.cos(g.phase)) * 0.04 : 0;
    }
  }

  private sees(g: Guard, player: THREE.Vector3): boolean {
    const p = g.obj.position;
    const dx = player.x - p.x;
    const dz = player.z - p.z;
    const d = Math.hypot(dx, dz);
    const sight = SIGHT * (this.finale ? FINALE_SIGHT : 1);
    if (d > sight || d < 0.01) return false;
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
      // Dancers block the torch too: hide in the crowd. Not right next to the guard, though.
      if (i > 2 && this.blocker(x, z)) return false;
    }
    return true;
  }

  setBlocker(blocks: (x: number, z: number) => boolean): void {
    this.blocker = blocks;
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
