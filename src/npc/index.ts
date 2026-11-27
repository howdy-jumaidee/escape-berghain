// NPCs: the crowd, the named weirdos, dialogue from content/npcs.json, the riddle horse, the herd, the spirit guide.
// Issues #14, #15, #16. Model names: npc_<id>.glb in public/models/, e.g. npc_patrick.glb. Missing models are grey boxes.
import * as THREE from 'three';
import { bus, state, cellCenter, BeatCounter, type NpcId } from '../contracts';
import { placeModel } from '../look/models';
import { level, npcText, story } from '../data';
import { Crowd, type Spot } from './crowd';

const TALK_RANGE = 2.4;
const WALK_AWAY = 4.5;
const HERD_STOMPS = 4;
const SELFIE_RANGE = 3.4;
const CHOIR_RANGE = 4;
const BARK_EVERY_MS = 2200;
const SINK_COOLDOWN_MS = 20000;
const MOP_EVERY = 11;

const HORSES = new Set<NpcId>(['riddle_horse', 'patrick', 'herd', 'ice_cream_horse', 'calm_horse']);
const COLOURS: Partial<Record<NpcId, number>> = {
  riddle_horse: 0x3d2a1e,
  patrick: 0x6d6a5a,
  herd: 0x2a2a2a,
  ice_cream_horse: 0xd8c8b0,
  calm_horse: 0x9a7a55,
  friday_guy: 0x5a1e3a,
  coat_check: 0x303844,
  philosopher: 0x40406a,
  tourists: 0xb07a3a,
  bouncer: 0x0e0e0e,
  leather_choir: 0x050505,
  cleaner: 0x2a5a8a,
  sink: 0x9aa4a8,
  shoe_collector: 0x6a3a6a,
  dj_cousin: 0x1a1a1a,
};
/** How many figures stand at one NPC spot. */
const GROUP: Partial<Record<NpcId, number>> = { herd: 3, tourists: 2, leather_choir: 5 };

interface Npc {
  id: NpcId;
  objects: THREE.Object3D[];
  holders: THREE.Object3D[];
  pos: THREE.Vector3;
  line: number;
}

export class Npcs {
  readonly root = new THREE.Group();
  readonly crowd: Crowd;
  private npcs: Npc[] = [];
  private player = new THREE.Vector3();
  private talking: Npc | null = null;
  private riddleSolved = false;
  private riddleSeen = false;
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
  private sinkAt = -1e9;
  private choirNear = false;
  private mopTimer = MOP_EVERY;
  private t = 0;
  private puddles: { mesh: THREE.Mesh; left: number }[] = [];

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
    });
    bus.on('player:grab', ({ x, z }) => this.talk(new THREE.Vector3(x, 0, z)));
    bus.on('player:stomp', ({ x, z, time }) => this.stomp(x, z, time));
    bus.on('beat', ({ n, time }) => {
      this.beatN = n;
      this.beatPulse = 1;
      this.herd.beat(n, time);
    });
    bus.on('riddle:answered', ({ correct }) => this.riddleAnswered(correct));
    bus.on('jacket:shaken', () => bus.emit('fragment:claim', { id: 4 }));
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
    if (!this.crowd.push(pos, radius)) return;
    const now = performance.now();
    if (now - this.barkAt < BARK_EVERY_MS || !state.started || state.ending) return;
    this.barkAt = now;
    bus.emit('crowd:bump', {});
    const n = story.crowd.barks.length;
    if (Math.random() < 0.6) bus.emit('ui:say', { key: `story:crowd.barks.${Math.floor(Math.random() * n)}`, seconds: 1.8 });
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
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    this.crowd.update(dt, this.beatPulse);
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
          o.position.y = bounce * 0.05 * ((i % 2) + 1);
          o.lookAt(this.player.x, o.position.y, this.player.z);
        }
      });
    }
  }

  private spawn(id: NpcId, col: number, row: number): void {
    const c = cellCenter(col, row);
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const horse = HORSES.has(id);
    const size = horse ? { x: 0.6, y: 2.2, z: 0.45 } : id === 'sink' ? { x: 1.2, y: 0.9, z: 0.5 } : { x: 0.55, y: 1.8, z: 0.35 };
    const mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x555555, roughness: id === 'leather_choir' ? 0.35 : 0.85 });
    const count = GROUP[id] ?? 1;
    const objects: THREE.Object3D[] = [];
    const holders: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const o = new THREE.Group();
      o.add(placeModel(`npc_${id}`, size, mat));
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
    this.npcs.push({ id, objects, holders, pos, line: 0 });
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
    const say = (key: string) => bus.emit('npc:talk', { npc: npc.id, lineId: `npcs:${npc.id}.${key}` });

    switch (npc.id) {
      case 'riddle_horse':
        if (this.riddleSolved) return say('riddle.right');
        // The chain runs in order: the bike riddle needs your keys.
        if (!state.fragments.includes(4)) return say('not_yet');
        if (!this.riddleSeen) {
          this.riddleSeen = true;
          return say('lines.0');
        }
        return bus.emit('riddle:show', {});
      case 'coat_check':
        if (!state.fragments.includes(3)) return say('lines.0');
        if (state.fragments.includes(4)) return say('empty');
        say('jacket');
        bus.emit('ui:say', { key: 'story:spirit_guide.jacket', seconds: 3 });
        return bus.emit('jacket:start', {});
      case 'tourists':
        return say(this.selfieTaken ? 'lines.1' : 'lines.0');
      case 'herd':
        say(state.passOuts > 0 ? 'warning' : `lines.${npc.line++ % 2}`);
        return bus.emit('ui:say', { key: 'story:herd.hint', seconds: 4 });
      case 'sink': {
        const now = performance.now();
        if (now - this.sinkAt < SINK_COOLDOWN_MS) return say('busy');
        this.sinkAt = now;
        say('lines.0');
        return bus.emit('item:consumed', { item: 'water' });
      }
      case 'philosopher': {
        if (npc.line++ % 2 === 0) return say('lines.0');
        const n = state.fragments.length;
        const bucket = n >= 5 ? '5' : n >= 3 ? '3' : '0';
        return bus.emit('ui:say', { key: `npcs:philosopher.answers_by_fragments.${bucket}.${Math.floor(Math.random() * 2)}`, seconds: 3 });
      }
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
    if (this.selfieTaken || !state.started || state.ending || state.rat) return;
    const t = this.npcs.find((n) => n.id === 'tourists');
    if (!t || t.pos.distanceTo(this.player) > SELFIE_RANGE) return;
    this.selfieTaken = true;
    this.talking = t;
    bus.emit('npc:talk', { npc: 'tourists', lineId: 'npcs:tourists.lines.0' });
    bus.emit('selfie:flash', { x: t.pos.x, z: t.pos.z });
    setTimeout(() => bus.emit('ui:say', { key: 'story:selfie_after', seconds: 3 }), 3500);
  }

  private riddleAnswered(correct: boolean): void {
    const horse = this.npcs.find((n) => n.id === 'riddle_horse');
    if (!horse) return;
    this.talking = horse;
    bus.emit('npc:talk', { npc: 'riddle_horse', lineId: `npcs:riddle_horse.riddle.${correct ? 'right' : 'wrong'}` });
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
