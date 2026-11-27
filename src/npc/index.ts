// NPCs: the crowd, the named weirdos, dialogue from content/npcs.json, the riddle horse, the herd, the spirit guide.
// Issues #14, #15, #16. Model names: npc_<id>.glb in public/models/, e.g. npc_patrick.glb. Missing models are grey boxes.
import * as THREE from 'three';
import { bus, state, cellCenter, BeatCounter, lock, unlock, type NpcId } from '../contracts';
import { placeModel } from '../look/models';
import { level, npcText } from '../data';
import { Crowd, type Spot } from './crowd';

const TALK_RANGE = 2.4;
const WALK_AWAY = 4.5;
const HERD_STOMPS = 4;
const SELFIE_RANGE = 3.4;
const CHOIR_RANGE = 4;
const BARK_EVERY_MS = 2200;
const MOP_EVERY = 11;

const HORSES = new Set<NpcId>(['riddle_horse', 'patrick', 'herd', 'ice_cream_horse']);
const COLOURS: Partial<Record<NpcId, number>> = {
  riddle_horse: 0x3d2a1e,
  patrick: 0x6d6a5a,
  herd: 0x2a2a2a,
  ice_cream_horse: 0xd8c8b0,
  friday_guy: 0x5a1e3a,
  coat_check: 0x303844,
  philosopher: 0x40406a,
  tourists: 0xb07a3a,
  bouncer: 0x0e0e0e,
  leather_choir: 0x050505,
  cleaner: 0x2a5a8a,
  leather_daddy: 0x0b0b0b,
  bartender_bear: 0x5a3a22,
  drag_oracle: 0xc81e8c,
  rubber_knight: 0x111418,
  old_raver: 0x5a5a3a,
  glitter_boy: 0xd8d0ff,
  darkroom_keeper: 0x050507,
  lighting_tech: 0x2a2a2a,
};
/** How many figures stand at one NPC spot. */
const GROUP: Partial<Record<NpcId, number>> = { herd: 3, tourists: 2, leather_choir: 5 };

interface Npc {
  id: NpcId;
  objects: THREE.Object3D[];
  holders: THREE.Object3D[];
  /** Where each figure started, where it's drifting to, and when it picks a new spot. */
  homes: THREE.Vector3[];
  targets: THREE.Vector3[];
  retarget: number[];
  pos: THREE.Vector3;
  line: number;
}

