// Audio manager: owns the beat clock, the music and the sound effects. Issue #19.
// Starts on game:start (browsers only allow sound after a click). M mutes.
import { bus, state, TRIP_MAX, BEAT_SECONDS, type ZoneId } from '../contracts';
import { Techno, type Mix } from './techno';

/** How the music sounds from each zone. */
const ZONE_MIX: Record<ZoneId, Mix> = {
  main_hall: { cutoff: 18000, volume: 1, warm: 0 },
  bar_cloakroom: { cutoff: 2400, volume: 0.8, warm: 0 },
  toilet_corridor: { cutoff: 380, volume: 0.75, warm: 0 },
  panorama_bar: { cutoff: 14000, volume: 0.9, warm: 1 },
  back_exit: { cutoff: 900, volume: 0.6, warm: 0 },
};

export function startAudio(): void {
  let music: Techno | null = null;
  let muted = false;
  let fallback = 0;

  bus.on('game:start', () => {
    if (music || fallback) return;
    try {
      music = new Techno();
      const m = music;
      m.onBeat = (n, audioTime) => {
        // Turn audio time into page time so the herd can compare it with key presses.
        const delayMs = (audioTime - m.ctx.currentTime) * 1000;
        const time = performance.now() + delayMs;
        setTimeout(() => bus.emit('beat', { n, time }), Math.max(0, delayMs));
      };
      m.setMix(ZONE_MIX[state.zone]);
      m.start();
    } catch {
      // No Web Audio: keep the beat clock alive so the strobes and herd still work.
      let n = 0;
      fallback = window.setInterval(() => bus.emit('beat', { n: n++, time: performance.now() }), BEAT_SECONDS * 1000);
    }
  });

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || !music) return;
    muted = !muted;
    music.muted = muted;
  });
  // Pause the scheduler's sound when the tab is hidden, so it doesn't pile up.
  document.addEventListener('visibilitychange', () => {
    if (!music) return;
    if (document.hidden) void music.ctx.suspend();
    else void music.ctx.resume();
  });

  bus.on('zone:entered', ({ zone }) => music?.setMix(ZONE_MIX[zone]));
  bus.on('trip:changed', ({ trip }) => music?.setTrip(trip / TRIP_MAX, state.brainFreezeActive));

  bus.on('player:step', () => music?.sfxStep());
  bus.on('fragment:found', () => music?.sfxPickup());
  bus.on('item:slipped', () => music?.sfxSlip());
  bus.on('item:consumed', ({ item }) => {
    if (!music) return;
    if (item === 'mate') music.sfxMate();
    else {
      music.sfxIce();
      music.setTrip(state.trip / TRIP_MAX, true);
      setTimeout(() => music?.setTrip(state.trip / TRIP_MAX, false), 5000);
    }
  });
  bus.on('riddle:answered', ({ correct }) => {
    if (!music) return;
    if (correct) {
      music.sfxGood();
      setTimeout(() => music?.sfxGate(), 600);
    } else music.sfxBad();
  });
  bus.on('herd:synced', () => music?.sfxGood());
  bus.on('mirror:seen', () => music?.sfxShimmer());
  bus.on('trip:max', () => music?.dive(2.5));
  bus.on('ending:show', ({ ending }) => {
    if (!music) return;
    if (ending === 'partial_memory') music.setMix({ cutoff: 300, volume: 0.6, warm: 0 });
    else music.fadeOut(6);
  });
}
