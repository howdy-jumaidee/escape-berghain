// Follow your ears: a faint shimmering ping near an uncollected memory, and a crystal shimmer when a unicorn
// passes. Synthesised in the music's AudioContext, quantised to the 132 BPM clock so it sits in the groove.
import { state, BEAT_SECONDS, type FragmentId } from '../contracts';

/** Pings start at this distance, in metres. */
const RANGE = 12;
const NEAR = 1.5;
/** Seconds between pings at RANGE and at NEAR. */
const SLOW = 2.4;
const FAST = 0.7;
const VOL_FAR = 0.018;
const VOL_NEAR = 0.06;
/** Pings land on the 8th note grid. */
const GRID = BEAT_SECONDS / 2;
const TICK_MS = 50;
/** Schedule a ping once it is this close, seconds. */
const AHEAD = 0.1;
const UNICORN_GAP = 8;

/** F minor, up high: the ping, and the unicorn's arpeggio. */
const PING_F = 1396.9; // F6
const UNICORN = [1396.9, 1661.2, 2093, 2793.8, 3322.4]; // F6 Ab6 C7 F7 Ab7

export class Cues {
  // Fragment spots by id (1..5). Flat arrays: no allocation per frame.
  private readonly has = [false, false, false, false, false, false];
  private readonly sx = [0, 0, 0, 0, 0, 0];
  private readonly sz = [0, 0, 0, 0, 0, 0];
  private readonly sf = [0, 0, 0, 0, 0, 0];
  private px = 0;
  private pz = 0;
  private moved = false;

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private verb: GainNode | null = null;
  /** Audio time of the latest beat the sequencer scheduled. */
  private beatAt = 0;
  private lastPing = 0;
  private lastUnicorn = -Infinity;

  spot(id: FragmentId, x: number, z: number, floor: number): void {
    if (state.fragments.includes(id)) return;
    this.has[id] = true;
    this.sx[id] = x;
    this.sz[id] = z;
    this.sf[id] = floor;
  }

  found(id: FragmentId): void {
    this.has[id] = false;
  }

  player(x: number, z: number): void {
    this.px = x;
    this.pz = z;
    this.moved = true;
  }

  beat(audioTime: number): void {
    this.beatAt = audioTime;
  }

  /** Hook into the music's graph. Call once, after the Techno exists. */
  attach(ctx: AudioContext, dry: AudioNode, verb: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dry);
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.7;
    this.verb.connect(verb);
    window.setInterval(() => this.tick(), TICK_MS);
  }

  /** One crystal shimmer when a unicorn comes close. At most once every 8 seconds. */
  unicorn(): void {
    const ctx = this.ctx;
    if (!ctx || !this.live()) return;
    const t = ctx.currentTime;
    if (t - this.lastUnicorn < UNICORN_GAP) return;
    this.lastUnicorn = t;
    for (let i = 0; i < UNICORN.length; i++) {
      const at = t + 0.02 + i * 0.055;
      this.bell(at, UNICORN[i], 0.035 - i * 0.004, 0.9 - i * 0.08);
    }
  }

  private live(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && state.started && !state.ending;
  }

  private nearest(): number {
    let best = Infinity;
    for (let id = 1; id <= 5; id++) {
      if (!this.has[id] || this.sf[id] !== state.floor) continue;
      const dx = this.sx[id] - this.px;
      const dz = this.sz[id] - this.pz;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.moved || !this.live()) {
      this.lastPing = 0;
      return;
    }
    const d = this.nearest();
    if (d > RANGE) {
      this.lastPing = 0;
      return;
    }
    // 0 at the edge of range, 1 right on top of it.
    const k = Math.min(1, Math.max(0, (RANGE - d) / (RANGE - NEAR)));
    const now = ctx.currentTime;
    const due = this.lastPing ? this.lastPing + SLOW + (FAST - SLOW) * k : now;
    const at = this.quantise(Math.max(due, now + 0.03));
    if (at - now > AHEAD) return;
    this.lastPing = at;
    this.ping(at, VOL_FAR + (VOL_NEAR - VOL_FAR) * k * k);
  }

  /** The next 8th note on or after t, from the sequencer's beat clock. */
  private quantise(t: number): number {
    if (!this.beatAt) return t;
    return this.beatAt + Math.ceil((t - this.beatAt) / GRID - 1e-6) * GRID;
  }

  /** A soft glassy ping: two sines a few Hz apart shimmer against each other, plus a faint octave. */
  private ping(t: number, vol: number): void {
    this.bell(t, PING_F, vol, 0.7);
    this.partial(t, PING_F * 1.003, vol * 0.7, 0.6);
    this.partial(t, PING_F * 2, vol * 0.25, 0.35);
  }

  /** A short bell: a sine with a quiet inharmonic overtone. */
  private bell(t: number, f: number, vol: number, len: number): void {
    this.partial(t, f, vol, len);
    this.partial(t, f * 2.76, vol * 0.18, len * 0.4);
  }

  private partial(t: number, f: number, vol: number, len: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.verb) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    g.connect(this.out);
    g.connect(this.verb);
    o.start(t);
    o.stop(t + len + 0.02);
  }
}
