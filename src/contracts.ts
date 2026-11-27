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

/** Model file names in public/models/, without .glb. Missing models fall back to a grey box. */
export type ModelName = string;

export interface GameState {
  /** 0 = sober, 100 = pass out. Rises over time. */
  trip: number;
  fragments: FragmentId[];
  checkpoint: ZoneId;
  clubMateActive: boolean;
  brainFreezeActive: boolean;
  ending: EndingId | null;
}

export const TRIP_MAX = 100;

export function createInitialState(): GameState {
  return {
    trip: 10,
    fragments: [],
    checkpoint: 'main_hall',
    clubMateActive: false,
    brainFreezeActive: false,
    ending: null,
  };
}

/** Every event in the game. Systems talk only through these. */
export interface GameEvents {
  'fragment:found': { id: FragmentId };
  'trip:changed': { trip: number };
  'trip:max': Record<string, never>;
  'player:caught': { by: 'security' | 'animal_control' };
  'riddle:answered': { correct: boolean };
  'npc:talk': { npc: NpcId; lineId: string };
  'herd:synced': Record<string, never>;
  'item:consumed': { item: 'mate' | 'ice_cream' };
  'exit:reached': Record<string, never>;
  'ending:show': { ending: EndingId };
  'secret:dj': Record<string, never>;
  'mirror:seen': Record<string, never>;
  'checkpoint:set': { zone: ZoneId };
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
    list?.forEach((h) => h(payload));
  }
}

export const bus = new EventBus();
export const state: GameState = createInitialState();
