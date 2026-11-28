// Escape Berghain: shared contracts.
// Owned by Dee. Agents: read this, never edit it. Ask in your issue if it needs to change.

export type FragmentId = 1 | 2 | 3 | 4 | 5;

export type EndingId = 'full_memory' | 'partial_memory' | 'secret_dj' | 'herd';

export type ZoneId = 'main_hall' | 'bar_cloakroom' | 'toilet_corridor' | 'panorama_bar' | 'back_exit';

export type NpcId =
  | 'spirit_guide'
  | 'riddle_horse'
  | 'patrick'
  | 'herd'
  | 'ice_cream_horse'
  | 'friday_guy'
  | 'coat_check'
  | 'philosopher'
  | 'tourists'
  | 'security'
  | 'animal_control'
  | 'bouncer'
  | 'leather_choir'
  | 'cleaner'
  | 'leather_daddy'
  | 'bartender_bear'
  | 'drag_oracle'
  | 'rubber_knight'
  | 'old_raver'
  | 'glitter_boy'
  | 'darkroom_keeper'
  | 'lighting_tech'
  | 'calm_horse'  | 'toilet_junkie'
  | 'toilet_dealer'
  | 'pup'
;

/** Things you can pick up or consume that aren't fragments. */
export type ItemId = 'mate' | 'ice_cream' | 'bag';

/** Model file names in public/models/, without .glb. Missing models fall back to a grey box. */
export type ModelName = string;

/**
 * A key into content/*.json, written as `file:path.to.value`.
 * Example: `story:spirit_guide.fragment_1` or `npcs:patrick.lines.0`.
 * Systems never send raw text, only these keys. The UI turns them into words.
 */
export type TextKey = string;

export interface GameState {
  /** True after the player clicks in. Nothing ticks before that. */
  started: boolean;
  /** 0 = sober, 100 = pass out. Rises over time. */
  trip: number;
  fragments: FragmentId[];
  checkpoint: ZoneId;
  zone: ZoneId;
  clubMateActive: boolean;
  brainFreezeActive: boolean;
  /** True while any lock is held (dialogue, riddle, jacket). The horse stands still. Use lock() and unlock(). */
  inputLocked: boolean;
  /** Who holds the input right now. */
  locks: string[];
  /** Which floor you're on. 0 is the main hall level. */
  floor: number;
  /** How many times you've passed out. Three and you join the herd. */
  passOuts: number;
  /** Closing time: all five memories found, the run for the exit. */
  finale: boolean;
  /** performance.now() timestamp until which the horse is "hooved" (harder to navigate). */
  hoovedUntil: number;
  ending: EndingId | null;
}

export const TRIP_MAX = 100;

/** The one beat clock. Music, strobes, the herd and the DJ booth all use it. */
export const BPM = 132;
export const BEAT_SECONDS = 60 / BPM;

/** Level grid cell size in metres. Big, like the real hall. */
export const CELL = 6;
/** Height of one floor in metres. Floor n stands at y = n * FLOOR_HEIGHT. */
/** The main hall ceiling. The real one is about 18 m. */
export const CEILING = 19;
export const FLOOR_HEIGHT = 9;

/** World position (metres) of the centre of grid cell [col, row]. Row grows towards +z. */
export function cellCenter(col: number, row: number): { x: number; z: number } {
  return { x: col * CELL + CELL / 2, z: row * CELL + CELL / 2 };
}

export function createInitialState(): GameState {
  return {
    started: false,
    trip: 10,
    fragments: [],
    checkpoint: 'main_hall',
    zone: 'main_hall',
    clubMateActive: false,
    brainFreezeActive: false,
    inputLocked: false,
    locks: [],
    floor: 0,
    passOuts: 0,
    finale: false,
    ending: null,
    hoovedUntil: 0,
  };
}

export const PASS_OUTS_TO_HERD = 3;

/** Hold the input (the horse stops). Each holder uses its own name, so one can't release another's lock. */
export function lock(name: string): void {
  if (!state.locks.includes(name)) state.locks.push(name);
  state.inputLocked = true;
}

export function unlock(name: string): void {
  state.locks = state.locks.filter((l) => l !== name);
  state.inputLocked = state.locks.length > 0;
}

/**
 * Counts stomps that land on the beat clock, in a row. Used by the herd and the DJ booth.
 * Feed it every `beat` event and every stomp; it returns how many in a row so far, or 0 after a miss.
 */
export class BeatCounter {
  private beatN = 0;
  private beatTime = 0;
  private lastN = -10;
  count = 0;
  constructor(private windowMs = 150) {}

  beat(n: number, time: number): void {
    this.beatN = n;
    this.beatTime = time;
  }

