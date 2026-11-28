// Procedural 132 BPM Berlin techno choreography & articulated knee-bending locomotion engine.
// Supports both 11-bone horsey skinned rigs (body -> spine -> head/armL/foreArmL/armR/foreArmR,
// legL/calfL, legR/calfR) and 6-bone equine rigs gracefully (missing child bones are skipped).
import * as THREE from 'three';

export type DanceArchetype =
  | 'techno_pump'
  | 'leather_groove'
  | 'diva_sway'
  | 'herd_sync'
  | 'choir_trance'
  | 'chill_nod';

export interface DanceRig {
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
  /** Rest local Y of `body` captured on bind. */
  bodyY: number;
  /** True when `body` is a root bone parenting limbs (safe to translate Y for knee-dip). */
  bodyIsRoot: boolean;
  /** +1 when armL sits on +X (horsey rigs), -1 when armL sits on -X (equine rigs). */
  armLSign: number;
  /** Beat spring state for natural groove overshoot. */
  spring: number;
  springVel: number;
  /** Integrated walk stride phase (radians). */
  walkPhase: number;
  /** Smoothly interpolated state blend weights [0..1]. */
  walkBlend: number;
  talkBlend: number;
  cheerBlend: number;
}

export interface AnimateParams {
  dt: number;
  t: number;
  beatN: number;
  beatPulse: number;
  archetype: DanceArchetype;
  moveSpeed: number;
  attentive: boolean;
  talking: boolean;
  cheer: boolean;
  finale: boolean;
  seed: number;
}

const BONE_NAMES = new Set([
  'body',
  'spine',
  'head',
  'armL',
  'foreArmL',
  'armR',
  'foreArmR',
  'legL',
  'calfL',
  'legR',
  'calfR',
] as const);

type BoneKey =
  | 'body'
  | 'spine'
  | 'head'
  | 'armL'
  | 'foreArmL'
  | 'armR'
  | 'foreArmR'
  | 'legL'
  | 'calfL'
  | 'legR'
  | 'calfR';

/**
 * Find articulated bones once the GLB replaces the placeholder box.
 * Caches by `rigSource` so it never permanently gives up before the GLB loads.
 */
export function bindRig(root: THREE.Object3D): DanceRig | null {
  const modelNode = root.children[0]?.children[0] ?? root.children[0];
  if (!modelNode) return null;
  if (root.userData.rigSource === modelNode) {
    return (root.userData.rig as DanceRig | null) ?? null;
  }

  const rig: DanceRig = {
    bodyY: 0,
    bodyIsRoot: false,
    armLSign: 1,
    spring: 0,
    springVel: 0,
    walkPhase: 0,
    walkBlend: 0,
    talkBlend: 0,
    cheerBlend: 0,
  };

  let found = false;
  root.traverse((c) => {
    if (BONE_NAMES.has(c.name as BoneKey)) {
      rig[c.name as BoneKey] = c;
      found = true;
    }
  });

  if (rig.body) {
    rig.bodyY = rig.body.position.y;
    rig.bodyIsRoot = Boolean((rig.body as THREE.Bone).isBone);
  }
  if (rig.armL) {
    rig.armLSign = rig.armL.position.x >= 0 ? 1 : -1;
  }

  root.userData.rigSource = modelNode;
  root.userData.rig = found ? rig : null;
  return found ? rig : null;
}

interface Pose {
  bodyDip: number;
  bodyYaw: number;
  bodyRoll: number;
  spineX: number;
  spineY: number;
  spineZ: number;
  headX: number;
  headY: number;
  headZ: number;
  armLX: number;
  armLZ: number;
  foreArmLX: number;
  armRX: number;
  armRZ: number;
  foreArmRX: number;
  legLX: number;
  calfLX: number;
  legRX: number;
  calfRX: number;
}

function makePose(): Pose {
  return {
    bodyDip: 0,
    bodyYaw: 0,
    bodyRoll: 0,
    spineX: 0,
    spineY: 0,
    spineZ: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    armLX: 0,
    armLZ: 0,
    foreArmLX: 0,
    armRX: 0,
    armRZ: 0,
    foreArmRX: 0,
    legLX: 0,
    calfLX: 0,
    legRX: 0,
    calfRX: 0,
  };
}

