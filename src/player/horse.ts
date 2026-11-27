// Player: the horse, with spring wobble and clumsy hooves. Owned by Dee, built by Gemini Neon (issues #2, #3).
// Separate parts so code can wobble them. Emma's horse_*.glb parts replace the boxes when present:
// horse_body, horse_neck, horse_head, horse_leg (used four times). Origin at the base, facing +Z.
import * as THREE from 'three';
import { bus, state, TRIP_MAX } from '../contracts';
import { placeModel } from '../look/models';

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  pressed.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const pressed = new Set<string>();

const RADIUS = 0.45;
const SPEED = 5;
const LEG_LENGTH = 0.8;
/** Time in the club until the steering is fully drunk (trip makes it worse on top). */
const SOBER_UP_SECONDS = 90;

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
  /** Looking down at your own front leg. */
  private look = 0;
  private lastStepPhase = 0;
  private resolve: Resolver;
  private scale = 1;
  private input = new THREE.Vector3();
  /** Facing, and how fast it's swinging. */
  private heading = 0;
  private turnVel = 0;
  private lurchIn = 2;
  /** Seconds played. Steering gets harder with it. */
  private playTime = 0;
  /** Which way the camera looks (yaw). WASD is relative to it, so W is always 'away from the camera'. */
  cameraYaw = Math.PI;
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

    bus.on('player:teleport', ({ x, z }) => {
      this.root.position.set(x, 0, z);
      this.velocity.set(0, 0, 0);
      this.turnVel = 0;
    });
    bus.on('floor:wet', ({ x, z, radius, seconds }) => this.wet.push({ x, z, r: radius, left: seconds }));
    bus.on('player:rat', ({ active }) => {
      this.mat.color.set(active ? 0x6b6b70 : 0x8b5a2b);
    });
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  get facing(): number {
    return this.heading;
  }

  update(dt: number): void {
    const free = state.started && !state.inputLocked && !state.ending;
    const k = state.trip / TRIP_MAX;
    const wobbleBoost = 1 + k * 2;

    const input = this.input.set(0, 0, 0);
    if (free) {
      input.set(
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        0,
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
      );
    }
    if (input.lengthSq() > 0) input.normalize();
    // Turn the keys into world directions for the current camera.
    if (input.lengthSq() > 0) {
      const r = this.cameraYaw - Math.PI;
      const c = Math.cos(r);
      const sn = Math.sin(r);
      input.set(input.x * c + input.z * sn, 0, -input.x * sn + input.z * c);
    }

    // Drunk steering. You go where you're facing, not where you press. Turning is a spring, speed builds
    // and carries on when you let go, and later you lurch. It starts soft so you can learn it, then gets
    // worse the longer you're in the club and the higher your trip: `drunk` goes from 0 to 1.
    if (state.started && !state.ending) this.playTime += dt;
    const drunk = Math.min(1, Math.min(1, this.playTime / SOBER_UP_SECONDS) * 0.6 + k * 0.5);
    const wants = input.lengthSq() > 0;
    if (wants) {
      const want = Math.atan2(input.x, input.z) + Math.sin(this.t * 0.9) * drunk * 0.5;
      // Sober: stiff and well damped, it just turns. Drunk: loose, it swings past and back.
      const stiffness = 40 - drunk * 24;
      const damping = 9 - drunk * 6.5;
      this.turnVel += (angleDiff(want, this.heading) * stiffness - this.turnVel * damping) * dt;
    } else {
      this.turnVel *= Math.exp(-3 * dt);
    }
    if (state.clubMateActive) this.turnVel += (Math.random() - 0.5) * 30 * dt;
    this.heading += this.turnVel * dt;

    // How well you're lined up with where you want to go: badly lined up means slow.
    const aligned = wants ? Math.max(0, Math.cos(angleDiff(Math.atan2(input.x, input.z), this.heading))) : 0;
    const speed = SPEED * (state.rat ? 1.3 : 1) * (0.7 - drunk * 0.35 + (0.3 + drunk * 0.35) * aligned);
    this.target.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(wants ? speed : 0);

    // Lurch: a sideways stumble now and then. None at first; more often and harder as you get drunker.
    this.lurchIn -= dt;
    if (this.lurchIn <= 0 && state.started && drunk > 0.2) {
      this.lurchIn = 1.2 + Math.random() * (4 - drunk * 2.5);
      const side = Math.random() < 0.5 ? -1 : 1;
      const power = drunk * 3.2;
      this.velocity.x += Math.cos(this.heading) * side * power;
      this.velocity.z -= Math.sin(this.heading) * side * power;
      this.swayVel += side * 2;
    }

    // Wet floor: almost no grip, you keep sliding.
    this.wet = this.wet.filter((w) => (w.left -= dt) > 0);
    const p = this.root.position;
    const slippy = this.wet.some((w) => (p.x - w.x) ** 2 + (p.z - w.z) ** 2 < w.r * w.r);
    const grip = slippy ? 0.6 : wants ? 4 - drunk * 1.8 : 3 - drunk * 1.6;
    this.velocity.lerp(this.target, 1 - Math.exp(-grip * dt));
    this.root.position.addScaledVector(this.velocity, dt);
    this.resolve(this.root.position, RADIUS * this.scale);

    const v = this.velocity.length();
    this.root.rotation.y = this.heading;

    // Actions.
    if (free && pressed.has('Space')) {
      const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      const p = this.root.position.clone().addScaledVector(fwd, 0.7);
      bus.emit('player:grab', { x: p.x, z: p.z });
      this.pitchVel -= 3;
    }
    if (free && pressed.has('KeyE')) {
      bus.emit('player:stomp', { x: this.root.position.x, z: this.root.position.z, time: performance.now() });
      bus.emit('player:step', {});
      this.stomp = 1;
    }
    if (free && pressed.has('KeyQ')) {
      bus.emit('player:look', {});
      this.look = 1;
    }
    pressed.clear();

    // Spring sway: the drunk wobble.
    this.t += dt * (2 + v * 2);
    const jitter = state.clubMateActive ? (Math.random() - 0.5) * 6 : 0;
    const force = Math.sin(this.t * 1.3) * (v * 0.6 + k * 0.8) * wobbleBoost + jitter - this.sway * 30 - this.swayVel * 3;
    this.swayVel += force * dt;
    this.sway += this.swayVel * dt;
    const pitchForce = -this.pitch * 40 - this.pitchVel * 5;
    this.pitchVel += pitchForce * dt;
    this.pitch += this.pitchVel * dt;

    this.stomp = Math.max(0, this.stomp - dt * 5);
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
      const shake = state.clubMateActive ? (Math.random() - 0.5) * 0.3 : 0;
      leg.rotation.x = Math.sin(phase) * 0.5 * gait * (1 + k) + shake - (i < 2 ? this.stomp * 0.9 : 0) - (leg.userData.lift ?? 0) * 1.2;
      leg.rotation.z = Math.sin(phase * 0.5) * 0.1 * k;
    });

    // A hoof hits the floor twice per gait cycle.
    const stepPhase = Math.sin(this.t * 3);
    if (gait > 0.3 && Math.sign(stepPhase) !== Math.sign(this.lastStepPhase)) bus.emit('player:step', {});
    this.lastStepPhase = stepPhase;

    // Rat mode shrinks you.
    const targetScale = state.rat ? 0.35 : 1;
    this.scale += (targetScale - this.scale) * (1 - Math.exp(-6 * dt));
    this.rig.scale.setScalar(this.scale);

    bus.emit('player:moved', { x: this.root.position.x, z: this.root.position.z });
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