/** How each regular dances: hop height, side step, twist, and how far they wander from their spot (metres). */
interface DanceStyle {
  hop: number;
  step: number;
  twist: number;
  wander: number;
}
const DEFAULT_STYLE: DanceStyle = { hop: 0.12, step: 0.12, twist: 0.3, wander: 1.4 };
const STYLES: Partial<Record<NpcId, DanceStyle>> = {
  friday_guy: { hop: 0.3, step: 0.2, twist: 0.9, wander: 2.2 },
  patrick: { hop: 0.05, step: 0.3, twist: 0.15, wander: 1.6 },
  tourists: { hop: 0.18, step: 0.05, twist: 0.2, wander: 1.2 },
  philosopher: { hop: 0.03, step: 0.08, twist: 0.4, wander: 1 },
  riddle_horse: { hop: 0.04, step: 0.05, twist: 0.25, wander: 0.5 },
  ice_cream_horse: { hop: 0.06, step: 0.1, twist: 0.2, wander: 0.4 },
  // Working: they stay put and just nod along.
  coat_check: { hop: 0.03, step: 0, twist: 0.1, wander: 0 },
  bouncer: { hop: 0.02, step: 0, twist: 0, wander: 0 },
  cleaner: { hop: 0.02, step: 0, twist: 0.15, wander: 0 },
  bartender_bear: { hop: 0.03, step: 0.1, twist: 0.1, wander: 0.6 },
  drag_oracle: { hop: 0.05, step: 0.06, twist: 0.6, wander: 0.4 },
  rubber_knight: { hop: 0.08, step: 0.05, twist: 0.1, wander: 1 },
  old_raver: { hop: 0.1, step: 0.12, twist: 0.3, wander: 0.5 },
  glitter_boy: { hop: 0.28, step: 0.18, twist: 0.8, wander: 1.8 },
  darkroom_keeper: { hop: 0, step: 0, twist: 0.05, wander: 0 },
  lighting_tech: { hop: 0.02, step: 0, twist: 0.4, wander: 0.3 },
};
const WANDER_SPEED = 0.6;
/** Special NPCs: walk into them and you're pulled into a face to face conversation. */
const FOCUS = new Set<NpcId>([
  'friday_guy', 'patrick', 'philosopher', 'tourists', 'ice_cream_horse', 'bouncer', 'cleaner', 'leather_choir', 'riddle_horse', 'coat_check',
  'leather_daddy', 'bartender_bear', 'drag_oracle', 'rubber_knight', 'old_raver', 'glitter_boy', 'darkroom_keeper', 'lighting_tech',
]);
/** Figures that aren't the standard 1.8 m box. */
const SIZES: Partial<Record<NpcId, { x: number; y: number; z: number }>> = {
  bartender_bear: { x: 0.8, y: 1.9, z: 0.5 },
  drag_oracle: { x: 0.55, y: 2.15, z: 0.35 },
  rubber_knight: { x: 0.62, y: 1.95, z: 0.42 },
  glitter_boy: { x: 0.45, y: 1.7, z: 0.3 },
  leather_daddy: { x: 0.65, y: 1.88, z: 0.42 },
};
/** How close you have to stumble before they grab you. */
const BUMP_RANGE = 1.5;
/** Walk this far away before they can grab you again. */
const REARM_RANGE = 4.5;

interface Convo {
  npc: Npc;
  keys: string[];
  i: number;
  after?: () => void;
  /** Stay face to face after the last line (the riddle is asked in your face). */
  keepFocus?: boolean;
}
const STOP_FOR_PLAYER = 3.5;

export class Npcs {
  readonly root = new THREE.Group();
  readonly crowd: Crowd;
  private npcs: Npc[] = [];
  private player = new THREE.Vector3();
  private talking: Npc | null = null;
  private riddleSolved = false;
  private beatN = 0;
  private beatPulse = 0;
  private herd = new BeatCounter();
  private herdSynced = false;
  private herdHintAt = -1e9;
  private herdMissAt = -1e9;
  private selfieTaken = false;
  private crowdLooksAt: THREE.Vector3 | null = null;
  private guide: THREE.Group;
  private guideMat: THREE.MeshStandardMaterial;
  private guidePulse = 0;
  private guideVisible = false;
  private barkAt = 0;
  private choirNear = false;
  private mopTimer = MOP_EVERY;
  private t = 0;
  private puddles: { mesh: THREE.Mesh; left: number }[] = [];
  private convo: Convo | null = null;
  /** Who has already had their say and is waiting for you to walk away first. */
  private disarmed = new Set<Npc>();
  /** Has this NPC done their full conversation once? After that, they just say one line. */
  private heard = new Set<NpcId>();
  private eyes: THREE.Object3D[] = [];