function zeroPose(p: Pose): void {
  p.bodyDip = 0;
  p.bodyYaw = 0;
  p.bodyRoll = 0;
  p.spineX = 0;
  p.spineY = 0;
  p.spineZ = 0;
  p.headX = 0;
  p.headY = 0;
  p.headZ = 0;
  p.armLX = 0;
  p.armLZ = 0;
  p.foreArmLX = 0;
  p.armRX = 0;
  p.armRZ = 0;
  p.foreArmRX = 0;
  p.legLX = 0;
  p.calfLX = 0;
  p.legRX = 0;
  p.calfRX = 0;
}

function blendPose(dst: Pose, src: Pose, alpha: number): void {
  const inv = 1 - alpha;
  dst.bodyDip = dst.bodyDip * inv + src.bodyDip * alpha;
  dst.bodyYaw = dst.bodyYaw * inv + src.bodyYaw * alpha;
  dst.bodyRoll = dst.bodyRoll * inv + src.bodyRoll * alpha;
  dst.spineX = dst.spineX * inv + src.spineX * alpha;
  dst.spineY = dst.spineY * inv + src.spineY * alpha;
  dst.spineZ = dst.spineZ * inv + src.spineZ * alpha;
  dst.headX = dst.headX * inv + src.headX * alpha;
  dst.headY = dst.headY * inv + src.headY * alpha;
  dst.headZ = dst.headZ * inv + src.headZ * alpha;
  dst.armLX = dst.armLX * inv + src.armLX * alpha;
  dst.armLZ = dst.armLZ * inv + src.armLZ * alpha;
  dst.foreArmLX = dst.foreArmLX * inv + src.foreArmLX * alpha;
  dst.armRX = dst.armRX * inv + src.armRX * alpha;
  dst.armRZ = dst.armRZ * inv + src.armRZ * alpha;
  dst.foreArmRX = dst.foreArmRX * inv + src.foreArmRX * alpha;
  dst.legLX = dst.legLX * inv + src.legLX * alpha;
  dst.calfLX = dst.calfLX * inv + src.calfLX * alpha;
  dst.legRX = dst.legRX * inv + src.legRX * alpha;
  dst.calfRX = dst.calfRX * inv + src.calfRX * alpha;
}

// Reusable scratch poses to avoid per-frame allocations.
const dancePose = makePose();
const walkPose = makePose();
const talkPose = makePose();

/** 132 BPM half-cycle angular frequency: pi radians per quarter-note beat. */
const BEAT_RAD_PER_SEC = (132 / 60) * Math.PI;

