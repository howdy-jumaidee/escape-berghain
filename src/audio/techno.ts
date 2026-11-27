// Generated Berghain techno. Everything is synthesised live with the Web Audio API: no samples, no tracks to license.
// Dark, hard, driving, 132 BPM. Kick with a long rumble tail, rolling off beat bass, off beat hats,
// clap on 2 and 4, a dark dub stab, a drone, and an acid line that creeps in as the trip rises.
import { BPM } from '../contracts';

const STEP = 60 / BPM / 4; // one 16th note, seconds
const LOOKAHEAD = 0.12;
const BARS = 32;

/** Notes in Hz. The track sits in F minor. */
const F1 = 43.65;
const F2 = 87.31;
const AB2 = 103.83;
const C3 = 130.81;
const EB3 = 155.56;
const BASS_NOTES = [F1, F1, F1, F1, F1, F1, F1 * 1.189, F1]; // mostly root, one Ab drop per 2 bars
const ACID = [F2, F2, F2 * 2, F2, AB2, F2, F2 * 2, EB3, F2, F2, C3, F2, F2 * 2, F2, AB2, F2 * 1.5];
const ACID_ACCENT = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];

export interface Mix {
  /** Lowpass cutoff on the music, Hz. Low = through a wall. */
  cutoff: number;
  volume: number;
  /** Panorama Bar: warmer, brighter, a pad. */
  warm: number;
}

export class Techno {
  readonly ctx: AudioContext;
  private music: GainNode;
  private sfx: GainNode;
  private master: GainNode;
  private wall: BiquadFilterNode;
  private tripFilter: BiquadFilterNode;
  private tripLfoGain: GainNode;
  private reverb: GainNode;
  private rumble: GainNode;
  private duck: GainNode;
  private delay: GainNode;
  private padGain: GainNode;
  private noise: AudioBuffer;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private warm = 0;
  private trip = 0;
  private sharp = false;
  /** Called for each quarter note with the audio time it lands on. */
  onBeat: (n: number, audioTime: number) => void = () => {};

