// Player: the horse, with spring wobble and clumsy hooves. Owned by Dee, built by Gemini Neon (issues #2, #3).
// Separate parts so code can wobble them. Emma's horse_*.glb parts replace the boxes when present:
// horse_body, horse_neck, horse_head, horse_leg (used four times). Origin at the base, facing +Z.
import * as THREE from 'three';
import { bus, state, TRIP_MAX, FLOOR_HEIGHT } from '../contracts';
import { placeModel } from '../look/models';

const keys = new Set<string>();
const pressed = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (state.started && !state.inputLocked && !state.ending) pressed.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  pressed.clear();
});

const RADIUS = 0.45;
const HEAD_RADIUS = 0.44;
const REAR_RADIUS = 0.4;
const SPEED = 5;
const BACK_SPEED = 2.8;
const TURN_SPEED = 2.4;
const LEG_LENGTH = 0.8;
/** Time in the club until the time-based part of the steering is fully drunk (trip makes it worse on top).
 *  Tune here: lower = gets hard faster. #67 wants first-timers through the hall in 90 s, veterans fighting for every turn. */
const SOBER_UP_SECONDS = 45;

export type CameraMode = 'follow' | 'eyes';
export type Resolver = (pos: THREE.Vector3, radius: number) => void;

export class Horse {
  root = new THREE.Group();
  private rig = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
  private velocity = new THREE.Vector3();
  private sway = 0;
  private swayVel = 0;
  private pitch = 0;
  private pitchVel = 0;
  private t = 0;
  private stomp = 0;
  private stompRing: THREE.Mesh;
  private stompRingMat: THREE.MeshBasicMaterial;
  private stompPulse = 0;
  /** Looking down at your own front leg. */
  private look = 0;
  private lastStepPhase = 0;
  private resolve: Resolver;
  private prevPos = new THREE.Vector3();
  private probe = new THREE.Vector3();
  /** Facing, and how fast it's swinging. */
  private heading = 0;
  private turnVel = 0;
  private lurchIn = 2;
  /** Seconds played. Steering gets harder with it. */
  private playTime = 0;
  private cameraMode: CameraMode = 'follow';
  private target = new THREE.Vector3();
  /** Wet floor from the cleaner: x, z, radius, seconds left. */
  private wet: { x: number; z: number; r: number; left: number }[] = [];