export function animateCharacter(rig: DanceRig, params: AnimateParams): void {
  const dt = Math.min(params.dt, 0.1);
  const { t, beatN, beatPulse, archetype, moveSpeed, attentive, talking, cheer, finale, seed } = params;

  const kick = beatPulse * beatPulse;
  const alt = beatN % 2 === 0 ? 1 : -1;

  // Beat-driven spring for organic groove overshoot.
  const springTarget = alt * (0.35 + kick * 0.65);
  rig.springVel += (springTarget - rig.spring) * 42 * dt;
  rig.springVel *= Math.exp(-7.5 * dt);
  rig.spring += rig.springVel * dt;

  // Smooth state blends.
  const walkTarget = talking ? 0 : Math.min(1, Math.max(0, (moveSpeed - 0.1) / 0.5));
  rig.walkBlend += (walkTarget - rig.walkBlend) * (1 - Math.exp(-10 * dt));

  const talkTarget = talking ? 1 : 0;
  rig.talkBlend += (talkTarget - rig.talkBlend) * (1 - Math.exp(-8 * dt));

  const cheerTarget = (cheer || finale) && !talking ? 1 : 0;
  rig.cheerBlend += (cheerTarget - rig.cheerBlend) * (1 - Math.exp(-5 * dt));

  // ---------------------------------------------------------------------------
  // 1. 132 BPM Techno Choreography by Archetype
  // ---------------------------------------------------------------------------
  zeroPose(dancePose);
  const p = t * BEAT_RAD_PER_SEC + seed;
  const energy = attentive && !talking ? 0.55 : 1;

  switch (archetype) {
    case 'techno_pump': {
      // Punchy knee-bend bounce on every kick, alternating elbow-bent arm pumps,
      // rhythmic spine lean/twist, and crisp techno head nod.
      dancePose.bodyDip = (-0.055 * kick - 0.014) * energy;
      dancePose.bodyYaw = rig.spring * 0.06 * energy;
      dancePose.legLX = (-0.18 * kick - 0.05 + rig.spring * 0.13) * energy;
      dancePose.legRX = (-0.18 * kick - 0.05 - rig.spring * 0.13) * energy;
      dancePose.calfLX = (0.38 * kick + 0.10 + Math.max(0, -rig.spring) * 0.14) * energy;
      dancePose.calfRX = (0.38 * kick + 0.10 + Math.max(0, rig.spring) * 0.14) * energy;

      const pumpL = Math.max(0, rig.spring);
      const pumpR = Math.max(0, -rig.spring);
      dancePose.armLX = (-0.26 - pumpL * 0.42 - kick * 0.16) * energy;
      dancePose.armRX = (-0.26 - pumpR * 0.42 - kick * 0.16) * energy;
      dancePose.armLZ = (0.16 + kick * 0.08) * energy;
      dancePose.armRZ = (0.16 + kick * 0.08) * energy;
      dancePose.foreArmLX = -0.68 * energy - kick * 0.22 * energy - pumpL * 0.18 * energy;
      dancePose.foreArmRX = -0.68 * energy - kick * 0.22 * energy - pumpR * 0.18 * energy;

      dancePose.spineX = (0.06 + kick * 0.09) * energy;
      dancePose.spineY = rig.spring * 0.24 * energy;
      dancePose.spineZ = Math.sin(p * 0.5) * 0.09 * energy;
      dancePose.headX = (0.04 + kick * 0.22) * energy;
      dancePose.headY = -rig.spring * 0.10 * energy;
      dancePose.headZ = Math.sin(p * 0.5) * 0.06 * energy;
      break;
    }

    case 'leather_groove': {
      // Cool, heavy, grounded Berlin club stance: strong spine shoulder-roll,
      // deep subtle knee pulse, confident low arm groove, slow head nod.
      const half = p * 0.5;
      const sHalf = Math.sin(half);
      const cHalf = Math.cos(half);

      dancePose.bodyDip = (-0.042 * kick - 0.015) * energy;
      dancePose.bodyRoll = cHalf * 0.04 * energy;
      dancePose.legLX = (-0.14 * kick - 0.04) * energy;
      dancePose.legRX = (-0.14 * kick - 0.04) * energy;
      dancePose.calfLX = (0.30 * kick + 0.09) * energy;
      dancePose.calfRX = (0.30 * kick + 0.09) * energy;

      dancePose.spineX = (0.04 + kick * 0.055) * energy;
      dancePose.spineY = sHalf * 0.24 * energy;
      dancePose.spineZ = cHalf * 0.12 * energy;

      dancePose.armLX = (-0.15 + sHalf * 0.18 - kick * 0.09) * energy;
      dancePose.armRX = (-0.15 - sHalf * 0.18 - kick * 0.09) * energy;
      dancePose.armLZ = (0.20 + Math.abs(sHalf) * 0.06) * energy;
      dancePose.armRZ = (0.20 + Math.abs(cHalf) * 0.06) * energy;
      dancePose.foreArmLX = (-0.52 - kick * 0.16) * energy;
      dancePose.foreArmRX = (-0.52 - kick * 0.16) * energy;

      dancePose.headX = (0.03 + kick * 0.16) * energy;
      dancePose.headY = -sHalf * 0.12 * energy;
      dancePose.headZ = cHalf * 0.055 * energy;
      break;
    }

    case 'diva_sway': {
      // Fluid figure-8 hip/spine sway, expressive alternating raised forearm waves, dramatic head tilt.
      const half = p * 0.5;
      const sHalf = Math.sin(half);
      const cHalf = Math.cos(half);
      const sBeat = Math.sin(p);

      dancePose.bodyDip = (-0.035 * kick - 0.012 * (0.5 + 0.5 * sBeat)) * energy;
      dancePose.bodyYaw = sBeat * 0.12 * energy;
      dancePose.bodyRoll = sHalf * 0.08 * energy;

      dancePose.legLX = (-0.12 * kick + sHalf * 0.10) * energy;
      dancePose.legRX = (-0.12 * kick - sHalf * 0.10) * energy;
      dancePose.calfLX = (0.24 * kick + 0.08) * energy;
      dancePose.calfRX = (0.24 * kick + 0.08) * energy;

      dancePose.spineX = sBeat * 0.06 * energy;
      dancePose.spineY = sHalf * 0.28 * energy;
      dancePose.spineZ = (-sHalf * 0.13 + sBeat * 0.05) * energy;

      dancePose.armLX = (-0.62 - sHalf * 0.45 - kick * 0.12) * energy;
      dancePose.armRX = (-0.62 + sHalf * 0.45 - kick * 0.12) * energy;
      dancePose.armLZ = (0.34 + sHalf * 0.16) * energy;
      dancePose.armRZ = (0.34 - sHalf * 0.16) * energy;
      dancePose.foreArmLX = (-0.82 - cHalf * 0.28) * energy;
      dancePose.foreArmRX = (-0.82 + cHalf * 0.28) * energy;

      dancePose.headX = (-0.03 + kick * 0.12) * energy;
      dancePose.headY = sHalf * 0.14 * energy;
      dancePose.headZ = cHalf * 0.14 * energy;
      break;
    }

    case 'herd_sync': {
      // Crisp synchronized horse stomp + double-bounce + sharp head bob on every quarter-note beat.
      const doubleBounce = Math.abs(Math.sin(t * BEAT_RAD_PER_SEC)) * 0.12;
      dancePose.bodyDip = (-0.05 * kick - doubleBounce * 0.12) * energy;
      dancePose.legLX = rig.spring * 0.58 * energy;
      dancePose.legRX = -rig.spring * 0.58 * energy;
      dancePose.calfLX = (Math.max(0, -rig.spring) * 0.48 + kick * 0.24) * energy;
      dancePose.calfRX = (Math.max(0, rig.spring) * 0.48 + kick * 0.24) * energy;

      dancePose.spineX = (0.04 + kick * 0.08) * energy;
      dancePose.spineY = rig.spring * 0.18 * energy;

      dancePose.armLX = (-rig.spring * 0.55 - 0.14) * energy;
      dancePose.armRX = (rig.spring * 0.55 - 0.14) * energy;
      dancePose.armLZ = (0.14 + kick * 0.10) * energy;
      dancePose.armRZ = (0.14 + kick * 0.10) * energy;
      dancePose.foreArmLX = (-0.65 - kick * 0.20) * energy;
      dancePose.foreArmRX = (-0.65 - kick * 0.20) * energy;

      dancePose.headX = (0.04 + kick * 0.28 + doubleBounce * 0.35) * energy;
      dancePose.headZ = rig.spring * 0.06 * energy;
      break;
    }

    case 'choir_trance': {
      // Slow hypnotic breathing heave, unified side sway, reverent head bow/nod.
      const tranceP = t * 1.1 + seed;
      const breath = Math.sin(tranceP);
      const sway = Math.sin(tranceP * 0.85);

      dancePose.bodyDip = (-0.014 * (0.5 + 0.5 * breath) - 0.012 * kick) * energy;
      dancePose.spineX = (0.07 + breath * 0.065) * energy;
      dancePose.spineY = Math.cos(tranceP * 0.85) * 0.06 * energy;
      dancePose.spineZ = sway * 0.10 * energy;

      dancePose.legLX = breath * 0.06 * energy;
      dancePose.legRX = -breath * 0.06 * energy;
      dancePose.calfLX = (0.09 + kick * 0.07) * energy;
      dancePose.calfRX = (0.09 + kick * 0.07) * energy;

      dancePose.armLX = (-0.20 + breath * 0.10) * energy;
      dancePose.armRX = (-0.20 - breath * 0.10) * energy;
      dancePose.armLZ = 0.10 * energy;
      dancePose.armRZ = 0.10 * energy;
      dancePose.foreArmLX = (-0.42 - breath * 0.08) * energy;
      dancePose.foreArmRX = (-0.42 - breath * 0.08) * energy;

      dancePose.headX = (0.11 + breath * 0.09 + kick * 0.06) * energy;
      dancePose.headZ = sway * 0.08 * energy;
      break;
    }

    case 'chill_nod': {
      // Subtle working groove: weight shift, shoulder bob, head nod on the beat.
      const shift = Math.sin(p * 0.25);
      const bob = Math.sin(p * 0.5);

      dancePose.bodyDip = -0.018 * kick * energy;
      dancePose.spineX = kick * 0.035 * energy;
      dancePose.spineY = bob * 0.07 * energy;
      dancePose.spineZ = shift * 0.045 * energy;

      dancePose.legLX = -0.05 * kick * energy;
      dancePose.legRX = -0.05 * kick * energy;
      dancePose.calfLX = (0.10 * kick + 0.04) * energy;
      dancePose.calfRX = (0.10 * kick + 0.04) * energy;

      dancePose.armLX = (-0.08 - kick * 0.06) * energy;
      dancePose.armRX = (-0.08 - kick * 0.06) * energy;
      dancePose.armLZ = 0.08;
      dancePose.armRZ = 0.08;
      dancePose.foreArmLX = (-0.28 - kick * 0.08) * energy;
      dancePose.foreArmRX = (-0.28 - kick * 0.08) * energy;

      dancePose.headX = (0.03 + kick * 0.14) * energy;
      dancePose.headY = shift * 0.08 * energy;
      dancePose.headZ = bob * 0.03 * energy;
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Hands-Up Drop Overlay (cheer || finale)
  // ---------------------------------------------------------------------------
  if (rig.cheerBlend > 0.001) {
    const cb = rig.cheerBlend;
    const wave = Math.sin(p) * 0.14;
    const overheadL = -2.35 - kick * 0.28 + wave;
    const overheadR = -2.35 - kick * 0.28 - wave;
    dancePose.armLX = dancePose.armLX * (1 - cb) + overheadL * cb;
    dancePose.armRX = dancePose.armRX * (1 - cb) + overheadR * cb;
    dancePose.armLZ = dancePose.armLZ * (1 - cb) + 0.36 * cb;
    dancePose.armRZ = dancePose.armRZ * (1 - cb) + 0.36 * cb;
    dancePose.foreArmLX = dancePose.foreArmLX * (1 - cb) + (-0.65 - kick * 0.25) * cb;
    dancePose.foreArmRX = dancePose.foreArmRX * (1 - cb) + (-0.65 - kick * 0.25) * cb;
    dancePose.bodyDip -= 0.035 * kick * cb;
    dancePose.calfLX += 0.18 * kick * cb;
    dancePose.calfRX += 0.18 * kick * cb;
    dancePose.headX -= 0.12 * cb;
  }

  // ---------------------------------------------------------------------------
  // 3. Natural Knee-Bending Walk / Run Locomotion (moveSpeed > 0.1)
  // ---------------------------------------------------------------------------
  if (rig.walkBlend > 0.001) {
    rig.walkPhase += dt * (3.0 + moveSpeed * 2.2);
    const strideAmp = Math.min(0.68, 0.24 + moveSpeed * 0.16);
    const s = Math.sin(rig.walkPhase);
    // Swing-phase knee lift: positive when the respective thigh swings forward.
    const liftL = Math.max(0, Math.cos(rig.walkPhase - 0.35));
    const liftR = Math.max(0, -Math.cos(rig.walkPhase - 0.35));
    const kneeMax = 0.62 + Math.min(0.24, moveSpeed * 0.08);

    zeroPose(walkPose);
    walkPose.bodyDip = -0.02 + Math.abs(s) * 0.035;
    walkPose.legLX = -s * strideAmp;
    walkPose.legRX = s * strideAmp;
    walkPose.calfLX = 0.06 + liftL * kneeMax;
    walkPose.calfRX = 0.06 + liftR * kneeMax;

    // Counter-swinging arms with natural elbow curl (~-0.45 rad).
    walkPose.armLX = s * strideAmp * 0.72;
    walkPose.armRX = -s * strideAmp * 0.72;
    walkPose.armLZ = 0.08;
    walkPose.armRZ = 0.08;
    walkPose.foreArmLX = -0.36 - Math.max(0, -s) * 0.26;
    walkPose.foreArmRX = -0.36 - Math.max(0, s) * 0.26;

    // Subtle spine counter-twist and forward stride lean.
    walkPose.spineX = 0.04 + Math.min(0.08, moveSpeed * 0.025);
    walkPose.spineY = s * strideAmp * 0.22;
    walkPose.spineZ = -s * 0.04;
    walkPose.headX = 0.02 + Math.abs(Math.cos(rig.walkPhase)) * 0.04;
    walkPose.headY = -s * strideAmp * 0.08;

    blendPose(dancePose, walkPose, rig.walkBlend);
  }

  // ---------------------------------------------------------------------------
  // 4. Expressive Conversation Idle (talking === true)
  // ---------------------------------------------------------------------------
  if (rig.talkBlend > 0.001) {
    zeroPose(talkPose);
    const breath = Math.sin(t * 1.9 + seed);
    const sway = Math.sin(t * 0.85 + seed);
    const gL = Math.max(0, Math.sin(t * 1.15 + seed * 1.7));
    const gestL = gL * gL;
    const gR = Math.max(0, Math.sin(t * 0.92 + seed + 2.3));
    const gestR = gR * gR;

    talkPose.bodyDip = breath * 0.007;
    talkPose.spineX = 0.02 + breath * 0.035;
    talkPose.spineY = sway * 0.04;
    talkPose.spineZ = sway * 0.035;

    talkPose.headX = 0.02 + Math.sin(t * 2.3 + seed) * 0.06;
    talkPose.headY = Math.sin(t * 0.72 + seed) * 0.06;
    talkPose.headZ = Math.sin(t * 1.15 + seed) * 0.045;

    talkPose.armLX = -0.10 - gestL * 0.22;
    talkPose.armRX = -0.08 - gestR * 0.16;
    talkPose.armLZ = 0.10 + gestL * 0.07;
    talkPose.armRZ = 0.10 + gestR * 0.05;
    talkPose.foreArmLX = -0.34 - gestL * 0.42;
    talkPose.foreArmRX = -0.30 - gestR * 0.34;

    talkPose.legLX = -0.025;
    talkPose.legRX = 0.025;
    talkPose.calfLX = 0.05;
    talkPose.calfRX = 0.05;

    blendPose(dancePose, talkPose, rig.talkBlend);
  }

  // ---------------------------------------------------------------------------
  // 5. Commit Pose to Bones (gracefully skipping any absent bone)
  // ---------------------------------------------------------------------------
  if (rig.body && rig.bodyIsRoot) {
    rig.body.position.y = rig.bodyY + dancePose.bodyDip;
    rig.body.rotation.y = dancePose.bodyYaw;
    rig.body.rotation.z = dancePose.bodyRoll;
  }
  if (rig.spine) {
    rig.spine.rotation.set(dancePose.spineX, dancePose.spineY, dancePose.spineZ);
  }
  if (rig.head) {
    rig.head.rotation.set(dancePose.headX, dancePose.headY, dancePose.headZ);
  }
  if (rig.armL) {
    rig.armL.rotation.set(dancePose.armLX, 0, rig.armLSign * dancePose.armLZ);
  }
  if (rig.foreArmL) {
    rig.foreArmL.rotation.set(dancePose.foreArmLX, 0, 0);
  }
  if (rig.armR) {
    rig.armR.rotation.set(dancePose.armRX, 0, -rig.armLSign * dancePose.armRZ);
  }
  if (rig.foreArmR) {
    rig.foreArmR.rotation.set(dancePose.foreArmRX, 0, 0);
  }
  if (rig.legL) {
    rig.legL.rotation.set(dancePose.legLX, 0, 0);
  }
  if (rig.calfL) {
    rig.calfL.rotation.set(dancePose.calfLX, 0, 0);
  }
  if (rig.legR) {
    rig.legR.rotation.set(dancePose.legRX, 0, 0);
  }
  if (rig.calfR) {
    rig.calfR.rotation.set(dancePose.calfRX, 0, 0);
  }
}