  constructor() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }));

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master = gain(ctx, 0.9);
    this.master.connect(comp).connect(ctx.destination);

    // Music goes through the trip filter, then the wall (zone) filter.
    this.music = gain(ctx, 1);
    this.tripFilter = ctx.createBiquadFilter();
    this.tripFilter.type = 'lowpass';
    this.tripFilter.frequency.value = 16000;
    this.tripFilter.Q.value = 2;
    this.wall = ctx.createBiquadFilter();
    this.wall.type = 'lowpass';
    this.wall.frequency.value = 18000;
    this.music.connect(this.tripFilter).connect(this.wall).connect(this.master);

    // Trip LFO swings the filter. Depth grows with the trip.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    this.tripLfoGain = gain(ctx, 0);
    lfo.connect(this.tripLfoGain).connect(this.tripFilter.detune);
    lfo.start();

    this.sfx = gain(ctx, 0.8);
    this.sfx.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Big concrete room reverb.
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 3.2, 2.4);
    this.reverb = gain(ctx, 1);
    const verbOut = gain(ctx, 0.35);
    this.reverb.connect(verb).connect(verbOut).connect(this.music);

    // Sidechain duck for everything that isn't the kick.
    this.duck = gain(ctx, 1);
    this.duck.connect(this.music);

    // The rumble: kick into a dark reverb, lowpassed hard. The Berghain floor shaking.
    const rumbleVerb = ctx.createConvolver();
    rumbleVerb.buffer = impulse(ctx, 1.8, 3);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 150;
    rumbleLp.Q.value = 0.8;
    const rumbleHp = ctx.createBiquadFilter();
    rumbleHp.type = 'highpass';
    rumbleHp.frequency.value = 32;
    const rumbleDrive = ctx.createWaveShaper();
    rumbleDrive.curve = driveCurve(3);
    this.rumble = gain(ctx, 1);
    this.rumble.connect(rumbleVerb).connect(rumbleLp).connect(rumbleHp).connect(rumbleDrive).connect(gain(ctx, 0.9)).connect(this.duck);

    // Dub delay for the stab: dotted eighth.
    const dl = ctx.createDelay(2);
    dl.delayTime.value = STEP * 3;
    const fb = gain(ctx, 0.42);
    const dlLp = ctx.createBiquadFilter();
    dlLp.type = 'lowpass';
    dlLp.frequency.value = 1800;
    this.delay = gain(ctx, 1);
    this.delay.connect(dl).connect(dlLp).connect(fb).connect(dl);
    dlLp.connect(gain(ctx, 0.6)).connect(this.duck);
    dlLp.connect(this.reverb);

    // Drone: low saw through a slow moving filter. Always there.
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = F1;
    const drone2 = ctx.createOscillator();
    drone2.type = 'sawtooth';
    drone2.frequency.value = F1 * 1.004;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 180;
    droneLp.Q.value = 6;
    const droneLfo = ctx.createOscillator();
    droneLfo.frequency.value = 0.05;
    const droneLfoGain = gain(ctx, 120);
    droneLfo.connect(droneLfoGain).connect(droneLp.frequency);
    const droneOut = gain(ctx, 0.06);
    drone.connect(droneLp);
    drone2.connect(droneLp);
    droneLp.connect(droneOut).connect(this.duck);
    droneOut.connect(this.reverb);
    [drone, drone2, droneLfo].forEach((o) => o.start());

    // Panorama Bar pad: a minor chord, warm, only upstairs.
    this.padGain = gain(ctx, 0);
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 1400;
    for (const f of [F2 * 2, AB2 * 2, C3 * 2, EB3 * 2]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(padLp);
        o.start();
      }
    }
    padLp.connect(this.padGain).connect(this.duck);
    this.padGain.connect(this.reverb);
  }

  start(): void {
    void this.ctx.resume();
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  set muted(m: boolean) {
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setMix(mix: Mix): void {
    const t = this.ctx.currentTime;
    this.wall.frequency.setTargetAtTime(mix.cutoff, t, 0.25);
    this.music.gain.setTargetAtTime(mix.volume, t, 0.25);
    this.padGain.gain.setTargetAtTime(mix.warm * 0.025, t, 0.8);
    this.warm = mix.warm;
  }

  /** 0 to 1. Drives the filter swing, detune and the acid line. */
  setTrip(k: number, sharp: boolean): void {
    this.trip = k;
    this.sharp = sharp;
    const depth = sharp ? 0 : Math.max(0, k - 0.3) * 3600;
    this.tripLfoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.5);
  }

  /** Dip everything, for passing out or the end. */
  dive(seconds: number, to = 200): void {
    const t = this.ctx.currentTime;
    const f = this.tripFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(to, t + 0.4);
    f.setTargetAtTime(16000, t + seconds, 0.6);
  }

  fadeOut(seconds: number): void {
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0.0001, t, seconds / 3);
  }

  // ---------- sequencer ----------

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16) % BARS;
    const breakdown = bar >= 28 && bar < 30;
    const firstLoop = step < 16 * BARS;

    if (s % 4 === 0) this.onBeat(step / 4, t);

    // Kick: four on the floor.
    if (s % 4 === 0 && !breakdown) this.kick(t);

    // Hats: off beat open hat, quiet 16ths after the intro.
    if (s % 4 === 2) this.hat(t, true);
    if ((!firstLoop || bar >= 2) && s % 4 !== 2 && Math.random() < 0.8) this.hat(t, false, s % 2 === 1 ? 0.35 : 0.2);

    // Rolling bass in the gaps between kicks.
    if ((!firstLoop || bar >= 4) && !breakdown && s % 4 !== 0) {
      this.bass(t, BASS_NOTES[Math.floor(step / 4) % BASS_NOTES.length] ?? F1, s % 4 === 2 ? 1 : 0.7);
    }

    // Clap on 2 and 4.
    if ((!firstLoop || bar >= 8) && (s === 4 || s === 12)) this.clap(t);

    // Dub stab, two hits per two bars.
    const s32 = step % 32;
    if ((!firstLoop || bar >= 12 || breakdown) && (s32 === 3 || s32 === 22)) this.stab(t);

    // Ride on the off beats upstairs.
    if (this.warm > 0.5 && s % 4 === 2) this.hat(t, true, 0.5, 5500);

    // Acid creeps in as the trip rises.
    const acid = Math.max(0, (this.trip - 0.45) / 0.55);
    if (acid > 0 && !this.sharp) this.acid(t, ACID[s] ?? F2, ACID_ACCENT[s] ?? 0, acid);
  }

  private wobble(): number {
    // Pitch drifts with the trip, up to about a quarter tone.
    return this.sharp ? 0 : Math.sin(this.ctx.currentTime * 0.31) * this.trip * 45;
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    o.detune.value = this.wobble();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(2.2);
    const out = gain(ctx, 0.85);
    o.connect(g).connect(sh).connect(out).connect(this.music);
    sh.connect(gain(ctx, 0.55)).connect(this.rumble);
    o.start(t);
    o.stop(t + 0.5);

    // Click on top.
    this.noiseHit(t, 0.004, 'highpass', 2500, 0.25, this.music);

    // Duck the rest under the kick.
    const d = this.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(0.25, t);
    d.linearRampToValueAtTime(1, t + STEP * 3);
  }

  private hat(t: number, open: boolean, vol = 1, freq = 8000): void {
    const len = open ? 0.11 : 0.025;
    this.noiseHit(t, len, 'highpass', freq, (open ? 0.16 : 0.09) * vol, this.music, 0.15);
  }

  private clap(t: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (const off of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.5, t + off);
      g.gain.exponentialRampToValueAtTime(0.08, t + off + 0.009);
    }
    g.gain.setValueAtTime(0.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(bp).connect(g);
    g.connect(gain(ctx, 0.5)).connect(this.duck);
    g.connect(gain(ctx, 0.5)).connect(this.reverb);
    src.start(t, Math.random());
    src.stop(t + 0.25);
  }

  private bass(t: number, f: number, vel: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = this.wobble();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(700 + this.warm * 300, t);
    lp.frequency.exponentialRampToValueAtTime(130, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.95);
    o.connect(lp).connect(g).connect(this.duck);
    o.start(t);
    o.stop(t + STEP);
  }

  private stab(t: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    const top = 1100 + this.warm * 1800;
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const f of [F2, AB2, C3, EB3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = this.wobble() + (Math.random() - 0.5) * 10;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.32);
    }
    lp.connect(g);
    g.connect(this.duck);
    g.connect(this.delay);
    g.connect(gain(ctx, 0.8)).connect(this.reverb);
  }

  private acid(t: number, f: number, accent: number, amount: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = this.wobble() * 1.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 14;
    const peak = 500 + amount * 2200 + accent * 900;
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((0.05 + accent * 0.03) * amount, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.9);
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(1.6);
    o.connect(lp).connect(sh).connect(g);
    g.connect(this.duck);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + STEP);
  }

  private noiseHit(t: number, len: number, type: BiquadFilterType, freq: number, vol: number, to: AudioNode, verb = 0): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(to);
    if (verb) g.connect(gain(ctx, verb)).connect(this.reverb);
    src.start(t, Math.random());
    src.stop(t + len + 0.01);
  }

  // ---------- sound effects (not muffled by walls) ----------

  sfxStep(): void {
    const t = this.ctx.currentTime;
    const pitch = 0.85 + Math.random() * 0.3;
    this.noiseHit(t, 0.035, 'bandpass', 1900 * pitch, 0.35, this.sfx);
    this.tone(t, 380 * pitch, 220 * pitch, 0.06, 0.18, 'triangle');
  }

  sfxPickup(): void {
    const t = this.ctx.currentTime;
    [698.5, 880, 1046.5, 1396.9].forEach((f, i) => this.tone(t + i * 0.07, f, f, 0.5, 0.12, 'sine', 0.5));
  }

  sfxSlip(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 700, 180, 0.22, 0.12, 'square');
  }

  sfxMate(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 900, 300, 0.05, 0.2, 'sine');
    this.noiseHit(t + 0.05, 0.6, 'highpass', 6000, 0.12, this.sfx);
  }

  sfxIce(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 2093, 2093, 1.2, 0.08, 'sine', 0.6);
    this.tone(t + 0.04, 3136, 3136, 1, 0.05, 'sine', 0.6);
  }

  sfxGood(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 523.3, 523.3, 0.25, 0.12, 'triangle', 0.3);
    this.tone(t + 0.12, 784, 784, 0.4, 0.12, 'triangle', 0.3);
  }

  sfxBad(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 392, 392, 0.25, 0.12, 'triangle', 0.3);
    this.tone(t + 0.14, 277.2, 277.2, 0.4, 0.12, 'triangle', 0.3);
  }

  sfxGate(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 1.2, 'bandpass', 420, 0.3, this.sfx, 0.6);
    this.tone(t, 70, 50, 1.2, 0.3, 'sine');
  }

  sfxShimmer(): void {
    const t = this.ctx.currentTime;
    [1318.5, 1568, 1975.5, 2637].forEach((f, i) => this.tone(t + i * 0.05, f, f * 1.01, 0.8, 0.05, 'sine', 0.7));
  }

  /** The horse lands on the dance floor. */
  sfxThud(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 90, 32, 0.9, 0.6, 'sine', 0.4);
    this.noiseHit(t, 0.25, 'lowpass', 500, 0.5, this.sfx, 0.5);
  }

  /** Animal control. */
  sfxSiren(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.tone(t + i * 0.5, i % 2 ? 660 : 880, i % 2 ? 880 : 660, 0.48, 0.07, 'square');
  }

  /** Tourist camera: shutter click and flash whine. */
  sfxCamera(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 3000, 6000, 0.25, 0.03, 'sine');
    this.noiseHit(t + 0.25, 0.03, 'highpass', 3000, 0.4, this.sfx);
    this.noiseHit(t + 0.3, 0.04, 'bandpass', 1500, 0.3, this.sfx);
  }

  /** Keys falling out of a jacket. */
  sfxKeys(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const f = 2400 + Math.random() * 2400;
      this.tone(t + i * 0.06 + Math.random() * 0.03, f, f * 0.98, 0.25, 0.06, 'triangle', 0.3);
    }
  }

  /** The crowd turns to the new resident. */
  sfxCrowd(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 2.5, 'bandpass', 700, 0.25, this.sfx, 0.8);
    this.tone(t, 55, 40, 2, 0.4, 'sine', 0.5);
  }

  private tone(t: number, f0: number, f1: number, len: number, vol: number, type: OscillatorType, verb = 0): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.sfx);
    if (verb) g.connect(gain(ctx, verb)).connect(this.reverb);
    o.start(t);
    o.stop(t + len + 0.02);
  }
}

function gain(ctx: AudioContext, v: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const cached = curves.get(amount);
  if (cached) return cached;
  const n = 1024;
  const c = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * amount) / norm;
  }
  curves.set(amount, c);
  return c;
}
