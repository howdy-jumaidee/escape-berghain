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
    });
    bus.on('player:rat', ({ active }) => {
      this.mat.color.set(active ? 0x6b6b70 : 0x8b5a2b);
    });
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  update(dt: number): void {
    const free = state.started && !state.inputLocked && !state.ending;
    const k = state.trip / TRIP_MAX;
    const wobbleBoost = 1 + k * 2;

    const input = new THREE.Vector3();
    if (free) {
      input.set(
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        0,
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
      );
    }
    if (input.lengthSq() > 0) input.normalize();

    // High trip: your legs drift sideways on their own.
    if (input.lengthSq() > 0) {
      const drift = Math.sin(this.t * 0.9) * k * 0.6;
      input.set(input.x - input.z * drift, 0, input.z + input.x * drift).normalize();
    }
    // Club Mate: jittery legs.
    if (state.clubMateActive && input.lengthSq() > 0) {
      input.x += (Math.random() - 0.5) * 0.8;
      input.z += (Math.random() - 0.5) * 0.8;
    }

    const speed = SPEED * (state.rat ? 1.3 : 1);
    this.velocity.lerp(input.multiplyScalar(speed), 1 - Math.exp(-6 * dt));
    this.root.position.addScaledVector(this.velocity, dt);
    this.resolve(this.root.position, RADIUS * this.scale);

    const v = this.velocity.length();
    if (v > 0.1) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.root.rotation.y += angleDiff(target, this.root.rotation.y) * (1 - Math.exp(-8 * dt));
    }

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
