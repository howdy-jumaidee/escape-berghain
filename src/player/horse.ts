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
const SOBER_UP_SECONDS = 35;

// VRLabs-inspired constrained multi-body ragdoll constants.
const RAGDOLL_GRAVITY = -18;
const RAGDOLL_RESTITUTION = 0.28;
const RAGDOLL_COM_Y = 1.05;
const RAGDOLL_FLOOR_Y = 0.34;
const NECK_BASE_Y = 0.45;
const NECK_BASE_Z = 0.55;
const NECK_LENGTH = 0.58;
const HEAD_BASE_Y = 0.55;
const HEAD_BASE_Z = 0.05;
const HEAD_SNOUT_Z = 0.48;

export type CameraMode = 'follow' | 'eyes';
export type Resolver = (pos: THREE.Vector3, radius: number) => void;
export type RagdollKind = 'caught' | 'passout';

interface LimbRagdoll {
  rx: number;
  rz: number;
  vx: number;
  vz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  prevTipY: number;
}

interface HeadRagdoll extends LimbRagdoll {
  ry: number;
  vy: number;
  minY: number;
  maxY: number;
}

interface RagdollState {
  kind: RagdollKind;
  age: number;
  y: number;
  vy: number;
  vx: number;
  vz: number;
  pitch: number;
  yaw: number;
  roll: number;
  vPitch: number;
  vYaw: number;
  vRoll: number;
  side: 1 | -1;
  bounces: number;
  squash: number;
  squashVel: number;
  thudCooldown: number;
  neck: LimbRagdoll;
  head: HeadRagdoll;
  legs: LimbRagdoll[];
}

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
  /** Active multi-part ragdoll collapse state (null when upright). */
  private ragdoll: RagdollState | null = null;
  // Zero-allocation scratch math for ragdoll integration.
  private rQuat = new THREE.Quaternion();
  private rInvQuat = new THREE.Quaternion();
  private rNeckQuat = new THREE.Quaternion();
  private rNeckInvQuat = new THREE.Quaternion();
  private rComOffset = new THREE.Vector3();
  private rLocalDown = new THREE.Vector3();
  private rHeadDown = new THREE.Vector3();
  private rDir = new THREE.Vector3();
  private rTorque = new THREE.Vector3();
  private rTip = new THREE.Vector3();
  private rEuler = new THREE.Euler(0, 0, 0, 'XYZ');

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
      this.resetRagdoll();
      this.root.position.set(x, state.floor * FLOOR_HEIGHT, z);
      this.velocity.set(0, 0, 0);
      this.turnVel = 0;
    });
    // Caught or passed out: trigger floppy multi-body ragdoll collapse.
    bus.on('player:caught', () => {
      if (!this.ragdoll) this.triggerRagdoll('caught');
    });
    bus.on('trip:max', () => {
      if (!this.ragdoll) this.triggerRagdoll('passout');
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

  /** Collapse into a multi-body constrained ragdoll ('caught' = lasso yank, 'passout' = trip blackout). */
  triggerRagdoll(kind: RagdollKind): void {
    if (this.ragdoll) this.resetRagdoll();

    const side: 1 | -1 =
      kind === 'passout' && Math.abs(this.sway) > 0.02
        ? this.sway > 0
          ? 1
          : -1
        : Math.random() < 0.5
          ? 1
          : -1;

    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);

    const isCaught = kind === 'caught';
    const vx = isCaught
      ? this.velocity.x * 0.4 + rightX * side * 3.8 - fwdX * 1.4
      : this.velocity.x * 0.5 + rightX * side * 0.75;
    const vz = isCaught
      ? this.velocity.z * 0.4 + rightZ * side * 3.8 - fwdZ * 1.4
      : this.velocity.z * 0.5 + rightZ * side * 0.75;
    const vy = isCaught ? 3.2 : -0.35;

    const legs: LimbRagdoll[] = this.legs.map((hip, i) => {
      const outward = hip.position.x < 0 ? -1 : 1;
      const front = i < 2;
      const legVx = isCaught
        ? front
          ? -(6.4 + Math.random() * 2.2)
          : 4.2 + Math.random() * 2.0
        : (front ? -2.8 : 2.8) + (Math.random() - 0.5) * 2.2;
      const legVz = isCaught
        ? outward * ((front ? 4.0 : 2.8) + Math.random() * 1.8) + side * 1.2
        : outward * (4.6 + Math.random() * 2.0);
      return {
        rx: hip.rotation.x,
        rz: hip.rotation.z,
        vx: legVx,
        vz: legVz,
        minX: -1.45,
        maxX: 1.35,
        minZ: -1.3,
        maxZ: 1.3,
        prevTipY: 0.06,
      };
    });

    this.ragdoll = {
      kind,
      age: 0,
      y: RAGDOLL_COM_Y,
      vy,
      vx,
      vz,
      pitch: this.rig.rotation.x,
      yaw: 0,
      roll: this.rig.rotation.z,
      vPitch: isCaught ? -(2.1 + Math.random() * 0.9) : 1.35 + (Math.random() - 0.5) * 0.5,
      vYaw: isCaught ? -side * (3.6 + Math.random() * 1.2) : side * (0.85 + Math.random() * 0.5),
      vRoll: isCaught ? side * (6.2 + Math.random() * 1.4) : side * (4.3 + Math.random() * 0.9),
      side,
      bounces: 0,
      squash: 0,
      squashVel: isCaught ? -2.0 : 1.5,
      thudCooldown: 0,
      neck: {
        rx: this.neck.rotation.x,
        rz: this.neck.rotation.z,
        vx: isCaught ? -(4.5 + Math.random() * 1.4) : 2.8 + Math.random() * 0.8,
        vz: isCaught ? -side * (5.2 + Math.random() * 1.4) : side * (2.4 + Math.random() * 1.0),
        minX: -0.45,
        maxX: 1.35,
        minZ: -1.25,
        maxZ: 1.25,
        prevTipY: 1.7,
      },
      head: {
        rx: this.head.rotation.x,
        ry: this.head.rotation.y,
        rz: this.head.rotation.z,
        vx: isCaught ? 5.2 + Math.random() * 1.8 : 2.4 + Math.random() * 1.0,
        vy: isCaught ? side * (3.8 + Math.random() * 1.4) : side * (1.6 + Math.random() * 0.8),
        vz: isCaught ? -side * (6.2 + Math.random() * 1.8) : side * (3.0 + Math.random() * 1.2),
        minX: -1.15,
        maxX: 0.75,
        minY: -0.65,
        maxY: 0.65,
        minZ: -0.9,
        maxZ: 0.9,
        prevTipY: 1.8,
      },
      legs,
    };

    this.velocity.set(vx, 0, vz);
    this.turnVel = 0;
  }

  /** Restore upright standing rig/limb posture on respawn. */
  private resetRagdoll(): void {
    this.ragdoll = null;
    this.rig.rotation.order = 'XYZ';
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.body.position.set(0, LEG_LENGTH, 0);
    this.body.rotation.set(0, 0, 0);
    this.neck.position.set(0, NECK_BASE_Y, NECK_BASE_Z);
    this.neck.rotation.set(0.5, 0, 0);
    this.head.position.set(0, HEAD_BASE_Y, HEAD_BASE_Z);
    this.head.rotation.set(-0.5, 0, 0);
    for (const hip of this.legs) {
      hip.rotation.set(0, 0, 0);
      hip.userData.lift = 0;
    }
    this.sway = 0;
    this.swayVel = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this.stomp = 0;
    this.look = 0;
  }

  private stepRagdoll(dt: number): void {
    const r = this.ragdoll;
    // THREE.Timer can hand back dt = 0 after a tab refocus; the velocity divides below would NaN the rig.
    if (!r || dt <= 1e-5) return;
    pressed.clear();

    if (this.stompPulse > 0) {
      this.stompPulse = Math.max(0, this.stompPulse - dt * 2.8);
      const sp = 1 - this.stompPulse;
      this.stompRing.visible = this.stompPulse > 0.01;
      this.stompRing.scale.setScalar(1 + sp * 2.8);
      this.stompRingMat.opacity = this.stompPulse * 0.45;
    } else if (this.stompRing.visible) {
      this.stompRing.visible = false;
    }

    const steps = dt > 0.022 ? 2 : 1;
    const h = dt / steps;
    const targetRoll = r.side * (Math.PI / 2);

    for (let s = 0; s < steps; s++) {
      r.age += h;
      r.thudCooldown = Math.max(0, r.thudCooldown - h);

      // Vertical gravity + concrete floor bounce.
      r.vy += RAGDOLL_GRAVITY * h;
      r.y += r.vy * h;

      const floorY = RAGDOLL_FLOOR_Y + 0.08 * Math.abs(Math.sin(r.pitch));
      const grounded = r.y <= floorY;
      if (grounded) {
        r.y = floorY;
        if (r.vy < -0.35) {
          const impact = -r.vy;
          r.bounces++;
          r.vy = impact * RAGDOLL_RESTITUTION;
          if (r.vy < 0.22) r.vy = 0;

          // Concrete impact friction + angular slap jitter.
          r.vx *= 0.74;
          r.vz *= 0.74;
          r.vRoll = r.vRoll * 0.52 + (Math.random() - 0.5) * impact * 0.42;
          r.vPitch = r.vPitch * 0.48 + (Math.random() - 0.5) * impact * 0.36;
          r.vYaw = r.vYaw * 0.62 + (Math.random() - 0.5) * impact * 0.35;
          r.squashVel += Math.min(impact * 1.45, 7.5);

          // Shock impulse ripples out through every floppy limb on slam.
          const shock = Math.min(impact, 6.5);
          for (let i = 0; i < r.legs.length; i++) {
            const leg = r.legs[i];
            const outward = i % 2 === 0 ? -1 : 1;
            leg.vx += (Math.random() - 0.5) * shock * 2.4;
            leg.vz += outward * shock * 0.75 + (Math.random() - 0.5) * shock * 1.6;
          }
          r.neck.vx += (Math.random() - 0.35) * shock * 1.9;
          r.neck.vz += r.side * shock * 0.85 + (Math.random() - 0.5) * shock * 1.5;
          r.head.vx += (Math.random() - 0.5) * shock * 2.6;
          r.head.vz += r.side * shock * 1.1 + (Math.random() - 0.5) * shock * 2.1;
          r.head.vy += (Math.random() - 0.5) * shock * 1.8;

          if (impact > 1.0 && r.thudCooldown <= 0) {
            bus.emit('player:step', {});
            r.thudCooldown = 0.14;
          }
        } else {
          r.vy = 0;
          const slideDrag = Math.exp(-4.8 * h);
          r.vx *= slideDrag;
          r.vz *= slideDrag;

          // Gravity settles the torso flat onto its side (±pi/2) with concrete damping.
          r.vRoll += (targetRoll - r.roll) * 28 * h;
          r.vPitch += -r.pitch * 24 * h;
          const angDrag = Math.exp(-6.2 * h);
          r.vRoll *= angDrag;
          r.vPitch *= angDrag;
          r.vYaw *= Math.exp(-4.4 * h);
        }
      } else {
        const airDrag = Math.exp(-0.4 * h);
        r.vx *= airDrag;
        r.vz *= airDrag;
        r.vRoll += (targetRoll - r.roll) * (r.kind === 'passout' ? 14 : 6.5) * h;
        const spinDrag = Math.exp(-0.9 * h);
        r.vRoll *= spinDrag;
        r.vPitch *= spinDrag;
        r.vYaw *= spinDrag;
      }

      // Horizontal slide with wall collision so the flopping horse never passes through a wall.
      this.prevPos.copy(this.root.position);
      this.root.position.x += r.vx * h;
      this.root.position.z += r.vz * h;
      this.resolve(this.root.position, RADIUS);
      if (h > 1e-4) {
        const dx = this.root.position.x - this.prevPos.x;
        const dz = this.root.position.z - this.prevPos.z;
        const wantDx = r.vx * h;
        const wantDz = r.vz * h;
        if (Math.abs(dx - wantDx) > 0.0015 || Math.abs(dz - wantDz) > 0.0015) {
          const hitSpeed = Math.hypot(r.vx, r.vz);
          r.vx = (dx / h) * 0.45;
          r.vz = (dz / h) * 0.45;
          r.vYaw += (Math.random() - 0.5) * Math.min(hitSpeed, 4) * 1.2;
        }
      }

      // Integrate body tumbling angles around center of mass.
      r.roll += r.vRoll * h;
      r.pitch += r.vPitch * h;
      r.yaw += r.vYaw * h;
      if (r.pitch > 1.05) {
        r.pitch = 1.05;
        if (r.vPitch > 0) r.vPitch = -r.vPitch * 0.35;
      } else if (r.pitch < -1.05) {
        r.pitch = -1.05;
        if (r.vPitch < 0) r.vPitch = -r.vPitch * 0.35;
      }
      const maxRoll = Math.PI * 0.82;
      if (r.roll > maxRoll) {
        r.roll = maxRoll;
        if (r.vRoll > 0) r.vRoll = -r.vRoll * 0.35;
      } else if (r.roll < -maxRoll) {
        r.roll = -maxRoll;
        if (r.vRoll < 0) r.vRoll = -r.vRoll * 0.35;
      }

      // Torso impact squash spring.
      r.squashVel += (-r.squash * 120 - r.squashVel * 11) * h;
      r.squash += r.squashVel * h;
      const sq = Math.max(-0.2, Math.min(0.35, r.squash));

      // Apply rig transform in 'YXZ' order so yaw spins cleanly around world +Y while lying on side.
      this.rig.rotation.order = 'YXZ';
      this.rig.rotation.set(r.pitch, r.yaw, r.roll);
      this.rQuat.setFromEuler(this.rig.rotation);
      this.rComOffset.set(0, RAGDOLL_COM_Y, 0).applyQuaternion(this.rQuat);
      this.rig.position.set(-this.rComOffset.x, r.y - this.rComOffset.y, -this.rComOffset.z);
      this.rig.scale.set(1 + sq * 0.08, 1 - sq * 0.1, 1 + sq * 0.08);
      this.body.rotation.set(sq * 0.18, 0, -r.side * sq * 0.22);

      // Gravity vector expressed in the horse's local rig frame.
      this.rInvQuat.copy(this.rQuat).invert();
      this.rLocalDown.set(0, -1, 0).applyQuaternion(this.rInvQuat);

      // Per-limb floppy physics for all 4 legs (independent gravity torque + soft limits + floor bounce).
      const limbDrag = Math.exp(-(grounded ? 4.2 : 2.1) * h);
      for (let i = 0; i < this.legs.length; i++) {
        const leg = r.legs[i];
        const hip = this.legs[i];
        this.rEuler.set(leg.rx, 0, leg.rz, 'XYZ');
        this.rDir.set(0, -1, 0).applyEuler(this.rEuler);
        this.rTorque.crossVectors(this.rDir, this.rLocalDown);

        leg.vx = (leg.vx + this.rTorque.x * 24 * h) * limbDrag;
        leg.vz = (leg.vz + this.rTorque.z * 24 * h) * limbDrag;
        leg.rx += leg.vx * h;
        leg.rz += leg.vz * h;
        clampLimb(leg);

        // Compute hoof height above the concrete floor and bounce on contact.
        this.rEuler.set(leg.rx, 0, leg.rz, 'XYZ');
        this.rDir.set(0, -1, 0).applyEuler(this.rEuler);
        this.rTip.copy(hip.position).addScaledVector(this.rDir, LEG_LENGTH).applyQuaternion(this.rQuat);
        const hoofY = this.rTip.y + this.rig.position.y;
        if (hoofY < 0.06) {
          const pen = 0.06 - hoofY;
          this.rTorque.crossVectors(this.rDir, this.rLocalDown);
          if (this.rTorque.lengthSq() < 0.04) {
            const outward = hip.position.x < 0 ? -1 : 1;
            leg.vz += outward * pen * 160 * h;
          }
          leg.vx -= this.rTorque.x * pen * 210 * h;
          leg.vz -= this.rTorque.z * pen * 210 * h;
          const hoofVy = (hoofY - leg.prevTipY) / h;
          if (hoofVy < -0.5) {
            const kick = Math.min(-hoofVy * 0.42, 4.5);
            leg.vx -= this.rTorque.x * kick + (Math.random() - 0.5) * 0.9;
            leg.vz -= this.rTorque.z * kick + (Math.random() - 0.5) * 0.9;
            if (-hoofVy > 1.8 && r.thudCooldown <= 0) {
              bus.emit('player:step', {});
              r.thudCooldown = 0.14;
            }
          }
          leg.vx *= Math.exp(-5.0 * h);
          leg.vz *= Math.exp(-5.0 * h);
        }
        leg.prevTipY = hoofY;
      }

      // Floppy neck physics (+Y limb in body frame) with concrete floor bounce.
      const prevNeckVx = r.neck.vx;
      const prevNeckVz = r.neck.vz;
      this.rEuler.set(r.neck.rx, 0, r.neck.rz, 'XYZ');
      this.rDir.set(0, 1, 0).applyEuler(this.rEuler);
      this.rTorque.crossVectors(this.rDir, this.rLocalDown);
      const neckDrag = Math.exp(-(grounded ? 3.8 : 1.9) * h);
      r.neck.vx = (r.neck.vx + this.rTorque.x * 26 * h) * neckDrag;
      r.neck.vz = (r.neck.vz + this.rTorque.z * 26 * h) * neckDrag;
      r.neck.rx += r.neck.vx * h;
      r.neck.rz += r.neck.vz * h;
      clampLimb(r.neck);

      this.rEuler.set(r.neck.rx, 0, r.neck.rz, 'XYZ');
      this.rNeckQuat.setFromEuler(this.rEuler);
      this.rDir.set(0, 1, 0).applyQuaternion(this.rNeckQuat);
      this.rTip
        .set(0, LEG_LENGTH + NECK_BASE_Y, NECK_BASE_Z)
        .addScaledVector(this.rDir, NECK_LENGTH)
        .applyQuaternion(this.rQuat);
      const neckTipY = this.rTip.y + this.rig.position.y;
      if (neckTipY < 0.16) {
        const pen = 0.16 - neckTipY;
        this.rTorque.crossVectors(this.rDir, this.rLocalDown);
        r.neck.vx -= this.rTorque.x * pen * 220 * h;
        r.neck.vz -= this.rTorque.z * pen * 220 * h;
        const tipVy = (neckTipY - r.neck.prevTipY) / h;
        if (tipVy < -0.45) {
          const bounce = Math.min(-tipVy * 0.45, 4.8);
          r.neck.vx -= this.rTorque.x * bounce + (Math.random() - 0.5) * 0.7;
          r.neck.vz -= this.rTorque.z * bounce + (Math.random() - 0.5) * 0.7;
        }
        r.neck.vx *= Math.exp(-5.5 * h);
        r.neck.vz *= Math.exp(-5.5 * h);
      }
      r.neck.prevTipY = neckTipY;

      // Floppy head physics (child of neck): gravity in neck frame + inertial whip from neck + snout floor bounce.
      const neckAx = (r.neck.vx - prevNeckVx) / h;
      const neckAz = (r.neck.vz - prevNeckVz) / h;
      this.rNeckInvQuat.copy(this.rNeckQuat).invert();
      this.rHeadDown.copy(this.rLocalDown).applyQuaternion(this.rNeckInvQuat);

      this.rEuler.set(r.head.rx, r.head.ry, r.head.rz, 'XYZ');
      this.rDir.set(0, 0.25, 1).normalize().applyEuler(this.rEuler);
      this.rTorque.crossVectors(this.rDir, this.rHeadDown);
      const headDrag = Math.exp(-(grounded ? 3.4 : 1.7) * h);
      r.head.vx = (r.head.vx + (this.rTorque.x * 28 - neckAx * 0.35) * h) * headDrag;
      r.head.vz = (r.head.vz + (this.rTorque.z * 28 - neckAz * 0.35) * h) * headDrag;
      r.head.vy = (r.head.vy + this.rTorque.y * 18 * h) * headDrag;
      r.head.rx += r.head.vx * h;
      r.head.ry += r.head.vy * h;
      r.head.rz += r.head.vz * h;
      clampLimb(r.head);
      if (r.head.ry < r.head.minY) {
        r.head.ry = r.head.minY;
        if (r.head.vy < 0) r.head.vy = -r.head.vy * 0.35;
      } else if (r.head.ry > r.head.maxY) {
        r.head.ry = r.head.maxY;
        if (r.head.vy > 0) r.head.vy = -r.head.vy * 0.35;
      }

      // Snout floor contact for secondary head bounce on concrete.
      this.rEuler.set(r.head.rx, r.head.ry, r.head.rz, 'XYZ');
      this.rDir.set(0, 0, HEAD_SNOUT_Z).applyEuler(this.rEuler);
      this.rTip
        .set(0, HEAD_BASE_Y, HEAD_BASE_Z)
        .add(this.rDir)
        .applyQuaternion(this.rNeckQuat)
        .add(this.probe.set(0, LEG_LENGTH + NECK_BASE_Y, NECK_BASE_Z))
        .applyQuaternion(this.rQuat);
      const snoutY = this.rTip.y + this.rig.position.y;
      if (snoutY < 0.15) {
        const pen = 0.15 - snoutY;
        this.rTorque.crossVectors(this.rDir.normalize(), this.rHeadDown);
        r.head.vx -= this.rTorque.x * pen * 240 * h;
        r.head.vz -= this.rTorque.z * pen * 240 * h;
        const snoutVy = (snoutY - r.head.prevTipY) / h;
        if (snoutVy < -0.4) {
          const bounce = Math.min(-snoutVy * 0.5, 5.2);
          r.head.vx -= this.rTorque.x * bounce + (Math.random() - 0.5) * 1.1;
          r.head.vz -= this.rTorque.z * bounce + (Math.random() - 0.5) * 1.1;
          r.head.vy += (Math.random() - 0.5) * 1.4;
        }
        r.head.vx *= Math.exp(-5.0 * h);
        r.head.vz *= Math.exp(-5.0 * h);
        r.head.vy *= Math.exp(-5.0 * h);
      }
      r.head.prevTipY = snoutY;
    }

    // Write final limb rotations to the Three.js scene graph.
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.set(r.legs[i].rx, 0, r.legs[i].rz);
    }
    this.neck.rotation.set(r.neck.rx, 0, r.neck.rz);
    this.head.rotation.set(r.head.rx, r.head.ry, r.head.rz);

    this.velocity.set(r.vx, 0, r.vz);
    bus.emit('player:moved', { x: this.root.position.x, z: this.root.position.z });
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
    if (this.ragdoll) {
      this.stepRagdoll(dt);
      return;
    }

    const free = state.started && !state.inputLocked && !state.ending;
    const k = state.trip / TRIP_MAX;
    const wobbleBoost = 1 + k * 2;

    // Drunk steering. It starts soft so you can learn it, then gets worse the longer
    // you're in the club and the higher your trip: `drunk` goes from 0 to 1.
    if (state.started && !state.ending) this.playTime += dt;
    const hooved = performance.now() < state.hoovedUntil ? 0.3 : 0;
    const drunk = Math.min(1, Math.min(1, this.playTime / SOBER_UP_SECONDS) * 0.7 + k * 0.7 + hooved);

    // Follow and first person: W/S move, A/D steer. Drunk drift stays bounded.
    const forward = free
      ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
      : 0;
    const steer = free
      ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
      : 0;
    const wants = forward !== 0;

    const drift = free && (forward !== 0 || steer !== 0) ? Math.sin(this.t * 0.9) * drunk * 0.9 : 0;
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
        this.lurchIn = 0.9 + Math.random() * (3.2 - drunk * 2.1);
        const side = Math.random() < 0.5 ? -1 : 1;
        const power = drunk * 3.8;
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
    // Squash on stomp, recovers as stomp decays.
    this.rig.scale.set(1 + this.stomp * 0.07, 1 - this.stomp * 0.14, 1 + this.stomp * 0.07);
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

function clampLimb(limb: LimbRagdoll): void {
  if (limb.rx < limb.minX) {
    limb.rx = limb.minX;
    if (limb.vx < 0) limb.vx = -limb.vx * 0.35;
  } else if (limb.rx > limb.maxX) {
    limb.rx = limb.maxX;
    if (limb.vx > 0) limb.vx = -limb.vx * 0.35;
  }
  if (limb.rz < limb.minZ) {
    limb.rz = limb.minZ;
    if (limb.vz < 0) limb.vz = -limb.vz * 0.35;
  } else if (limb.rz > limb.maxZ) {
    limb.rz = limb.maxZ;
    if (limb.vz > 0) limb.vz = -limb.vz * 0.35;
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