  constructor() {
    for (const { id, cell } of level.npcs) this.spawn(id, cell[0], cell[1]);

    // The crowd fills everything else. Keep clear of NPCs, pickups, doors and the start.
    const avoid: Spot[] = this.npcs.map((n) => ({ x: n.pos.x, z: n.pos.z, r: n.id === 'herd' ? 3.4 : n.id === 'leather_choir' ? 3 : 1.6 }));
    for (const name of ['player_start', 'fragment_1', 'fragment_3', 'mate', 'exit_door', 'staircase_up']) {
      level.grid.forEach((line, row) =>
        [...line].forEach((ch, col) => {
          if (level.legend[ch] !== name) return;
          const c = cellCenter(col, row);
          avoid.push({ x: c.x, z: c.z, r: name === 'player_start' ? 3.2 : 1.8 });
        }),
      );
    }
    const booth = level.markers.dj_booth;
    if (booth) {
      const c = cellCenter(booth[0], booth[1]);
      avoid.push({ x: c.x, z: c.z + 2, r: 2 });
    }
    this.crowd = new Crowd(level, avoid);
    this.root.add(this.crowd.root);

    bus.on('player:moved', ({ x, z }) => {
      this.player.set(x, 0, z);
      if (this.talking && this.talking.pos.distanceTo(this.player) > WALK_AWAY) {
        this.talking = null;
        bus.emit('npc:silent', {});
      }
      this.herdHint();
      this.choir();
      this.bumpInto();
    });
    addEventListener('keydown', (e) => {
      if (!this.convo || e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.nextLine();
      } else if (e.code === 'Escape') {
        this.endConvo(false);
      }
    });
    bus.on('player:grab', ({ x, z }) => this.talk(new THREE.Vector3(x, 0, z)));
    bus.on('player:stomp', ({ x, z, time }) => this.stomp(x, z, time));
    bus.on('beat', ({ n, time }) => {
      this.beatN = n;
      this.beatPulse = 1;
      this.herd.beat(n, time);
    });
    bus.on('riddle:answered', ({ correct }) => this.riddleAnswered(correct));
    bus.on('door:refused', () => bus.emit('npc:talk', { npc: 'bouncer', lineId: 'npcs:bouncer.lines.0' }));
    bus.on('secret:dj', () => {
      if (!booth) return;
      const c = cellCenter(booth[0], booth[1]);
      this.crowdLooksAt = new THREE.Vector3(c.x, 0, c.z);
      this.crowd.turnTo(c.x, c.z);
    });
    bus.on('crowd:cheer', () => this.crowd.cheerNow(2.5));
    bus.on('game:finale', () => this.crowd.cheerNow(3));

    // The spirit guide: a tiny faint ghost of human you. More solid with every memory, fades when you forget.
    this.guideMat = new THREE.MeshStandardMaterial({
      color: 0xbfe9ff,
      emissive: 0x6fb8ff,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.guide = new THREE.Group();
    this.guide.add(placeModel('npc_spirit_guide', { x: 0.3, y: 0.9, z: 0.2 }, this.guideMat));
    this.guide.visible = false;
    this.root.add(this.guide);
    bus.on('intro:land', () => {
      this.guideVisible = true;
      this.guide.visible = true;
      this.guide.position.copy(this.player).add(new THREE.Vector3(-1.2, 0, -0.8));
    });
    bus.on('ui:say', ({ key }) => {
      if (key.startsWith('story:spirit_guide') || key.startsWith('story:intro') || key.startsWith('story:finale')) this.guidePulse = 1;
    });
  }

  /** Push the horse out of the crowd. Wired into the horse's collision by game-boot. Mutates pos. */
  pushPlayer(pos: THREE.Vector3, radius: number): void {
    // Special NPCs are solid: you bump into them, you don't walk through them.
    for (const npc of this.npcs) {
      if (!FOCUS.has(npc.id)) continue;
      for (const h of npc.holders) {
        const dx = pos.x - h.position.x;
        const dz = pos.z - h.position.z;
        const d = Math.hypot(dx, dz);
        const min = radius + 0.38;
        if (d < min && d > 1e-4) {
          pos.x = h.position.x + (dx / d) * min;
          pos.z = h.position.z + (dz / d) * min;
        }
      }
    }
    if (!this.crowd.push(pos, radius)) return;
    const now = performance.now();
    if (now - this.barkAt < BARK_EVERY_MS || !state.started || state.ending) return;
    this.barkAt = now;
    bus.emit('crowd:bump', {});
  }

  /** True if a dancer stands at (x, z): torches can't see through them. */
  blocks(x: number, z: number): boolean {
    return this.crowd.blocks(x, z);
  }

  update(dt: number): void {
    this.t += dt;
    this.updateGuide(dt);
    this.checkSelfie();
    this.mop(dt);
    this.blink(dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    this.crowd.update(dt, this.beatPulse, this.beatN);
    const bounce = this.beatPulse * this.beatPulse;
    for (const npc of this.npcs) {
      npc.objects.forEach((o, i) => {
        if (this.crowdLooksAt) {
          o.lookAt(this.crowdLooksAt.x, o.position.y, this.crowdLooksAt.z);
          o.position.y = bounce * 0.2;
        } else if (npc.id === 'herd') {
          // Perfect sync: hop and twist on every beat, all three the same.
          o.position.y = bounce * 0.25;
          o.rotation.y = Math.PI + Math.sin(this.beatN * Math.PI * 0.5) * 0.6;
        } else if (npc.id === 'leather_choir') {
          // Heads together, swaying as one, humming the bassline.
          o.position.y = 0;
          o.rotation.y = Math.atan2(npc.pos.x - npc.holders[i].position.x, npc.pos.z - npc.holders[i].position.z);
          o.rotation.z = Math.sin(this.t * 1.1) * 0.08;
        } else {
          this.danceAndWander(npc, i, o, bounce, dt);
        }
      });
      // Keep the talk spot on the figures as they move.
      if (npc.id !== 'cleaner' && npc.holders.length) {
        npc.pos.set(0, 0, 0);
        npc.holders.forEach((h) => npc.pos.add(h.position));
        npc.pos.multiplyScalar(1 / npc.holders.length);
      }
    }
  }

  /** Regulars dance on the beat and drift around their spot. Walk up to one and they stop and look at you. */
  private danceAndWander(npc: Npc, i: number, o: THREE.Object3D, bounce: number, dt: number): void {
    const style = STYLES[npc.id] ?? DEFAULT_STYLE;
    const h = npc.holders[i];
    const toPlayer = Math.hypot(this.player.x - h.position.x, this.player.z - h.position.z);
    const attentive = toPlayer < STOP_FOR_PLAYER;
    let yaw = o.rotation.y;

    if (style.wander > 0 && !attentive && state.started) {
      npc.retarget[i] -= dt;
      const tgt = npc.targets[i];
      const dx = tgt.x - h.position.x;
      const dz = tgt.z - h.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1 || npc.retarget[i] <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * style.wander;
        tgt.set(npc.homes[i].x + Math.cos(a) * r, 0, npc.homes[i].z + Math.sin(a) * r);
        npc.retarget[i] = 3 + Math.random() * 5;
      } else {
        const step = Math.min(d, WANDER_SPEED * dt);
        h.position.x += (dx / d) * step;
        h.position.z += (dz / d) * step;
        yaw = Math.atan2(dx, dz);
      }
    }
    if (attentive) yaw = Math.atan2(this.player.x - h.position.x, this.player.z - h.position.z);

    // Dance: hop on the beat, step side to side every other beat, a twist.
    const side = this.beatN % 2 === 0 ? 1 : -1;
    o.position.y = bounce * style.hop * (attentive ? 0.4 : 1);
    o.position.x = Math.cos(yaw) * side * style.step * (1 - this.beatPulse * 0.5);
    o.position.z = -Math.sin(yaw) * side * style.step * (1 - this.beatPulse * 0.5);
    o.rotation.y = yaw + (attentive ? 0 : Math.sin(this.beatN * Math.PI * 0.5 + i) * style.twist);
  }

  private spawn(id: NpcId, col: number, row: number): void {
    const c = cellCenter(col, row);
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const horse = HORSES.has(id);
    const size = SIZES[id] ?? (horse ? { x: 0.6, y: 2.2, z: 0.45 } : { x: 0.55, y: 1.8, z: 0.35 });
    const mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x555555, roughness: id === 'leather_choir' ? 0.35 : 0.85 });
    const count = GROUP[id] ?? 1;
    const objects: THREE.Object3D[] = [];
    const holders: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const o = new THREE.Group();
      o.add(placeModel(`npc_${id}`, size, mat));
      if (FOCUS.has(id)) o.add(this.makeEyes(size));
      const holder = new THREE.Group();
      if (id === 'leather_choir') {
        // A tight circle.
        const a = (i / count) * Math.PI * 2;
        holder.position.set(pos.x + Math.cos(a) * 0.9, 0, pos.z + Math.sin(a) * 0.9);
      } else {
        holder.position.set(pos.x + (i - (count - 1) / 2) * 1.4, 0, pos.z);
      }
      holder.add(o);
      this.root.add(holder);
      objects.push(o);
      holders.push(holder);
    }
    this.npcs.push({
      id,
      objects,
      holders,
      homes: holders.map((h) => h.position.clone()),
      targets: holders.map((h) => h.position.clone()),
      retarget: holders.map(() => Math.random() * 4),
      pos,
      line: 0,
    });
  }

  private talk(at: THREE.Vector3): void {
    if (state.ending) return;
    let best: Npc | null = null;
    let bestD = TALK_RANGE;
    for (const npc of this.npcs) {
      const d = npc.pos.distanceTo(at) - (npc.id === 'herd' || npc.id === 'leather_choir' ? 1.2 : 0);
      if (d < bestD) {
        best = npc;
        bestD = d;
      }
    }
    if (!best) return;
    this.talking = best;
    const npc = best;
    if (FOCUS.has(npc.id)) return this.startConvo(npc);
    const say = (key: string) => bus.emit('npc:talk', { npc: npc.id, lineId: `npcs:${npc.id}.${key}` });

    switch (npc.id) {
      case 'herd':
        say(state.passOuts > 0 ? 'warning' : `lines.${npc.line++ % 2}`);
        return bus.emit('ui:say', { key: 'story:herd.hint', seconds: 4 });
      default: {
        const lines = npcText[npc.id]?.lines ?? [];
        if (!lines.length) return;
        say(`lines.${npc.line++ % lines.length}`);
      }
    }
  }

  /** The leather choir: stand with them and the music opens up. */
  private choir(): void {
    const c = this.npcs.find((n) => n.id === 'leather_choir');
    if (!c) return;
    const near = c.pos.distanceTo(this.player) < CHOIR_RANGE;
    if (near === this.choirNear) return;
    this.choirNear = near;
    bus.emit('music:choir', { near });
    if (near) bus.emit('npc:talk', { npc: 'leather_choir', lineId: 'npcs:leather_choir.lines.0' });
  }

  /** The 6 am cleaner wanders and mops. Wet floor: the horse slides. */
  private mop(dt: number): void {
    const cleaner = this.npcs.find((n) => n.id === 'cleaner');
    for (const p of this.puddles) {
      p.left -= dt;
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(0.55, p.left * 0.1);
      if (p.left <= 0) this.root.remove(p.mesh);
    }
    this.puddles = this.puddles.filter((p) => p.left > 0);
    if (!cleaner || !state.started) return;
    // Shuffle back and forth along the bar.
    const h = cleaner.holders[0];
    const homeX = cellCenter(level.npcs.find((n) => n.id === 'cleaner')!.cell[0], 0).x;
    h.position.x = homeX + Math.sin(this.t * 0.15) * 4;
    cleaner.pos.x = h.position.x;
    this.mopTimer -= dt;
    if (this.mopTimer > 0) return;
    this.mopTimer = MOP_EVERY;
    const seconds = 14;
    const radius = 1.8;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshStandardMaterial({ color: 0x8fb4d0, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(h.position.x, 0.02, h.position.z + 1);
    this.root.add(mesh);
    this.puddles.push({ mesh, left: seconds });
    bus.emit('floor:wet', { x: mesh.position.x, z: mesh.position.z, radius, seconds });
  }

  private updateGuide(dt: number): void {
    if (!this.guideVisible) return;
    this.guidePulse = Math.max(0, this.guidePulse - dt * 0.8);
    const want = this.player.clone().add(new THREE.Vector3(-1.2, 0, -0.8));
    this.guide.position.lerp(want, 1 - Math.exp(-2.5 * dt));
    this.guide.position.y = 0.4 + Math.sin(performance.now() / 600) * 0.12;
    this.guide.lookAt(this.player.x, this.guide.position.y, this.player.z);
    const solid = 0.12 + state.fragments.length * 0.13;
    // Forgetting: past trip 85 the guide fades away.
    const forget = Math.max(0, Math.min(1, (state.trip - 85) / 15));
    this.guideMat.opacity = Math.min(0.85, solid + this.guidePulse * 0.25) * (1 - forget * 0.9);
    this.guideMat.emissiveIntensity = 0.4 + this.guidePulse;
  }

  private checkSelfie(): void {
    if (this.selfieTaken || !state.started || state.ending) return;
    const t = this.npcs.find((n) => n.id === 'tourists');
    if (!t || t.pos.distanceTo(this.player) > SELFIE_RANGE) return;
    this.selfieTaken = true;
    this.talking = t;
    bus.emit('npc:talk', { npc: 'tourists', lineId: 'npcs:tourists.lines.0' });
    bus.emit('selfie:flash', { x: t.pos.x, z: t.pos.z });
    setTimeout(() => bus.emit('ui:say', { key: 'story:selfie_after', seconds: 3 }), 3500);
  }

  // ---------- Conversations: forced, face to face, like an old RPG ----------

  /** Stumble into a special NPC and they pull you into a conversation. */
  private bumpInto(): void {
    for (const npc of this.npcs) {
      if (!FOCUS.has(npc.id)) continue;
      const d = npc.pos.distanceTo(this.player);
      if (d > REARM_RANGE) this.disarmed.delete(npc);
      const range = npc.id === 'leather_choir' ? 2.2 : BUMP_RANGE;
      if (d < range && !this.disarmed.has(npc) && !this.convo && state.started && !state.ending && !state.inputLocked) {
        this.startConvo(npc);
        return;
      }
    }
  }

  private startConvo(npc: Npc): void {
    if (this.convo || state.ending) return;
    const { keys, after, keepFocus } = this.script(npc);
    if (!keys.length) return;
    this.convo = { npc, keys, i: 0, after, keepFocus };
    this.disarmed.add(npc);
    this.talking = npc;
    lock('talk');
    const h = npc.holders[0];
    // Eye height, so their eyes sit right in the middle of the frame.
    const face = (SIZES[npc.id]?.y ?? (HORSES.has(npc.id) ? 2.2 : 1.8)) - 0.32;
    bus.emit('npc:focus', { npc: npc.id, x: h.position.x, y: face, z: h.position.z });
    this.sayLine();
  }

  /** What an NPC says, given where you are in the story. Some of it is true. Some of it isn't. */
  private script(npc: Npc): { keys: string[]; after?: () => void; keepFocus?: boolean } {
    const talk = (npcText[npc.id]?.talk as string[] | undefined) ?? [];
    const full = talk.map((_, i) => `talk.${i}`);
    const once = (keys: string[]) => {
      const first = !this.heard.has(npc.id);
      this.heard.add(npc.id);
      return first ? keys : keys.slice(-1);
    };
    switch (npc.id) {
      case 'riddle_horse':
        if (this.riddleSolved) return { keys: ['riddle.right'] };
        // The bike riddle needs your keys first.
        if (!state.fragments.includes(4)) return { keys: ['talk.0', 'not_yet'] };
        return { keys: once(full), after: () => bus.emit('riddle:show', {}), keepFocus: true };
      case 'coat_check':
        if (!state.fragments.includes(3)) return { keys: ['lines.0'] };
        if (state.fragments.includes(4)) return { keys: ['empty'] };
        // Ticket in, jacket out, keys in the pocket.
        return { keys: ['jacket'], after: () => bus.emit('fragment:claim', { id: 4 }) };
      default:
        return { keys: once(full.length ? full : ['lines.0']) };
    }
  }

  private sayLine(): void {
    const c = this.convo;
    if (!c) return;
    bus.emit('npc:talk', { npc: c.npc.id, lineId: `npcs:${c.npc.id}.${c.keys[c.i]}` });
  }

  private nextLine(): void {
    const c = this.convo;
    if (!c) return;
    c.i++;
    if (c.i >= c.keys.length) return this.endConvo(true);
    this.sayLine();
  }

  private endConvo(finished: boolean): void {
    const c = this.convo;
    if (!c) return;
    this.convo = null;
    unlock('talk');
    if (finished && c.keepFocus) return c.after?.();
    bus.emit('npc:unfocus', {});
    bus.emit('npc:silent', {});
    if (finished) c.after?.();
  }

  /** Two eyes that blink. When you're face to face, they're looking right at you. */
  private makeEyes(size: { x: number; y: number; z: number }): THREE.Object3D {
    const eyes = new THREE.Group();
    eyes.position.set(0, size.y - 0.32, size.z / 2 + 0.01);
    const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    const black = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.01), white);
      eye.position.x = x;
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.01), black);
      pupil.position.set(x, -0.005, 0.008);
      eyes.add(eye, pupil);
    }
    eyes.userData.blinkIn = 1 + Math.random() * 4;
    this.eyes.push(eyes);
    return eyes;
  }

  private blink(dt: number): void {
    for (const e of this.eyes) {
      e.userData.blinkIn -= dt;
      if (e.userData.blinkIn < 0) e.userData.blinkIn = 2 + Math.random() * 4;
      e.scale.y = e.userData.blinkIn < 0.12 ? 0.1 : 1;
    }
  }

  private riddleAnswered(correct: boolean): void {
    const horse = this.npcs.find((n) => n.id === 'riddle_horse');
    if (!horse) return;
    this.talking = horse;
    bus.emit('npc:talk', { npc: 'riddle_horse', lineId: `npcs:riddle_horse.riddle.${correct ? 'right' : 'wrong'}` });
    // Let his answer land in your face, then let go.
    setTimeout(() => {
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
    }, 3000);
    if (correct) {
      this.riddleSolved = true;
      bus.emit('fragment:claim', { id: 5 });
    } else {
      // The long way, with a bonus Mate on the floor next to him.
      bus.emit('item:spawn', { item: 'mate', x: horse.pos.x - 1.6, z: horse.pos.z - 1 });
    }
  }

  private inHerdLine(x: number, z: number): boolean {
    const herd = this.npcs.find((n) => n.id === 'herd');
    return !!herd && Math.abs(z - herd.pos.z) < 1.8 && Math.abs(x - herd.pos.x) < 6;
  }

  private herdHint(): void {
    if (this.herdSynced || !this.inHerdLine(this.player.x, this.player.z)) return;
    const now = performance.now();
    if (now - this.herdHintAt < 20000) return;
    this.herdHintAt = now;
    bus.emit('ui:say', { key: 'story:herd.hint', seconds: 4 });
  }

  private stomp(x: number, z: number, time: number): void {
    if (this.herdSynced || !this.inHerdLine(x, z)) return;
    const streak = this.herd.stomp(time);
    if (streak === 0) {
      if (time - this.herdMissAt > 3000) {
        this.herdMissAt = time;
        bus.emit('ui:say', { key: 'story:herd.miss', seconds: 2 });
      }
      return;
    }
    if (streak < HERD_STOMPS) return;
    this.herdSynced = true;
    bus.emit('herd:synced', {});
    bus.emit('crowd:cheer', {});
    bus.emit('ui:say', { key: 'story:herd.synced', seconds: 4 });
  }
}
