// NPCs: the crowd, the named weirdos, dialogue from content/npcs.json, the riddle horse, the herd, the spirit guide.
// Issues #14, #15, #16. Model names: npc_<id>.glb in public/models/, e.g. npc_patrick.glb. Missing models are grey boxes.
import * as THREE from 'three';
import { bus, state, cellCenter, BeatCounter, lock, unlock, type NpcId, type TextKey, type ZoneId } from '../contracts';
import { placeModel } from '../look/models';
import { level, npcText } from '../data';
import { Crowd, type Spot } from './crowd';
import { Djs } from './djs';
import { animateCharacter, bindRig, type DanceArchetype } from './motion';

const TALK_RANGE = 2.4;
/** Room the crowd gives a conversation. The camera sits 2.25 m from the face, so this covers the whole line. */
const CONVO_CLEAR_RADIUS = 2.7;
/** Regulars are bigger than dancers, so they keep a little more room. */
const REGULAR_CLEAR_RADIUS = 3.1;
/** How close a unicorn has to be before audio plays its shimmer. */
const UNICORN_HEAR_RANGE = 6;
const WALK_AWAY = 4.5;
const HERD_STOMPS = 4;
const SELFIE_RANGE = 3.4;
const CHOIR_RANGE = 4;
const BARK_EVERY_MS = 2200;
const MOP_EVERY = 11;
const PUDDLE_RADIUS = 1.8;

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
  toilet_junkie: 0x4a4a3a,
  toilet_dealer: 0x5a3a2a,
  pup: 0x141414,
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
  prevPos: THREE.Vector3[];
  retarget: number[];
  seeds: number[];
  pos: THREE.Vector3;
  line: number;
}

