// Rare club creatures tucked into special spots across Berghain.
// Exactly 1 of each: Giant Panda, Chimpanzee, Ring-Tailed Lemur (9 m west gallery), and Fallout Ghoul Reaver.
import * as THREE from 'three';
import { bus, state, FLOOR_HEIGHT, type TextKey } from '../contracts';
import { placeModel } from '../look/models';

type CreatureId = 'panda' | 'chimp' | 'lemur' | 'ghoul';

interface CreatureSpec {
  id: CreatureId;
  model: string;
  textKey: TextKey;
  x: number;
  y: number;
  z: number;
  floor: number;
  baseYaw: number;
  fallbackSize: THREE.Vector3Like;
  fallbackColor: number;
}

interface CreatureInstance extends CreatureSpec {
  holder: THREE.Group;
  modelGroup: THREE.Group;
  yaw: number;
  phase: number;
  lastInteract: number;
  joyBurst: number;
  spinOffset: number;
  halo?: THREE.Sprite;
  haloMat?: THREE.SpriteMaterial;
}

const INTERACT_RANGE = 2.6;
const INTERACT_COOLDOWN = 10;
const LOOK_RANGE = 6.5;

const CREATURE_SPECS: CreatureSpec[] = [
  {
    // Moody northwest corner of Panorama Bar (cell [2, 10], clear of ice_cream_horse, patrols & walls).
    id: 'panda',
    model: 'special_panda',
    textKey: 'story:specials.panda',
    x: 14.5,
    y: 0,
    z: 62.4,
    floor: 0,
    baseYaw: 0.65,
    fallbackSize: { x: 0.9, y: 1.32, z: 1.4 },
    fallbackColor: 0xd8d8d8,
  },
  {
    // Main hall / bar transition archway (cell [10, 3], clear of doorway path, patrols & NPCs).
    id: 'chimp',
    model: 'special_chimp',
    textKey: 'story:specials.chimp',
    x: 63.2,
    y: 0,
    z: 23.6,
    floor: 0,
    baseYaw: -2.2,
    fallbackSize: { x: 0.8, y: 1.15, z: 0.9 },
    fallbackColor: 0x3a2a1e,
  },
  {
    // Perched on the 9 m west mezzanine gallery (WEST_DECK x in [6.5, 12.5], clear of catwalk & dancers).
    id: 'lemur',
    model: 'special_lemur',
    textKey: 'story:specials.lemur',
    x: 9.5,
    y: FLOOR_HEIGHT,
    z: 32.0,
    floor: 1,
    baseYaw: Math.PI / 2,
    fallbackSize: { x: 0.45, y: 0.85, z: 1.4 },
    fallbackColor: 0x8c8c90,
  },
  {
    // Darkroom / toilet corridor corner (cell [15, 7], clear of darkroom_keeper, riddle_horse & patrol 1).
    id: 'ghoul',
    model: 'special_ghoul',
    textKey: 'story:specials.ghoul',
    x: 93.4,
    y: 0,
    z: 45.8,
    floor: 0,
    baseYaw: -1.9,
    fallbackSize: { x: 0.75, y: 1.86, z: 0.55 },
    fallbackColor: 0x446644,
  },
];

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(130, 255, 155, 0.95)');
    grad.addColorStop(0.38, 'rgba(85, 255, 119, 0.45)');
    grad.addColorStop(1, 'rgba(85, 255, 119, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export class SpecialCreatures {
  readonly root = new THREE.Group();
  private creatures: CreatureInstance[] = [];
  private t = 0;

  constructor() {
    this.root.name = 'special_creatures';

    for (let i = 0; i < CREATURE_SPECS.length; i++) {
      const spec = CREATURE_SPECS[i];
      const holder = new THREE.Group();
      holder.name = `special_${spec.id}`;
      holder.position.set(spec.x, spec.y, spec.z);
      holder.rotation.y = spec.baseYaw;

      const fallbackMat = new THREE.MeshStandardMaterial({
        color: spec.fallbackColor,
        roughness: 0.82,
      });
      const modelGroup = placeModel(spec.model, spec.fallbackSize, fallbackMat);
      holder.add(modelGroup);

      const inst: CreatureInstance = {
        ...spec,
        holder,
        modelGroup,
        yaw: spec.baseYaw,
        phase: i * 1.7 + 0.4,
        lastInteract: -INTERACT_COOLDOWN * 2,
        joyBurst: 0,
        spinOffset: 0,
      };

      if (spec.id === 'ghoul') {
        const haloMat = new THREE.SpriteMaterial({
          map: makeGlowTexture(),
          color: 0x55ff77,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const halo = new THREE.Sprite(haloMat);
        halo.position.set(0, 1.35, 0.05);
        halo.scale.set(1.2, 1.2, 1);
        holder.add(halo);
        inst.halo = halo;
        inst.haloMat = haloMat;
      }

      this.root.add(holder);
      this.creatures.push(inst);
    }
  }

  update(dt: number, beatPulse: number, beatN: number, player: THREE.Vector3): void {
    const step = Math.min(dt, 0.05);
    this.t += step;
    const pulse = Math.max(0, Math.min(1, beatPulse));

    for (const c of this.creatures) {
      if (c.joyBurst > 0) {
        c.joyBurst = Math.max(0, c.joyBurst - step * 0.72);
      }

      // Smoothly turn toward the player when they are nearby on the same floor.
      let targetYaw = c.baseYaw;
      if (state.floor === c.floor) {
        const dx = player.x - c.x;
        const dz = player.z - c.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.2 && dist < LOOK_RANGE) {
          targetYaw = Math.atan2(dx, dz);
        }
      }
      const turnRate = c.id === 'ghoul' ? 2.2 : 4.5;
      c.yaw += wrapAngle(targetYaw - c.yaw) * Math.min(1, step * turnRate);

      const joyHop = c.joyBurst > 0 ? Math.abs(Math.sin(c.joyBurst * Math.PI * 3)) * 0.34 * c.joyBurst : 0;

      if (c.id === 'panda') {
        // Chubby beat-synced bounce + side-to-side waddle sway.
        const bounce = pulse * 0.11 + joyHop;
        const waddle = Math.sin(this.t * 3.1 + c.phase) * 0.095 + Math.sin(beatN * Math.PI * 0.5) * 0.03 * pulse;
        const squash = 1 - pulse * 0.045;
        c.modelGroup.position.set(0, bounce, 0);
        c.modelGroup.rotation.set(pulse * 0.04, 0, waddle);
        c.modelGroup.scale.set(1 + (1 - squash) * 0.6, squash + joyHop * 0.15, 1 + (1 - squash) * 0.6);
        c.holder.rotation.y = c.yaw + Math.sin(this.t * 1.4) * 0.08;
      } else if (c.id === 'chimp') {
        // Energetic beat hops + playful spin-grooves every 8 beats + joyful burst spin.
        const beatHop = Math.pow(pulse, 1.3) * 0.22 + joyHop * 1.15;
        const grooveWindow = beatN % 8 === 7 ? pulse : 0;
        if (grooveWindow > 0.15 || c.joyBurst > 0.05) {
          c.spinOffset += step * (c.joyBurst > 0.05 ? 7.5 : 4.2);
        } else {
          c.spinOffset *= Math.max(0, 1 - step * 6);
        }
        const shimmy = Math.sin(this.t * 6.8 + c.phase) * 0.12;
        const lean = Math.cos(this.t * 3.4 + c.phase) * 0.07;
        c.modelGroup.position.set(Math.sin(this.t * 3.4) * 0.08, beatHop, 0);
        c.modelGroup.rotation.set(lean, 0, shimmy);
        c.holder.rotation.y = c.yaw + c.spinOffset + Math.sin(this.t * 2.6) * 0.18;
      } else if (c.id === 'lemur') {
        // Brisk beat bob + playful ringed-tail wiggle sway on the 9 m balcony.
        const bob = pulse * 0.13 + joyHop * 0.9;
        const tailSway = Math.sin(this.t * 4.8 + c.phase) * 0.11;
        const wagYaw = Math.sin(this.t * 5.6 + c.phase) * 0.16;
        c.modelGroup.position.set(0, bob, 0);
        c.modelGroup.rotation.set(-pulse * 0.07, 0, tailSway);
        c.holder.rotation.y = c.yaw + wagYaw;
      } else {
        // Ghoul Reaver: eerie slow half-time techno sway + irregular creepy micro-twitches + faint green halo.
        const slowSway = Math.sin(this.t * 1.45 + c.phase) * 0.08;
        const twitchGate = Math.sin(this.t * 2.1) > 0.78 || c.joyBurst > 0.1 ? 1 : 0;
        const twitchZ = twitchGate * Math.sin(this.t * 31.0) * (0.07 + c.joyBurst * 0.08);
        const twitchX = twitchGate * Math.cos(this.t * 23.0) * 0.05;
        const creepY = pulse * 0.035;
        c.modelGroup.position.set(0, creepY, 0);
        c.modelGroup.rotation.set(0.06 + twitchX, 0, slowSway + twitchZ);
        c.holder.rotation.y = c.yaw + Math.sin(this.t * 0.9) * 0.12;

        if (c.halo && c.haloMat) {
          const shimmer = 0.16 + 0.04 * Math.sin(this.t * 3.2) + pulse * 0.03 + c.joyBurst * 0.12;
          c.haloMat.opacity = Math.min(0.32, shimmer);
          const sc = 1.15 + 0.1 * Math.sin(this.t * 2.4) + c.joyBurst * 0.25;
          c.halo.scale.set(sc, sc, 1);
        }
      }
    }
  }

  interact(at: THREE.Vector3, floor: number): boolean {
    let best: CreatureInstance | null = null;
    let bestDist = INTERACT_RANGE;

    for (const c of this.creatures) {
      if (c.floor !== floor) continue;
      const d = Math.hypot(at.x - c.x, at.z - c.z);
      if (d <= bestDist) {
        best = c;
        bestDist = d;
      }
    }

    if (!best) return false;
    if (this.t - best.lastInteract < INTERACT_COOLDOWN) return false;

    best.lastInteract = this.t;
    best.joyBurst = 1.0;

    bus.emit('ui:say', { key: best.textKey, seconds: 4.5 });

    if (best.id === 'panda' || best.id === 'chimp' || best.id === 'lemur') {
      bus.emit('crowd:cheer', {});
    }
    if (best.id === 'panda') {
      bus.emit('item:consumed', { item: 'ice_cream' });
    }

    return true;
  }
}
