// Escape Berghain: shared contracts.
// Owned by Dee. Agents: read this, never edit it. Ask in your issue if it needs to change.

export type FragmentId = 1 | 2 | 3 | 4 | 5;

export type EndingId = 'full_memory' | 'partial_memory' | 'secret_dj';

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
  | 'bouncer';

/** Things you can pick up or consume that aren't fragments. */
export type ItemId = 'mate' | 'ice_cream';

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
  /** Konami rat mode. */
  rat: boolean;
  /** A dialogue or riddle is open. The horse stands still. */
  inputLocked: boolean;
  ending: EndingId | null;
}

export const TRIP_MAX = 100;

/** The one beat clock. Music, strobes, the herd and the DJ booth all use it. */
export const BPM = 132;
export const BEAT_SECONDS = 60 / BPM;

/** Level grid cell size in metres. */
export const CELL = 4;

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
    rat: false,
    inputLocked: false,
    ending: null,
  };
}

/** Every event in the game. Systems talk only through these. */
export interface GameEvents {
  'game:start': Record<string, never>;

  'fragment:found': { id: FragmentId };
  'trip:changed': { trip: number };
  'trip:max': Record<string, never>;
  'player:caught': { by: 'security' | 'animal_control' };
  'riddle:show': Record<string, never>;
  'riddle:answered': { correct: boolean };
  'npc:talk': { npc: NpcId; lineId: TextKey };
  'npc:silent': Record<string, never>;
  'herd:synced': Record<string, never>;
  'item:consumed': { item: ItemId };
  'item:slipped': Record<string, never>;
  'item:spawn': { item: ItemId; x: number; z: number };
  'exit:reached': Record<string, never>;
  'ending:show': { ending: EndingId };
  'secret:dj': Record<string, never>;
  'mirror:seen': Record<string, never>;
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
  'player:rat': { active: boolean };

  /** One quarter note on the beat clock. `time` is performance.now() in ms when it lands. */
  beat: { n: number; time: number };

  /** Show a line of text from content/. */
  'ui:say': { key: TextKey; seconds?: number };
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