const ARCHETYPES: Partial<Record<NpcId, DanceArchetype>> = {
  herd: 'herd_sync',
  riddle_horse: 'herd_sync',
  patrick: 'herd_sync',
  ice_cream_horse: 'herd_sync',
  leather_choir: 'choir_trance',
  philosopher: 'choir_trance',
  leather_daddy: 'leather_groove',
  rubber_knight: 'leather_groove',
  bartender_bear: 'leather_groove',
  darkroom_keeper: 'leather_groove',
  drag_oracle: 'diva_sway',
  glitter_boy: 'diva_sway',
  coat_check: 'chill_nod',
  bouncer: 'chill_nod',
  lighting_tech: 'chill_nod',
  cleaner: 'chill_nod',
  spirit_guide: 'chill_nod',
  friday_guy: 'techno_pump',
  tourists: 'techno_pump',
  old_raver: 'techno_pump',
};

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
  toilet_junkie: { hop: 0.02, step: 0.04, twist: 0.15, wander: 0.4 },
  toilet_dealer: { hop: 0, step: 0, twist: 0.05, wander: 0 },
  pup: { hop: 0.06, step: 0.1, twist: 0.5, wander: 0.8 },
};
const WANDER_SPEED = 0.6;
/** Special NPCs: press Space next to them and you get a face to face conversation. */
const FOCUS = new Set<NpcId>([
  'friday_guy', 'patrick', 'philosopher', 'tourists', 'ice_cream_horse', 'bouncer', 'cleaner', 'leather_choir', 'riddle_horse', 'coat_check',
  'leather_daddy', 'bartender_bear', 'drag_oracle', 'rubber_knight', 'old_raver', 'glitter_boy', 'darkroom_keeper', 'lighting_tech',
  'toilet_junkie', 'toilet_dealer', 'pup',
]);
/** The strangest and the story-important few: stumble into one of these and they pull you into a conversation themselves. */
const AUTO_TALK = new Set<NpcId>([
  'riddle_horse', 'coat_check', 'drag_oracle', 'ice_cream_horse', 'pup', 'leather_choir',
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

const TALK_BACK_NPCS = new Set<NpcId>([
  'friday_guy', 'bartender_bear', 'philosopher', 'leather_daddy', 'drag_oracle',
  'old_raver', 'glitter_boy', 'darkroom_keeper', 'lighting_tech', 'rubber_knight', 'cleaner',
]);

/** What picking a talk-back answer does. Set per choice in content/npcs.json as `effect`. */
type TalkEffect =
  | 'sober' | 'trip_up' | 'mate' | 'brain_freeze' | 'cheer'
  | 'hint' | 'lie' | 'shortcut' | 'wrong_way' | 'snitch' | 'chaos';
const CHAOS: TalkEffect[] = ['sober', 'trip_up', 'mate', 'brain_freeze', 'cheer', 'shortcut', 'wrong_way'];
type NextStep = 1 | 2 | 3 | 4 | 5 | 'done';
/** Where a shortcut drops you for the next missing memory. */
const STEP_ZONE: Record<string, ZoneId> = {
  1: 'main_hall', 2: 'main_hall', 3: 'bar_cloakroom', 4: 'bar_cloakroom', 5: 'toilet_corridor', done: 'back_exit',
};
const ALL_ZONES: ZoneId[] = ['main_hall', 'bar_cloakroom', 'toilet_corridor', 'panorama_bar', 'back_exit'];

interface TalkChoiceEntry {
  id: string;
  text: string;
  reply?: string;
  reply_used?: string;
  effect?: TalkEffect;
  /** Chance (0..1) that `effect` happens; otherwise `otherwise` does. Liars use it. */
  chance?: number;
  otherwise?: TalkEffect;
  /** Story flag added the first time this choice's effect fires. NPCs with `by_flag` lines react to it. */
  sets?: string;
}

interface Convo {
  npc: Npc;
  holderIndex: number;
  keys: string[];
  i: number;
  after?: () => void;
  /** Stay face to face after the last line (the riddle or choices are shown in your face). */
  keepFocus?: boolean;
  /** Jump straight to choices after showing the opening/summary line (used on repeat talks). */
  immediateChoices?: boolean;
}
const STOP_FOR_PLAYER = 3.5;

export class Npcs {
  readonly root = new THREE.Group();
  readonly crowd: Crowd;
  private djs = new Djs();
  private npcs: Npc[] = [];
  private player = new THREE.Vector3();
  private nearCheck = 0;
  /** Regulars pushed aside for a conversation, so the ones that never wander can be put back. */
  private madeRoom = new Set<Npc>();
  private wasNear = false;
  private wasTalk = false;
  private wasNearUnicorn = false;
  private talking: Npc | null = null;
  private riddleSolved = false;
  private riddleMateSpawned = false;
  private riddleTimer = 0;
  private beatN = 0;
  private beatPulse = 0;
  private cheerLeft = 0;
  private herd = new BeatCounter();
  private herdSynced = false;
  private herdHintAt = -1e9;
  private herdMissAt = -1e9;
  private unicornAt = -1e9;
  private selfieTaken = false;
  private crowdLooksAt: THREE.Vector3 | null = null;
  private guide: THREE.Group;
  private guideMat: THREE.MeshStandardMaterial;
  private guidePulse = 0;
  private guideVisible = false;
  private barkAt = 0;
  private animalBarkAt = -1e9;
  private choirNear = false;
  private mopTimer = MOP_EVERY;
  private cleanerPhase = 0;
  private t = 0;
  private puddleGeo = new THREE.CircleGeometry(PUDDLE_RADIUS, 24);
  private puddles: { mesh: THREE.Mesh; left: number }[] = [];
  private convo: Convo | null = null;
  private replyActive = false;
  private replyTimer = 0;
  private talkCooldownUntil = 0;
  private usedChoices = new Set<string>();
  /** Story flags earned by talk-back answers (choice `sets` in content/npcs.json). Drives `by_flag` lines. */
  private storyFlags = new Set<string>();
  /** The outcome of the last talk-back pick. It lands when the reply closes. */
  private pendingOutcome: { effect: TalkEffect; npc: Npc } | null = null;
  /** Currently focused NPC figure (covers active convo plus keepFocus riddle state until npc:unfocus). */
  private focused: { npc: Npc; holderIndex: number } | null = null;
  /** Optional world XZ target for the focused NPC to face (e.g. when focus camera dodges a wall). */
  private focusLookTarget: { x: number; z: number } | null = null;
  /** Who has already had their say and is waiting for you to walk away first. */
  private disarmed = new Set<Npc>();
  /** Has this NPC done their full conversation once? After that, they just say one line. */
  private heard = new Set<NpcId>();

  constructor() {
    this.root.userData.painterlyRole = 'character';
    const startCell = level.spawns.main_hall;
    if (startCell) {
      const c = cellCenter(startCell[0], startCell[1]);
      this.player.set(c.x, 0, c.z);
    }
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
    this.root.add(this.djs.root);

    bus.on('player:moved', ({ x, z }) => {
      this.player.set(x, 0, z);
      this.animalBark(x, z);
      if (this.talking && (state.floor !== 0 || this.talking.pos.distanceTo(this.player) > WALK_AWAY)) {
        this.talking = null;
        bus.emit('npc:silent', {});
      }
      this.herdHint();
      this.choir();
      this.bumpInto();
    });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.replyActive) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          e.preventDefault();
          this.closeReply();
        }
        return;
      }
      if (!this.convo) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.nextLine();
      } else if (e.code === 'Escape') {
        this.endConvo(false);
      }
    });
    bus.on('npc:choice-picked', ({ npc, choiceId, index }) => this.handleChoicePicked(npc, choiceId, index));
    bus.on('player:grab', ({ x, z }) => this.talk(new THREE.Vector3(x, 0, z)));
    bus.on('player:stomp', ({ x, z, time }) => this.stomp(x, z, time));
    bus.on('beat', ({ n, time }) => {
      this.beatN = n;
      this.beatPulse = 1;
      this.herd.beat(n, time);
    });
    bus.on('riddle:answered', ({ correct }) => this.riddleAnswered(correct));
    bus.on('npc:unfocus', () => {
      this.flushOutcome();
      clearTimeout(this.replyTimer);
      this.replyTimer = 0;
      this.replyActive = false;
      this.focused = null;
      this.focusLookTarget = null;
      this.talkCooldownUntil = performance.now() + 250;
      unlock('talk');
    });
    const abortConvo = () => {
      this.pendingOutcome = null;
      clearTimeout(this.riddleTimer);
      this.riddleTimer = 0;
      clearTimeout(this.replyTimer);
      this.replyTimer = 0;
      this.replyActive = false;
      if (this.convo) {
        this.endConvo(false);
      } else if (this.focused) {
        this.focused = null;
        this.focusLookTarget = null;
        bus.emit('npc:unfocus', {});
        bus.emit('npc:silent', {});
      }
      unlock('talk');
      unlock('choice');
    };
    bus.on('player:caught', abortConvo);
    bus.on('trip:max', abortConvo);
    bus.on('ending:show', abortConvo);
    bus.on('door:refused', () => bus.emit('npc:talk', { npc: 'bouncer', lineId: 'npcs:bouncer.lines.0' }));
    bus.on('secret:dj', () => {
      if (!booth) return;
      const c = cellCenter(booth[0], booth[1]);
      this.crowdLooksAt = new THREE.Vector3(c.x, 0, c.z);
      this.crowd.turnTo(c.x, c.z);
    });
    bus.on('crowd:cheer', () => {
      this.crowd.cheerNow(2.5);
      this.cheerLeft = Math.max(this.cheerLeft, 2.5);
    });
    bus.on('game:finale', () => {
      this.crowd.cheerNow(3);
      this.cheerLeft = Math.max(this.cheerLeft, 3);
    });

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
  pushPlayer(pos: THREE.Vector3, radius: number, y = 0): void {
    // Named regulars stand on the ground floor. Gallery guests are handled by the crowd.
    if (y < 3) {
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
    }
    if (!this.crowd.push(pos, radius, y)) return;
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
    this.nearCheck -= dt;
    if (this.nearCheck <= 0) {
      this.nearCheck = 0.2;
      this.announceNear();
    }
    this.updateGuide(dt);
    this.checkSelfie();
    this.mop(dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    this.cheerLeft = Math.max(0, this.cheerLeft - dt);
    // While you talk to someone, the crowd gives you room: nobody walks through the conversation camera.
    // Conversations only happen on the ground floor. Clear around the figure the camera actually frames.
    const talk = this.convo ?? this.focused;
    const figure = talk ? (talk.npc.holders[talk.holderIndex]?.position ?? talk.npc.pos) : this.replyActive ? this.talking?.pos : null;
    if (figure) {
      this.crowd.clearRing(figure.x, figure.z, CONVO_CLEAR_RADIUS, 0);
      // Named regulars too (the start crown stands right where the camera goes). Pushed, never hidden.
      const own = talk?.npc ?? (this.replyActive ? this.talking : null);
      for (const other of this.npcs) {
        if (other === own) continue;
        for (const h of other.holders) {
          const dx = h.position.x - figure.x;
          const dz = h.position.z - figure.z;
          const d = Math.hypot(dx, dz);
          if (d >= REGULAR_CLEAR_RADIUS) continue;
          const nx = d > 1e-4 ? dx / d : 1;
          const nz = d > 1e-4 ? dz / d : 0;
          h.position.x = figure.x + nx * REGULAR_CLEAR_RADIUS;
          h.position.z = figure.z + nz * REGULAR_CLEAR_RADIUS;
          this.madeRoom.add(other);
        }
      }
    } else if (this.madeRoom.size) {
      // Conversation over: regulars who never wander (coat check, bouncer...) go straight back to their spot.
      for (const other of this.madeRoom) {
        if ((STYLES[other.id] ?? DEFAULT_STYLE).wander > 0) continue;
        other.holders.forEach((h, i) => h.position.copy(other.homes[i]));
      }
      this.madeRoom.clear();
    }
    this.crowd.update(dt, this.beatPulse, this.beatN);
    this.djs.update(dt, this.beatPulse, this.beatN);
    const bounce = this.beatPulse * this.beatPulse;
    const cheering = this.cheerLeft > 0 || !!this.crowdLooksAt;

    for (const npc of this.npcs) {
      const activeFocus = this.convo?.npc === npc ? this.convo : this.focused?.npc === npc ? this.focused : null;
      const archetype = ARCHETYPES[npc.id] ?? 'techno_pump';

      npc.objects.forEach((o, i) => {
        const h = npc.holders[i];
        const prev = npc.prevPos[i];
        let moveSpeed = 0;

        if (activeFocus && i === activeFocus.holderIndex) {
          this.holdForConvo(npc, i, o, dt, archetype);
          prev.copy(h.position);
        } else if (this.crowdLooksAt) {
          o.lookAt(this.crowdLooksAt.x, o.position.y, this.crowdLooksAt.z);
          o.position.y = bounce * 0.2;
          const rig = bindRig(o);
          if (rig) {
            animateCharacter(rig, {
              dt,
              t: this.t,
              beatN: this.beatN,
              beatPulse: this.beatPulse,
              archetype,
              moveSpeed: 0,
              attentive: false,
              talking: false,
              cheer: true,
              finale: state.finale,
              seed: npc.seeds[i],
            });
          }
          prev.copy(h.position);
        } else if (npc.id === 'herd') {
          // Perfect sync: hop and twist on every beat, all three the same.
          o.position.x = 0;
          o.position.z = 0;
          o.position.y = bounce * 0.25;
          o.rotation.y = Math.PI + Math.sin(this.beatN * Math.PI * 0.5) * 0.6;
          o.rotation.z = 0;
          const rig = bindRig(o);
          if (rig) {
            animateCharacter(rig, {
              dt,
              t: this.t,
              beatN: this.beatN,
              beatPulse: this.beatPulse,
              archetype: 'herd_sync',
              moveSpeed: 0,
              attentive: false,
              talking: false,
              cheer: cheering,
              finale: state.finale,
              seed: 0,
            });
          }
          prev.copy(h.position);
        } else if (npc.id === 'leather_choir') {
          // Heads together, swaying as one, humming the bassline.
          o.position.set(0, 0, 0);
          o.rotation.y = Math.atan2(npc.pos.x - h.position.x, npc.pos.z - h.position.z);
          o.rotation.z = Math.sin(this.t * 1.1) * 0.08;
          const rig = bindRig(o);
          if (rig) {
            animateCharacter(rig, {
              dt,
              t: this.t,
              beatN: this.beatN,
              beatPulse: this.beatPulse,
              archetype: 'choir_trance',
              moveSpeed: 0,
              attentive: false,
              talking: false,
              cheer: false,
              finale: state.finale,
              seed: 0,
            });
          }
          prev.copy(h.position);
        } else {
          moveSpeed = this.danceAndWander(npc, i, o, bounce, dt, archetype, cheering, !!activeFocus);
        }
        // Keep prevPos synced even if moveSpeed was measured inside danceAndWander.
        void moveSpeed;
      });
      // Keep the talk spot on the figures as they move.
      if (npc.id !== 'cleaner' && npc.holders.length) {
        npc.pos.set(0, 0, 0);
        npc.holders.forEach((h) => npc.pos.add(h.position));
        npc.pos.multiplyScalar(1 / npc.holders.length);
      }
    }
  }

  /** Point the focused NPC toward the actual camera spot (used when focus cam dodges a wall). */
  setFocusFacing(x: number, z: number): void {
    this.focusLookTarget = { x, z };
    const f = this.focused;
    if (!f) return;
    const h = f.npc.holders[f.holderIndex] ?? f.npc.holders[0];
    const o = f.npc.objects[f.holderIndex] ?? f.npc.objects[0];
    if (h && o) o.rotation.y = Math.atan2(x - h.position.x, z - h.position.z);
  }

  /** Keep the focused NPC centred, facing the camera (or player), and expressively alive while talking. */
  private holdForConvo(npc: Npc, i: number, o: THREE.Object3D, dt: number, archetype: DanceArchetype): void {
    const h = npc.holders[i];
    const k = 1 - Math.exp(-14 * dt);
    o.position.multiplyScalar(1 - k);
    o.rotation.z *= 1 - k;
    const lookX = this.focusLookTarget?.x ?? this.player.x;
    const lookZ = this.focusLookTarget?.z ?? this.player.z;
    const targetYaw = Math.atan2(lookX - h.position.x, lookZ - h.position.z);
    const diff = Math.atan2(Math.sin(targetYaw - o.rotation.y), Math.cos(targetYaw - o.rotation.y));
    o.rotation.y += diff * (1 - Math.exp(-12 * dt));
    const rig = bindRig(o);
    if (rig) {
      animateCharacter(rig, {
        dt,
        t: this.t,
        beatN: this.beatN,
        beatPulse: this.beatPulse,
        archetype,
        moveSpeed: 0,
        attentive: true,
        talking: true,
        cheer: false,
        finale: false,
        seed: npc.seeds[i],
      });
    }
  }

  /** Regulars dance on the beat and drift around their spot. Walk up to one and they stop and look at you. */
  private danceAndWander(
    npc: Npc,
    i: number,
    o: THREE.Object3D,
    bounce: number,
    dt: number,
    archetype: DanceArchetype,
    cheering: boolean,
    freezeWander = false,
  ): number {
    const style = STYLES[npc.id] ?? DEFAULT_STYLE;
    const h = npc.holders[i];
    const prev = npc.prevPos[i];
    const toPlayer = state.floor === 0 ? Math.hypot(this.player.x - h.position.x, this.player.z - h.position.z) : Infinity;
    const attentive = toPlayer < STOP_FOR_PLAYER;
    let yaw = o.rotation.y;

    if (style.wander > 0 && !attentive && !freezeWander && state.started) {
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

    // Measure actual horizontal movement speed (covers wandering regulars AND the mopping cleaner!).
    const movedX = h.position.x - prev.x;
    const movedZ = h.position.z - prev.z;
    const moveSpeed = dt > 1e-4 ? Math.hypot(movedX, movedZ) / dt : 0;
    prev.copy(h.position);

    // Let the mopping cleaner face its direction of travel when not looking at the player.
    if (npc.id === 'cleaner' && moveSpeed > 0.08 && !attentive) {
      const moveYaw = Math.atan2(movedX, movedZ);
      const diff = Math.atan2(Math.sin(moveYaw - yaw), Math.cos(moveYaw - yaw));
      yaw += diff * (1 - Math.exp(-8 * dt));
    }

    if (attentive) yaw = Math.atan2(this.player.x - h.position.x, this.player.z - h.position.z);

    // Dance translation: damped when walking so locomotion stride stays grounded.
    const danceWeight = Math.max(0, 1 - moveSpeed * 1.4);
    const side = this.beatN % 2 === 0 ? 1 : -1;
    o.position.y = bounce * style.hop * (attentive ? 0.4 : 1) * danceWeight;
    o.position.x = Math.cos(yaw) * side * style.step * (1 - this.beatPulse * 0.5) * danceWeight;
    o.position.z = -Math.sin(yaw) * side * style.step * (1 - this.beatPulse * 0.5) * danceWeight;
    o.rotation.y = yaw + (attentive ? 0 : Math.sin(this.beatN * Math.PI * 0.5 + i) * style.twist * danceWeight);
    o.rotation.z = 0;

    const rig = bindRig(o);
    if (rig) {
      animateCharacter(rig, {
        dt,
        t: this.t,
        beatN: this.beatN,
        beatPulse: this.beatPulse,
        archetype,
        moveSpeed,
        attentive,
        talking: false,
        cheer: cheering,
        finale: state.finale,
        seed: npc.seeds[i],
      });
    }
    return moveSpeed;
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
      // Herd and the tourist pair use a second and third figure. Missing files stay grey boxes.
      const variant = id === 'tourists' ? ['npc_tourists', 'npc_tourists_1'] : id === 'herd' ? ['npc_herd', 'npc_herd_1', 'npc_herd_2'] : null;
      o.add(placeModel(variant?.[i] ?? `npc_${id}`, size, mat));
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
      prevPos: holders.map((h) => h.position.clone()),
      retarget: holders.map(() => Math.random() * 4),
      seeds: holders.map((_, i) => i * 1.73 + col * 0.37 + row * 0.91),
      pos,
      line: 0,
    });
  }

  private closestHolder(npc: Npc, at: THREE.Vector3): number {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < npc.holders.length; i++) {
      const h = npc.holders[i];
      const d = Math.hypot(h.position.x - at.x, h.position.z - at.z);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private talk(at: THREE.Vector3): void {
    if (state.ending || this.convo || this.replyActive || performance.now() < this.talkCooldownUntil) return;
    // Check rare creatures first across ALL floors (the rare Lemur lives on floor 1 / y = 9!).
    if (state.floor !== 0) return;
    let best: Npc | null = null;
    let bestHolder = 0;
    let bestD = TALK_RANGE;
    for (const npc of this.npcs) {
      const idx = this.closestHolder(npc, at);
      const h = npc.holders[idx];
      const dHolder = h ? Math.hypot(h.position.x - at.x, h.position.z - at.z) : npc.pos.distanceTo(at);
      const d = Math.min(dHolder, npc.pos.distanceTo(at) - (npc.id === 'herd' || npc.id === 'leather_choir' ? 1.2 : 0));
      if (d < bestD) {
        best = npc;
        bestHolder = idx;
        bestD = d;
      }
    }
    if (!best) {
      // Rare Unicorn Easter Egg: press Space right next to one of the rare unicorns for a moment of crisp clarity.
      const now = performance.now();
      if (now - this.unicornAt > 25000 && this.crowd.nearUnicorn(at.x, at.z, 0, 2.4)) {
        this.unicornAt = now;
        bus.emit('item:consumed', { item: 'ice_cream' });
        bus.emit('crowd:cheer', {});
        bus.emit('ui:say', { key: 'story:unicorn.blessing', seconds: 4.5 });
      }
      return;
    }
    this.talking = best;
    const npc = best;
    if (FOCUS.has(npc.id)) return this.startConvo(npc, bestHolder);
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
    const near = state.floor === 0 && c.pos.distanceTo(this.player) < CHOIR_RANGE;
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
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.min(0.55, p.left * 0.1);
      if (p.left <= 0) {
        this.root.remove(p.mesh);
        mat.dispose();
      }
    }
    this.puddles = this.puddles.filter((p) => p.left > 0);
    if (!cleaner || !state.started) return;
    // Pause patrol translation and mopping while talking so the cleaner stays in frame.
    if (this.convo?.npc === cleaner || this.focused?.npc === cleaner) return;
    // Shuffle back and forth along the bar.
    this.cleanerPhase += dt * 0.15;
    const h = cleaner.holders[0];
    const homeX = cellCenter(level.npcs.find((n) => n.id === 'cleaner')!.cell[0], 0).x;
    h.position.x = homeX + Math.sin(this.cleanerPhase) * 4;
    cleaner.pos.x = h.position.x;
    this.mopTimer -= dt;
    if (this.mopTimer > 0) return;
    this.mopTimer = MOP_EVERY;
    const seconds = 14;
    const radius = PUDDLE_RADIUS;
    const mesh = new THREE.Mesh(
      this.puddleGeo,
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
    const opacity = Math.min(0.85, solid + this.guidePulse * 0.25) * (1 - forget * 0.9);
    const emissiveIntensity = 0.4 + this.guidePulse;
    this.guide.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (!m.transparent) {
          m.transparent = true;
          m.depthWrite = false;
          m.needsUpdate = true;
        }
        m.opacity = opacity;
        if ('emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
      }
    });
  }

  private checkSelfie(): void {
    if (this.selfieTaken || !state.started || state.ending || state.floor !== 0) return;
    const t = this.npcs.find((n) => n.id === 'tourists');
    if (!t || t.pos.distanceTo(this.player) > SELFIE_RANGE) return;
    this.selfieTaken = true;
    this.talking = t;
    bus.emit('npc:talk', { npc: 'tourists', lineId: 'npcs:tourists.lines.0' });
    bus.emit('selfie:flash', { x: t.pos.x, z: t.pos.z });
    setTimeout(() => bus.emit('ui:say', { key: 'story:selfie_after', seconds: 3 }), 3500);
  }

  // ---------- Conversations: forced, face to face, like an old RPG ----------

  /** Stumble into an auto-talk NPC and they pull you into a conversation. Everyone else waits for Space. */
  private bumpInto(): void {
    if (state.floor !== 0) return;
    for (const npc of this.npcs) {
      if (!AUTO_TALK.has(npc.id)) continue;
      const holderIndex = this.closestHolder(npc, this.player);
      const h = npc.holders[holderIndex];
      const d = h ? Math.hypot(h.position.x - this.player.x, h.position.z - this.player.z) : npc.pos.distanceTo(this.player);
      if (d > REARM_RANGE && npc.pos.distanceTo(this.player) > REARM_RANGE) this.disarmed.delete(npc);
      const range = npc.id === 'leather_choir' ? 1.5 : BUMP_RANGE;
      if (d < range && !this.disarmed.has(npc) && !this.convo && state.started && !state.ending && !state.inputLocked) {
        this.startConvo(npc, holderIndex);
        return;
      }
    }
  }

  private startConvo(npc: Npc, holderIndex = this.closestHolder(npc, this.player)): void {
    if (this.convo || this.replyActive || state.ending) return;
    clearTimeout(this.riddleTimer);
    this.riddleTimer = 0;
    clearTimeout(this.replyTimer);
    this.replyTimer = 0;
    const { keys, after, keepFocus, immediateChoices } = this.script(npc);
    if (!keys.length) return;
    this.convo = { npc, holderIndex, keys, i: 0, after, keepFocus, immediateChoices };
    this.focused = { npc, holderIndex };
    this.disarmed.add(npc);
    this.talking = npc;
    lock('talk');
    const h = npc.holders[holderIndex] ?? npc.holders[0];
    const o = npc.objects[holderIndex] ?? npc.objects[0];
    // Zero dance offset and turn the figure to face the player immediately so the camera frames them cleanly.
    if (o && h) {
      o.position.set(0, 0, 0);
      o.rotation.z = 0;
      o.rotation.y = Math.atan2(this.player.x - h.position.x, this.player.z - h.position.z);
    }
    // Eye height, so their eyes sit right in the middle of the frame.
    const face = (SIZES[npc.id]?.y ?? (HORSES.has(npc.id) ? 2.2 : 1.8)) - 0.32;
    bus.emit('npc:focus', { npc: npc.id, x: h.position.x, y: face, z: h.position.z });
    this.sayLine();
    if (immediateChoices) this.endConvo(true);
  }

  /** What an NPC says, given where you are in the story. Some of it is true. Some of it isn't. */
  private script(npc: Npc): { keys: string[]; after?: () => void; keepFocus?: boolean; immediateChoices?: boolean } {
    const talk = (npcText[npc.id]?.talk as string[] | undefined) ?? [];
    const full = talk.map((_, i) => `talk.${i}`);
    const once = (keys: string[]) => {
      const first = !this.heard.has(npc.id);
      this.heard.add(npc.id);
      return first ? keys : keys.slice(-1);
    };
    if (TALK_BACK_NPCS.has(npc.id)) {
      const choices = (npcText[npc.id]?.choices as TalkChoiceEntry[] | undefined) ?? [];
      if (choices.length) {
        const first = !this.heard.has(npc.id);
        this.heard.add(npc.id);
        // Story flags beat fragment tiers: if the player holds a flag this NPC has `by_flag` lines for, those win.
        const flagged = this.flagLines(npc.id);
        const tier = flagged.length ? flagged : this.fragmentTier(npc.id);
        const base = full.length ? (first ? full : [full[full.length - 1]]) : ['lines.0'];
        // Repeat visits swap the last intro line for the fragment-tier lines, if the NPC has them.
        const keys = tier.length ? (first ? [...base, ...tier] : tier) : base;
        return {
          keys,
          keepFocus: true,
          immediateChoices: !first,
          after: () => this.openChoices(npc),
        };
      }
    }
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
      default: {
        // Optional `by_flag` in content: lines keyed by story flags the player holds. First matching flag wins.
        // Optional `by_fragments` in content: lines keyed by the fewest fragments needed. Repeat visits get only these.
        const flagged = this.flagLines(npc.id);
        const tier = flagged.length ? flagged : this.fragmentTier(npc.id);
        if (tier.length) {
          const first = !this.heard.has(npc.id);
          this.heard.add(npc.id);
          return { keys: first ? [...full, ...tier] : tier };
        }
        return { keys: once(full.length ? full : ['lines.0']) };
      }
    }
  }

  private openChoices(npc: Npc): void {
    if (state.ending) {
      this.focused = null;
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
      return;
    }
    const raw = (npcText[npc.id]?.choices as TalkChoiceEntry[] | undefined) ?? [];
    if (!raw.length) {
      this.focused = null;
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
      return;
    }
    const choices = raw.map((c, i) => ({
      id: c.id,
      textKey: `npcs:${npc.id}.choices.${i}.text` as TextKey,
      used: this.usedChoices.has(`${npc.id}:${c.id}`),
    }));
    bus.emit('npc:choices', { npc: npc.id, choices });
  }

  private handleChoicePicked(npcId: NpcId, choiceId: string, index: number): void {
    if (state.ending) return;
    const npc = this.npcs.find((n) => n.id === npcId);
    const raw = (npcText[npcId]?.choices as TalkChoiceEntry[] | undefined) ?? [];
    const choice = raw[index];
    if (!npc || !choice) {
      this.focused = null;
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
      return;
    }

    const actionKey = `${npcId}:${choiceId}`;
    const alreadyUsed = this.usedChoices.has(actionKey);
    let lineId: TextKey = `npcs:${npcId}.choices.${index}.${alreadyUsed && choice.reply_used ? 'reply_used' : 'reply'}`;

    if (npcId === 'drag_oracle' && choiceId === 'next') {
      const step = this.nextStep();
      lineId = `npcs:drag_oracle.choices.0.next_${step}`;
    }
    if (choice.effect && !alreadyUsed) {
      this.usedChoices.add(actionKey);
      if (choice.sets) this.storyFlags.add(choice.sets);
      const roll = choice.chance === undefined || Math.random() < choice.chance;
      const effect = roll ? choice.effect : choice.otherwise;
      if (effect) this.pendingOutcome = { effect: effect === 'chaos' ? CHAOS[Math.floor(Math.random() * CHAOS.length)] : effect, npc };
    }

    this.talking = npc;
    this.replyActive = true;
    lock('talk');
    bus.emit('npc:talk', { npc: npcId, lineId });
    clearTimeout(this.replyTimer);
    this.replyTimer = window.setTimeout(() => this.closeReply(), 3800);
  }

  private nextStep(): NextStep {
    return ([1, 2, 3, 4, 5] as const).find((id) => !state.fragments.includes(id)) ?? 'done';
  }

  /** Apply the outcome of the last talk-back pick, once, and tell the player what happened. */
  private flushOutcome(): void {
    const o = this.pendingOutcome;
    this.pendingOutcome = null;
    if (!o || state.ending) return;
    const step = this.nextStep();
    const say = (key: TextKey, seconds = 3.5) => bus.emit('ui:say', { key, seconds });
    switch (o.effect) {
      case 'sober':
        state.trip = Math.max(0, state.trip - 12);
        bus.emit('trip:changed', { trip: state.trip });
        return say('story:talk_outcomes.sober');
      case 'trip_up':
        // Never straight to a blackout: a bad tip should hurt, not end the run.
        if (state.trip < 90) state.trip = Math.min(90, state.trip + 12);
        bus.emit('trip:changed', { trip: state.trip });
        return say('story:talk_outcomes.trip_up');
      case 'mate':
        bus.emit('item:spawn', { item: 'mate', x: o.npc.pos.x + 1.2, z: o.npc.pos.z + 1.0 });
        return say('story:talk_outcomes.mate');
      case 'brain_freeze':
        bus.emit('item:consumed', { item: 'ice_cream' });
        return say('story:talk_outcomes.brain_freeze');
      case 'cheer':
        bus.emit('crowd:cheer', {});
        return say('story:talk_outcomes.cheer');
      case 'hint':
        return say(`story:talk_hints.${step}`, 5);
      case 'lie':
        return say(`story:talk_lies.${step}`, 5);
      case 'snitch':
        bus.emit('selfie:flash', { x: this.player.x, z: this.player.z });
        return say('story:talk_outcomes.snitch');
      case 'shortcut':
        bus.emit('player:respawn', { zone: STEP_ZONE[step] });
        return say('story:talk_outcomes.shortcut');
      case 'wrong_way': {
        const right = STEP_ZONE[step];
        const options = ALL_ZONES.filter((z) => z !== right && z !== state.zone && z !== 'back_exit');
        bus.emit('player:respawn', { zone: options[Math.floor(Math.random() * options.length)] ?? 'toilet_corridor' });
        return say('story:talk_outcomes.wrong_way');
      }
      case 'chaos':
        return say('story:talk_outcomes.nothing');
    }
  }

  private closeReply(): void {
    this.flushOutcome();
    if (!this.replyActive && !this.replyTimer) return;
    clearTimeout(this.replyTimer);
    this.replyTimer = 0;
    this.replyActive = false;
    this.focused = null;
    this.focusLookTarget = null;
    this.talkCooldownUntil = performance.now() + 250;
    unlock('talk');
    bus.emit('npc:unfocus', {});
    bus.emit('npc:silent', {});
  }

  /** Tell the bus when a talkable NPC or a unicorn comes into or leaves range. Only sends on change. */
  private announceNear(): void {
    const p = this.player;
    let near = false;
    let talk = false;
    if (state.started && state.floor === 0 && !state.ending && !this.convo) {
      for (const npc of this.npcs) {
        const h = npc.holders[this.closestHolder(npc, p)];
        const dHolder = h ? Math.hypot(h.position.x - p.x, h.position.z - p.z) : npc.pos.distanceTo(p);
        const d = Math.min(dHolder, npc.pos.distanceTo(p) - (npc.id === 'herd' || npc.id === 'leather_choir' ? 1.2 : 0));
        if (d < TALK_RANGE) {
          near = true;
          if (!AUTO_TALK.has(npc.id)) talk = true;
        }
      }
      if (!talk && this.crowd.nearUnicorn(p.x, p.z, 0, TALK_RANGE)) {
        near = true;
        talk = true;
      }
    }
    if (near !== this.wasNear || talk !== this.wasTalk) {
      this.wasNear = near;
      this.wasTalk = talk;
      bus.emit('player:near', { by: 'npc', near, kind: talk ? 'talk' : undefined });
    }
    const uni = state.started && state.floor === 0 && this.crowd.nearUnicorn(p.x, p.z, 0, UNICORN_HEAR_RANGE);
    if (uni !== this.wasNearUnicorn) {
      this.wasNearUnicorn = uni;
      bus.emit('unicorn:near', { near: uni });
    }
  }

  /** Keys for the highest `by_fragments` tier the player has reached, or none. */
  private fragmentTier(id: NpcId): string[] {
    const tiers = npcText[id]?.by_fragments as Record<string, string[]> | undefined;
    if (!tiers) return [];
    const have = state.fragments.length;
    const min = Object.keys(tiers).map(Number).filter((n) => n <= have).sort((a, b) => b - a)[0];
    if (min === undefined) return [];
    return tiers[String(min)].map((_, i) => `by_fragments.${min}.${i}`);
  }

  /** Keys for the first `by_flag` entry whose story flag the player holds, or none. First matching flag in object order wins. */
  private flagLines(id: NpcId): string[] {
    const byFlag = npcText[id]?.by_flag as Record<string, string[]> | undefined;
    if (!byFlag) return [];
    for (const flag of Object.keys(byFlag)) {
      if (!this.storyFlags.has(flag)) continue;
      return byFlag[flag].map((_, i) => `by_flag.${flag}.${i}`);
    }
    return [];
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
    clearTimeout(this.riddleTimer);
    this.riddleTimer = 0;
    const c = this.convo;
    if (!c) return;
    this.convo = null;
    unlock('talk');
    if (finished && c.keepFocus) return c.after?.();
    this.focused = null;
    bus.emit('npc:unfocus', {});
    bus.emit('npc:silent', {});
    if (finished) c.after?.();
  }

  private riddleAnswered(correct: boolean): void {
    const horse = this.npcs.find((n) => n.id === 'riddle_horse');
    if (!horse) return;
    this.talking = horse;
    bus.emit('npc:talk', { npc: 'riddle_horse', lineId: `npcs:riddle_horse.riddle.${correct ? 'right' : 'wrong'}` });
    // Let his answer land in your face, then let go.
    clearTimeout(this.riddleTimer);
    this.riddleTimer = window.setTimeout(() => {
      this.riddleTimer = 0;
      if (this.convo) return;
      this.focused = null;
      bus.emit('npc:unfocus', {});
      bus.emit('npc:silent', {});
    }, 3000);
    if (correct) {
      this.riddleSolved = true;
      bus.emit('fragment:claim', { id: 5 });
    } else if (!this.riddleMateSpawned) {
      // The long way, with a bonus Mate on the floor next to him.
      this.riddleMateSpawned = true;
      bus.emit('item:spawn', { item: 'mate', x: horse.pos.x - 1.6, z: horse.pos.z - 1 });
    }
  }

  private inHerdLine(x: number, z: number): boolean {
    if (state.floor !== 0) return false;
    const herd = this.npcs.find((n) => n.id === 'herd');
    return !!herd && Math.abs(z - herd.pos.z) < 1.8 && Math.abs(x - herd.pos.x) < 6;
  }

  /** An animal guest nearby says something crazy, at most every 7 s. */
  private animalBark(x: number, z: number): void {
    if (!state.started || state.ending || this.convo) return;
    const now = performance.now();
    if (now - this.animalBarkAt < 7000) return;
    if (this.crowd.animalNear(x, z, 3) === 0) return;
    this.animalBarkAt = now;
    bus.emit('ui:say', { key: `story:animals.lines.${Math.floor(Math.random() * 6)}`, seconds: 3 });
  }

  private herdHint(): void {
    if (this.herdSynced || state.floor !== 0 || !this.inHerdLine(this.player.x, this.player.z)) return;
    const now = performance.now();
    if (now - this.herdHintAt < 20000) return;
    this.herdHintAt = now;
    bus.emit('ui:say', { key: 'story:herd.hint', seconds: 4 });
  }

  private stomp(x: number, z: number, time: number): void {
    if (this.herdSynced || state.floor !== 0 || !this.inHerdLine(x, z)) return;
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
