// Typed access to the level and content files, and the ?debug URL flags. Owned by Dee (Opus only), like contracts.ts.
// Systems import data from here instead of casting the raw JSON themselves.
import type { FragmentId, NpcId, ZoneId } from './contracts';
import levelJson from '../levels/level1.json';
import storyJson from '../content/story.json';
import npcsJson from '../content/npcs.json';

export type Cell = [number, number];

export interface LevelData {
  cellSize: number;
  legend: Record<string, string>;
  zones: Record<ZoneId, [Cell, Cell]>;
  spawns: Record<ZoneId, Cell>;
  npcs: { id: NpcId; cell: Cell }[];
  markers: Record<string, Cell>;
  patrols: Cell[][];
  /** Dancers per cell, by zone. Missing zones get no crowd. */
  crowd?: Partial<Record<ZoneId, number>>;
  grid: string[];
}

export const level = levelJson as unknown as LevelData;
export const story = storyJson;
export const npcText = npcsJson as unknown as Record<string, { name?: string; lines?: string[]; barks?: string[] } & Record<string, unknown>>;

/**
 * URL flags for playtesting. Example: /?debug&skip&frag=1,2,3&time=600
 * debug   puts window.eb = { state, bus } on the page
 * skip    skips the title and intro
 * frag    starts with these fragments
 * time    starts this many seconds into the night (shutters open at 600)
 * trip    starting trip, 0 to 100
 */
const q = new URLSearchParams(location.search);
export const debug = {
  on: q.has('debug'),
  skip: q.has('skip'),
  fragments: (q.get('frag') ?? '')
    .split(',')
    .map(Number)
    .filter((n): n is FragmentId => n >= 1 && n <= 5),
  time: Number(q.get('time') ?? 0) || 0,
  trip: q.has('trip') ? Number(q.get('trip')) : null,
};