  constructor(resolve: Resolver) {
    this.resolve = resolve;
    this.root.add(this.rig);

    // Body sits on the hips at leg height.
    this.body.position.y = LEG_LENGTH;
    this.body.add(placeModel('horse_body', { x: 0.6, y: 0.6, z: 1.4 }, this.mat));
    this.rig.add(this.body);

    // Neck pivots at the front top of the body, head on top of the neck.
    this.neck.position.set(0, 0.45, 0.55);
    this.neck.rotation.x = 0.5;
    this.neck.add(placeModel('horse_neck', { x: 0.25, y: 0.6, z: 0.25 }, this.mat));
    this.body.add(this.neck);
    this.head.position.set(0, 0.55, 0.05);
    this.head.rotation.x = -0.5;
    const headModel = placeModel('horse_head', { x: 0.35, y: 0.4, z: 0.6 }, this.mat);
    headModel.position.z = 0.15;
    this.head.add(headModel);
    this.neck.add(this.head);

    // Legs pivot at the hip, model hangs down to the floor.
    for (const [x, z] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) {
      const hip = new THREE.Group();
      hip.position.set(x, LEG_LENGTH, z);
      const leg = placeModel('horse_leg', { x: 0.15, y: LEG_LENGTH, z: 0.15 }, this.mat);
      leg.position.y = -LEG_LENGTH;
      hip.add(leg);
      this.legs.push(hip);
      this.rig.add(hip);
    }

    // Subtle ground shockwave ring when stomping on the beat.
    this.stompRingMat = new THREE.MeshBasicMaterial({
      color: 0xdbe9ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.stompRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 24), this.stompRingMat);
    this.stompRing.rotation.x = -Math.PI / 2;
    this.stompRing.position.y = 0.04;
    this.stompRing.visible = false;
    this.root.add(this.stompRing);

    bus.on('player:teleport', ({ x, z }) => {
      this.root.position.set(x, state.floor * FLOOR_HEIGHT, z);
      this.velocity.set(0, 0, 0);
      this.turnVel = 0;
    });
    // Caught or passed out: a fresh start. The steering goes back to soft and ramps up again,
    // so a respawn never drops you straight back into the hardest steering.
    bus.on('player:respawn', () => {
      this.playTime = 0;
      this.turnVel = 0;
      this.lurchIn = 2;
    });
    // Pulled into a conversation: stop dead.
    bus.on('npc:focus', () => {
      this.velocity.set(0, 0, 0);
      this.turnVel = 0;
    });
    bus.on('player:floor', ({ floor }) => (this.root.position.y = floor * FLOOR_HEIGHT));
    bus.on('floor:wet', ({ x, z, radius, seconds }) => this.wet.push({ x, z, r: radius, left: seconds }));
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  setElevation(y: number): void {
    this.root.position.y = y;
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  get facing(): number {
    return this.heading;
  }

  /** 3-circle spine resolution so the horse's nose and rump never clip through walls. */
  private resolveBody(): void {
    const pos = this.root.position;
    this.resolve(pos, RADIUS);

    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);

    const headOff = 0.88 + Math.sin(this.look * Math.PI) * 0.36;
    this.probe.set(pos.x + fwdX * headOff, pos.y, pos.z + fwdZ * headOff);
    const hx = this.probe.x;
    const hz = this.probe.z;
    this.resolve(this.probe, HEAD_RADIUS);
    pos.x += this.probe.x - hx;
    pos.z += this.probe.z - hz;

    const rearOff = -0.32;
    this.probe.set(pos.x + fwdX * rearOff, pos.y, pos.z + fwdZ * rearOff);
    const rx = this.probe.x;
    const rz = this.probe.z;
    this.resolve(this.probe, REAR_RADIUS);
    pos.x += this.probe.x - rx;
    pos.z += this.probe.z - rz;

    this.resolve(pos, RADIUS);
  }

  update(dt: number): void {
    const free = state.started && !state.inputLocked && !state.ending;
    const k = state.trip / TRIP_MAX;
    const wobbleBoost = 1 + k * 2;

    // Drunk steering. It starts soft so you can learn it, then gets worse the longer
    // you're in the club and the higher your trip: `drunk` goes from 0 to 1.
    if (state.started && !state.ending) this.playTime += dt;
    const drunk = Math.min(1, Math.min(1, this.playTime / SOBER_UP_SECONDS) * 0.65 + k * 0.55);

    // Follow and first person: W/S move, A/D steer. Drunk drift stays bounded.
    const forward = free
      ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
      : 0;
    const steer = free
      ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
      : 0;
    const wants = forward !== 0;

    const drift = free && (forward !== 0 || steer !== 0) ? Math.sin(this.t * 0.9) * drunk * 0.75 : 0;
    const wantTurn = steer * TURN_SPEED + drift;
    const response = 11 - drunk * 6.5;
    this.turnVel += (wantTurn - this.turnVel) * (1 - Math.exp(-response * dt));
    if (free && state.clubMateActive) this.turnVel += (Math.random() - 0.5) * 14 * dt;
    const maxTurn = TURN_SPEED * 1.45;
    this.turnVel = Math.max(-maxTurn, Math.min(maxTurn, this.turnVel));
    this.heading += this.turnVel * dt;

    const moveSpeed = forward > 0 ? SPEED : forward < 0 ? -BACK_SPEED : 0;
    this.target.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(moveSpeed);

    // Lurch: a sideways stumble now and then. None at first; more often and harder as you get drunker.
    if (free) {
      this.lurchIn -= dt;
      if (this.lurchIn <= 0 && drunk > 0.2) {
        this.lurchIn = 1.0 + Math.random() * (3.4 - drunk * 2.2);
        const side = Math.random() < 0.5 ? -1 : 1;
        const power = drunk * 3.4;
        this.velocity.x += Math.cos(this.heading) * side * power;
        this.velocity.z -= Math.sin(this.heading) * side * power;
        this.swayVel += side * 2;
      }
    }

    // Wet floor: almost no grip, you keep sliding.
    this.wet = this.wet.filter((w) => (w.left -= dt) > 0);
    const p = this.root.position;
    const slippy = this.wet.some((w) => (p.x - w.x) ** 2 + (p.z - w.z) ** 2 < w.r * w.r);
    const grip = slippy ? 0.6 : wants ? 4 - drunk * 1.8 : 3 - drunk * 1.6;
    this.velocity.lerp(this.target, 1 - Math.exp(-grip * dt));

    this.prevPos.copy(this.root.position);
    this.root.position.addScaledVector(this.velocity, dt);
    this.resolveBody();
    // Sync velocity with resolved displacement so the horse doesn't gallop in place against walls.
    if (dt > 1e-4) {
      this.velocity.set(
        (this.root.position.x - this.prevPos.x) / dt,
        0,
        (this.root.position.z - this.prevPos.z) / dt,
      );
      if (this.velocity.lengthSq() > 144) this.velocity.setLength(12);
    }

    const v = this.velocity.length();
    this.root.rotation.y = this.heading;

    // Actions.
    if (free && pressed.has('Space')) {
      const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      const grabAt = this.root.position.clone().addScaledVector(fwd, 0.7);
      bus.emit('player:grab', { x: grabAt.x, z: grabAt.z });
      this.pitchVel -= 3;
    }
    if (free && pressed.has('KeyE')) {
      bus.emit('player:stomp', { x: this.root.position.x, z: this.root.position.z, time: performance.now() });
      bus.emit('player:step', {});
      this.stomp = 1;
      this.stompPulse = 1;
    }
    if (free && pressed.has('KeyQ')) {
      bus.emit('player:look', {});
      this.look = 1;
    }
    pressed.clear();

    // Spring sway: the drunk wobble.
    this.t += dt * (2 + v * 2);
    const jitter = free && state.clubMateActive ? (Math.random() - 0.5) * 6 : 0;
    const force = Math.sin(this.t * 1.3) * (v * 0.6 + k * 0.8) * wobbleBoost + jitter - this.sway * 30 - this.swayVel * 3;
    this.swayVel += force * dt;
    this.sway += this.swayVel * dt;
    if (this.sway > 0.28) {
      this.sway = 0.28;
      if (this.swayVel > 0) this.swayVel = 0;
    } else if (this.sway < -0.28) {
      this.sway = -0.28;
      if (this.swayVel < 0) this.swayVel = 0;
    }
    const pitchForce = -this.pitch * 40 - this.pitchVel * 5;
    this.pitchVel += pitchForce * dt;
    this.pitch += this.pitchVel * dt;

    this.stomp = Math.max(0, this.stomp - dt * 5);
    if (this.stompPulse > 0) {
      this.stompPulse = Math.max(0, this.stompPulse - dt * 2.8);
      const p = 1 - this.stompPulse;
      this.stompRing.visible = this.stompPulse > 0.01;
      this.stompRing.scale.setScalar(1 + p * 2.8);
      this.stompRingMat.opacity = this.stompPulse * 0.45;
    } else if (this.stompRing.visible) {
      this.stompRing.visible = false;
    }
    this.look = Math.max(0, this.look - dt * 0.8);
    this.rig.rotation.z = this.sway;
    this.rig.rotation.x = this.pitch * 0.2 - this.stomp * 0.15;
    this.rig.position.y = -this.stomp * 0.08;
    this.neck.rotation.z = this.sway * 1.2;
    this.neck.rotation.x = 0.5 + Math.sin(this.t * 2) * 0.08 * (v + k) + this.pitch * 0.4 + Math.sin(this.look * Math.PI) * 1.1;
    this.legs[0].userData.lift = Math.sin(this.look * Math.PI);

    const gait = Math.min(v / 2, 1);
    this.legs.forEach((leg, i) => {
      const phase = this.t * 3 + (i === 0 || i === 3 ? 0 : Math.PI);
      const shake = free && state.clubMateActive ? (Math.random() - 0.5) * 0.3 : 0;
      leg.rotation.x = Math.sin(phase) * 0.5 * gait * (1 + k) + shake - (i < 2 ? this.stomp * 0.9 : 0) - (leg.userData.lift ?? 0) * 1.2;
      leg.rotation.z = Math.sin(phase * 0.5) * 0.1 * k;
    });

    // A hoof hits the floor twice per gait cycle.
    const stepPhase = Math.sin(this.t * 3);
    if (gait > 0.3 && Math.sign(stepPhase) !== Math.sign(this.lastStepPhase)) bus.emit('player:step', {});
    this.lastStepPhase = stepPhase;


    bus.emit('player:moved', { x: this.root.position.x, z: this.root.position.z });
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
