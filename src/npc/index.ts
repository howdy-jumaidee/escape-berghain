// NPCs: placement, dialogue from content/npcs.json, the riddle horse and the herd. Issues #14, #15, #16.
// Model names: npc_<id>.glb in public/models/, e.g. npc_patrick.glb. Missing models are grey boxes.
import * as THREE from 'three';
import { bus, state, cellCenter, BEAT_SECONDS, type NpcId } from '../contracts';
import { placeModel } from '../look/models';
import npcText from '../../content/npcs.json';
import level1 from '../../levels/level1.json';

const TALK_RANGE = 2.4;
const WALK_AWAY = 4.5;
const HERD_STOMPS = 4;
const STOMP_WINDOW_MS = 150;

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
};

interface Npc {
  id: NpcId;
  objects: THREE.Object3D[];
  pos: THREE.Vector3;
  line: number;
}

type Lines = { lines?: string[] };

export class Npcs {
  readonly root = new THREE.Group();
  private npcs: Npc[] = [];
  private player = new THREE.Vector3();
  private talking: Npc | null = null;
  private riddleSolved = false;
  private riddleSeen = false;
  private beatTime = 0;
  private beatN = 0;
  private beatPulse = 0;
  private herdCount = 0;
  private herdLastN = -10;
  private herdSynced = false;
  private herdHintAt = -1e9;
  private herdMissAt = -1e9;

  constructor() {
    const spots = (level1 as unknown as { npcs: { id: NpcId; cell: [number, number] }[] }).npcs ?? [];
    for (const { id, cell } of spots) this.spawn(id, cell[0], cell[1]);

    bus.on('player:moved', ({ x, z }) => {
      this.player.set(x, 0, z);
      if (this.talking && this.talking.pos.distanceTo(this.player) > WALK_AWAY) {
        this.talking = null;
        bus.emit('npc:silent', {});
      }
      this.herdHint();
    });
    bus.on('player:grab', ({ x, z }) => this.talk(new THREE.Vector3(x, 0, z)));
    bus.on('player:stomp', ({ x, z, time }) => this.stomp(x, z, time));
    bus.on('beat', ({ n, time }) => {
      this.beatN = n;
      this.beatTime = time;
      this.beatPulse = 1;
    });
    bus.on('riddle:answered', ({ correct }) => this.riddleAnswered(correct));
  }

  update(dt: number): void {
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    const bounce = this.beatPulse * this.beatPulse;
    for (const npc of this.npcs) {
      const sync = npc.id === 'herd';
      npc.objects.forEach((o, i) => {
        if (sync) {
          // Perfect sync: hop and twist on every beat, all three the same.
          o.position.y = bounce * 0.25;
          o.rotation.y = Math.PI + Math.sin(this.beatN * Math.PI * 0.5) * 0.6;
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
    const size = horse ? { x: 0.6, y: 2.2, z: 0.45 } : { x: 0.55, y: 1.8, z: 0.35 };
    const mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x555555, roughness: 0.85 });
    const count = id === 'herd' ? 3 : id === 'tourists' ? 2 : 1;
    const objects: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const o = new THREE.Group();
      const body = placeModel(`npc_${id}`, size, mat);
      o.add(body);
      o.position.set(0, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(pos.x + (i - (count - 1) / 2) * 1.4, 0, pos.z);
      holder.add(o);
      this.root.add(holder);
      objects.push(o);
    }
    this.npcs.push({ id, objects, pos, line: 0 });
  }

  private talk(at: THREE.Vector3): void {
    if (state.ending) return;
    let best: Npc | null = null;
    let bestD = TALK_RANGE;
    for (const npc of this.npcs) {
      const d = npc.pos.distanceTo(at) - (npc.id === 'herd' ? 1.2 : 0);
      if (d < bestD) {
        best = npc;
        bestD = d;
      }
    }
    if (!best) return;
    this.talking = best;
    const say = (key: string) => bus.emit('npc:talk', { npc: best.id, lineId: `npcs:${best.id}.${key}` });

    switch (best.id) {
      case 'riddle_horse':
        if (this.riddleSolved) return say('riddle.right');
        if (!this.riddleSeen) {
          this.riddleSeen = true;
          return say('lines.0');
        }
        return bus.emit('riddle:show', {});
      case 'coat_check':
        return say(state.fragments.includes(3) ? 'with_ticket' : 'lines.0');
      case 'herd':
        say(`lines.${best.line++ % 2}`);
        return bus.emit('ui:say', { key: 'story:herd.hint', seconds: 4 });
      case 'philosopher': {
        if (best.line++ % 2 === 0) return say('lines.0');
        const n = state.fragments.length;
        const bucket = n >= 5 ? '5' : n >= 3 ? '3' : '0';
        return bus.emit('ui:say', { key: `npcs:philosopher.answers_by_fragments.${bucket}.${Math.floor(Math.random() * 2)}`, seconds: 3 });
      }
      default: {
        const lines = (npcText as unknown as Record<string, Lines>)[best.id]?.lines ?? [];
        if (!lines.length) return;
        say(`lines.${best.line++ % lines.length}`);
      }
    }
  }

  private riddleAnswered(correct: boolean): void {
    const horse = this.npcs.find((n) => n.id === 'riddle_horse');
    if (!horse) return;
    this.talking = horse;
    bus.emit('npc:talk', { npc: 'riddle_horse', lineId: `npcs:riddle_horse.riddle.${correct ? 'right' : 'wrong'}` });
    if (correct) {
      this.riddleSolved = true;
      if (!state.fragments.includes(5)) {
        state.fragments.push(5);
        bus.emit('fragment:found', { id: 5 });
        state.checkpoint = state.zone;
        bus.emit('checkpoint:set', { zone: state.zone });
      }
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
    if (this.herdSynced || !this.inHerdLine(x, z) || !this.beatTime) return;
    const period = BEAT_SECONDS * 1000;
    const since = time - this.beatTime;
    const nearestN = since < period / 2 ? this.beatN : this.beatN + 1;
    const err = Math.min(Math.abs(since), Math.abs(period - since));
    if (err > STOMP_WINDOW_MS) {
      this.herdCount = 0;
      if (time - this.herdMissAt > 3000) {
        this.herdMissAt = time;
        bus.emit('ui:say', { key: 'story:herd.miss', seconds: 2 });
      }
      return;
    }
    if (nearestN === this.herdLastN) return;
    this.herdCount = nearestN === this.herdLastN + 1 ? this.herdCount + 1 : 1;
    this.herdLastN = nearestN;
    if (this.herdCount >= HERD_STOMPS) {
      this.herdSynced = true;
      bus.emit('herd:synced', {});
      bus.emit('ui:say', { key: 'story:herd.synced', seconds: 4 });
    }
  }
}
