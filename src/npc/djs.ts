// Live animated club DJs across Main Hall booth, 9 m Panorama Bar gallery, and ground-floor Panorama Bar.
import * as THREE from 'three';
import { state, cellCenter, FLOOR_HEIGHT } from '../contracts';
import { placeModel } from '../look/models';
import { level } from '../data';
import { animateCharacter, bindRig, type DanceArchetype } from './motion';

interface DjActor {
  holder: THREE.Group;
  modelHolder: THREE.Group;
  archetype: DanceArchetype;
  seed: number;
  isHeadliner: boolean;
  isCoDj: boolean;
}

interface DeckConsole {
  platters: THREE.Mesh[];
  ledMat: THREE.MeshBasicMaterial;
}

export class Djs {
  readonly root = new THREE.Group();
  private djs: DjActor[] = [];
  private decks: DeckConsole[] = [];
  private t = 0;

  constructor() {
    this.root.name = 'djs';

    const booth = level.markers.dj_booth ?? [5, 1];
    const c = cellCenter(booth[0], booth[1]);

    // Grounded steel DJ riser behind the Main Hall booth so both headliner and B2B DJs stand solidly at y = 0.35.
    const riserMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.65, metalness: 0.6 });
    const riser = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 1.15), riserMat);
    riser.name = 'main_dj_riser';
    riser.position.set(c.x + 0.05, 0.175, c.z - 0.82);
    this.root.add(riser);

    // 1. Main Hall Headliner DJ (Jezz Torrent shirtless leather) behind the Main Hall booth facing +Z.
    this.addDj({
      model: 'npc_friday_guy',
      size: { x: 0.55, y: 1.8, z: 0.35 },
      fallbackColor: 0x5a1e3a,
      x: c.x - 0.65,
      y: 0.35,
      z: c.z - 0.75,
      yaw: 0,
      archetype: 'techno_pump',
      seed: 0.4,
      isHeadliner: true,
      isCoDj: false,
    });

    // 2. Main Hall B2B / Co-DJ (all-black SWAT gear) beside the headliner facing +Z.
    this.addDj({
      model: 'npc_rubber_knight',
      size: { x: 0.62, y: 1.95, z: 0.42 },
      fallbackColor: 0x111418,
      x: c.x + 0.75,
      y: 0.35,
      z: c.z - 0.75,
      yaw: 0,
      archetype: 'leather_groove',
      seed: 2.1,
      isHeadliner: false,
      isCoDj: true,
    });

    // 3. Panorama Bar Upstairs DJ (glam Percy) on the 9 m south gallery facing -Z out across the main hall.
    const upX = 33;
    const upY = FLOOR_HEIGHT;
    const upZ = 51.8;
    this.addDj({
      model: 'npc_glitter_boy',
      size: { x: 0.45, y: 1.7, z: 0.3 },
      fallbackColor: 0xd8d0ff,
      x: upX,
      y: upY,
      z: upZ,
      yaw: Math.PI,
      archetype: 'diva_sway',
      seed: 4.3,
      isHeadliner: false,
      isCoDj: false,
    });
    this.addDeckConsole(upX, upY, upZ - 0.82, Math.PI, 1.85, 0.96, 0.66, 0x00f0ff, 0xff2ec4);

    // 4. Ground-floor Panorama Bar Selector (Mercedes leather corset) in corner [8, 10] facing -Z / -X.
    const selCell = cellCenter(8, 10);
    const selX = selCell.x + 1.0;
    const selZ = selCell.z + 1.0;
    const selYaw = -Math.PI * 0.75;
    this.addDj({
      model: 'npc_drag_oracle',
      size: { x: 0.55, y: 2.15, z: 0.35 },
      fallbackColor: 0xc81e8c,
      x: selX,
      y: 0,
      z: selZ,
      yaw: selYaw,
      archetype: 'diva_sway',
      seed: 6.2,
      isHeadliner: false,
      isCoDj: false,
    });
    this.addDeckConsole(
      selX + Math.sin(selYaw) * 0.78,
      0,
      selZ + Math.cos(selYaw) * 0.78,
      selYaw,
      1.45,
      0.96,
      0.58,
      0xff2ec4,
      0x00f0ff,
    );
  }

  private addDj(spec: {
    model: string;
    size: THREE.Vector3Like;
    fallbackColor: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    archetype: DanceArchetype;
    seed: number;
    isHeadliner: boolean;
    isCoDj: boolean;
  }): void {
    const holder = new THREE.Group();
    holder.position.set(spec.x, spec.y, spec.z);
    holder.rotation.y = spec.yaw;

    const modelHolder = new THREE.Group();
    const fallbackMat = new THREE.MeshStandardMaterial({ color: spec.fallbackColor, roughness: 0.78 });
    modelHolder.add(placeModel(spec.model, spec.size, fallbackMat));
    holder.add(modelHolder);
    this.root.add(holder);

    this.djs.push({
      holder,
      modelHolder,
      archetype: spec.archetype,
      seed: spec.seed,
      isHeadliner: spec.isHeadliner,
      isCoDj: spec.isCoDj,
    });
  }

  private addDeckConsole(
    x: number,
    y: number,
    z: number,
    yaw: number,
    width: number,
    height: number,
    depth: number,
    glowA: number,
    glowB: number,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.42, metalness: 0.85 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x0f1014, roughness: 0.55, metalness: 0.5 });

    // Table top and sleek vertical support pillars grounded cleanly at local y = 0.
    const topThick = 0.08;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, topThick, depth), steelMat);
    top.position.y = height - topThick / 2;
    group.add(top);

    const legH = height - topThick;
    const legGeo = new THREE.BoxGeometry(0.1, legH, depth * 0.82);
    const legL = new THREE.Mesh(legGeo, steelMat);
    legL.position.set(-width * 0.42, legH / 2, 0);
    const legR = new THREE.Mesh(legGeo, steelMat);
    legR.position.set(width * 0.42, legH / 2, 0);
    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, legH * 0.75, 0.04), deckMat);
    frontPanel.position.set(0, height * 0.52, depth * 0.34);
    group.add(legL, legR, frontPanel);

    // Two turntable housings + glowing cyan/magenta platters + central mixer LED strip.
    const platters: THREE.Mesh[] = [];
    const platterGeo = new THREE.CylinderGeometry(0.17, 0.18, 0.025, 14);
    const slipGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.028, 12);
    const baseGeo = new THREE.BoxGeometry(0.42, 0.04, 0.36);

    const colors = [glowA, glowB];
    const offsets = [-width * 0.28, width * 0.28];
    for (let i = 0; i < 2; i++) {
      const ttBase = new THREE.Mesh(baseGeo, deckMat);
      ttBase.position.set(offsets[i], height + 0.02, 0);
      group.add(ttBase);

      const platterMat = new THREE.MeshStandardMaterial({
        color: colors[i],
        emissive: colors[i],
        emissiveIntensity: 1.45,
        roughness: 0.25,
        metalness: 0.3,
      });
      const platter = new THREE.Mesh(platterGeo, platterMat);
      platter.position.set(offsets[i], height + 0.052, 0);
      const centerCap = new THREE.Mesh(slipGeo, deckMat);
      platter.add(centerCap);
      group.add(platter);
      platters.push(platter);
    }

    const ledMat = new THREE.MeshBasicMaterial({ color: glowA, toneMapped: false });
    const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.32), deckMat);
    mixer.position.set(0, height + 0.022, 0);
    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.03), ledMat);
    ledStrip.position.set(0, height + 0.05, 0.12);
    group.add(mixer, ledStrip);

    this.root.add(group);
    this.decks.push({ platters, ledMat });
  }

  update(dt: number, beatPulse: number, beatN: number): void {
    this.t += dt;
    const pulse = beatPulse * beatPulse;

    for (const deck of this.decks) {
      for (const p of deck.platters) p.rotation.y += dt * 3.6;
      deck.ledMat.color.setHSL(((beatN * 0.08 + this.t * 0.15) % 1 + 1) % 1, 0.9, 0.52 + pulse * 0.28);
    }

    for (const dj of this.djs) {
      if (dj.isCoDj) {
        // Subtle deck adjustments & alternating glance between crowd and mixer.
        dj.modelHolder.rotation.y = Math.sin(this.t * 0.9 + dj.seed) * 0.14;
      }

      const rig = bindRig(dj.modelHolder);
      if (rig) {
        const dropHandsUp = dj.isHeadliner
          ? state.finale || beatN % 32 >= 24
          : dj.isCoDj
            ? state.finale || beatN % 64 >= 56
            : state.finale;
        animateCharacter(rig, {
          dt,
          t: this.t,
          beatN,
          beatPulse,
          archetype: dj.archetype,
          moveSpeed: 0,
          attentive: false,
          talking: false,
          cheer: dropHandsUp,
          finale: state.finale,
          seed: dj.seed,
        });
      }
    }
  }
}