  /** Returns the streak after this stomp. 0 means it missed (or the clock hasn't started). */
  stomp(time: number): number {
    if (!this.beatTime) return 0;
    const period = BEAT_SECONDS * 1000;
    const since = time - this.beatTime;
    const nearest = since < period / 2 ? this.beatN : this.beatN + 1;
    const err = Math.min(Math.abs(since), Math.abs(period - since));
    if (err > this.windowMs) {
      this.count = 0;
      return 0;
    }
    if (nearest === this.lastN) return this.count;
    this.count = nearest === this.lastN + 1 ? this.count + 1 : 1;
    this.lastN = nearest;
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.lastN = -10;
  }
}

/** Every event in the game. Systems talk only through these. */
export interface GameEvents {
  'game:start': Record<string, never>;

  /** Ask for a fragment. Only the game system adds fragments; it answers with fragment:found. */
  'fragment:claim': { id: FragmentId };
  'fragment:found': { id: FragmentId };
  'trip:changed': { trip: number };
  'trip:max': Record<string, never>;
  'player:caught': { by: 'security' | 'animal_control' };
  'riddle:show': Record<string, never>;
  'riddle:answered': { correct: boolean };
  'npc:talk': { npc: NpcId; lineId: TextKey };
  'npc:silent': Record<string, never>;
  /** A conversation starts: the camera goes to your eyes and looks at the NPC's face at (x, y, z). */
  'npc:focus': { npc: NpcId; x: number; y: number; z: number };
  /** The conversation is over. */
  'npc:unfocus': Record<string, never>;
  'herd:synced': Record<string, never>;
  'item:consumed': { item: ItemId };
  'item:slipped': Record<string, never>;
  'item:spawn': { item: ItemId; x: number; z: number };
  'exit:reached': Record<string, never>;
  'ending:show': { ending: EndingId };
  'secret:dj': Record<string, never>;
  'checkpoint:set': { zone: ZoneId };
  'zone:entered': { zone: ZoneId };

  /** Player position, every frame. */
  'player:moved': { x: number; z: number };
  /** Space: grab, talk, use. Whoever is close enough answers. */
  'player:grab': { x: number; z: number };
  /** E: stomp. Used for the herd and the DJ booth. */
  'player:stomp': { x: number; z: number; time: number };
  /** One hoof hit the floor. */
  'player:step': Record<string, never>;
  /** Ask the world to put the player back in a zone. The world answers with player:teleport. */
  'player:respawn': { zone: ZoneId };
  'player:teleport': { x: number; z: number };
  /** You changed floor (stairs, respawn). The world sets state.floor first, then emits this. */
  'player:floor': { floor: number };

  /** One quarter note on the beat clock. `time` is performance.now() in ms when it lands. */
  beat: { n: number; time: number };

  /** Show a line of text from content/. */
  'ui:say': { key: TextKey; seconds?: number };

  /** The intro horse hits the dance floor. Music opens up, the game begins. */
  'intro:land': Record<string, never>;
  /** Q: look down at yourself. With glasses on you can read the wrist stamp. */
  'player:look': Record<string, never>;
  /** The tourists' camera flash. Security comes to look. */
  'selfie:flash': { x: number; z: number };
  /** How close security is to catching you, 0 to 1. 0 when nobody sees you. */
  'player:seen': { amount: number };
  /** The bouncer turns you around at the front door. */
  'door:refused': Record<string, never>;
  /** Morning: Panorama Bar shutters open. */
  'shutters:open': Record<string, never>;

  /** Closing time. All five memories: the run for the exit. */
  'game:finale': Record<string, never>;
  /** The cleaner mopped here. The horse slides. */
  'floor:wet': { x: number; z: number; radius: number; seconds: number };
  /** Standing with the leather choir: the music opens up. */
  'music:choir': { near: boolean };
  /** The crowd cheers (a drop, the secret DJ, closing time). */
  'crowd:cheer': Record<string, never>;
  /** You bumped into a dancer. */
  'crowd:bump': Record<string, never>;

  /** Where an uncollected fragment pickup lies. The world sends it on game:start and whenever one moves (the glasses slip). */
  'fragment:spot': { id: FragmentId; x: number; z: number; floor: number };
  /** A rare unicorn came within ~6 m of the player (near: true) or left that range (near: false). Sent by npc on change. */
  'unicorn:near': { near: boolean };
  /** Something you can Space is in range (near: true) or no longer is. `by` says which system, so two sources don't fight. */
  'player:near': { by: 'npc' | 'world'; near: boolean };
  /** An NPC offers talk-back choices. The UI shows them as 1/2/3 and answers with npc:choice-picked. */
  'npc:choices': { npc: NpcId; choices: { id: string; textKey: TextKey; used?: boolean }[] };
  /** The player picked a talk-back choice. */
  'npc:choice-picked': { npc: NpcId; choiceId: string; index: number };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers: { [K in keyof GameEvents]?: Handler<GameEvents[K]>[] } = {};

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    const list = (this.handlers[event] ??= []) as Handler<GameEvents[K]>[];
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const list = this.handlers[event] as Handler<GameEvents[K]>[] | undefined;
    list?.slice().forEach((h) => h(payload));
  }
}

export const bus = new EventBus();
export const state: GameState = createInitialState();
