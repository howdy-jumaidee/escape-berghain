// Audio manager: owns the beat clock, the music and the sound effects. Issue #19.
// Starts on game:start (browsers only allow sound after a click). M mutes.
import { bus, state, TRIP_MAX, BEAT_SECONDS, type ZoneId } from '../contracts';
import { debug } from '../data';
import { Techno, type Mix } from './techno';
import { Cues } from './cues';

/** How the music sounds from each zone. Issue #70: hall loud and physical, toilets muffled with tile echo,
 * Panorama warm, back exit quiet and dry. `verb` is the reverb send: tiled corridor rings, the back exit is dry. */
const ZONE_MIX: Record<ZoneId, Mix> = {
  main_hall: { cutoff: 18000, volume: 1, warm: 0, verb: 0.45 },
  bar_cloakroom: { cutoff: 2000, volume: 0.75, warm: 0, verb: 0.3 },
  toilet_corridor: { cutoff: 420, volume: 0.7, warm: 0, verb: 0.8 },
  panorama_bar: { cutoff: 15000, volume: 0.95, warm: 1, verb: 0.5 },
  back_exit: { cutoff: 600, volume: 0.45, warm: 0, verb: 0.06 },
};

const MUFFLED: Mix = { cutoff: 220, volume: 0.9, warm: 0 };

function startFallbackBeat(): number {
  let n = 0;
  return window.setInterval(() => bus.emit('beat', { n: n++, time: performance.now() }), BEAT_SECONDS * 1000);
}

export function startAudio(): void {
  let music: Techno | null = null;
  let muted = false;
  let fallback = 0;
  // Ear cues: track fragment spots from the start, so the world's game:start positions aren't missed.
  const cues = new Cues();
  bus.on('fragment:spot', ({ id, x, z, floor }) => cues.spot(id, x, z, floor));
  bus.on('fragment:found', ({ id }) => cues.found(id));
  bus.on('player:moved', ({ x, z }) => cues.player(x, z));
  bus.on('unicorn:near', ({ near }) => {
    if (near) cues.unicorn();
  });

  // ?debug: peak meter on the master, so clipping is measurable in the console: ebAudio()
  if (debug.on) (window as unknown as { ebAudio: () => number }).ebAudio = () => music?.level() ?? 0;

  bus.on('game:start', () => {
    if (music) return;
    try {
      music = new Techno();
      const m = music;
      m.onBeat = (n, audioTime) => {
        cues.beat(audioTime);
        // Turn audio time into page time so the herd can compare it with key presses.
        const delayMs = (audioTime - m.ctx.currentTime) * 1000;
        const time = performance.now() + delayMs;
        setTimeout(() => bus.emit('beat', { n, time }), Math.max(0, delayMs));
      };
      // Intro: the kick through a concrete wall until the horse lands.
      m.setMix(state.started ? ZONE_MIX[state.zone] : MUFFLED);
      m.start();
      cues.attach(m.ctx, m.sfxIn, m.verbIn);
      // If the browser keeps audio suspended, keep a silent beat going and retry on the next real input.
      const retry = () => void m.ctx.resume();
      const watch = () => {
        if (m.ctx.state === 'running') {
          clearInterval(fallback);
          fallback = 0;
          removeEventListener('keydown', retry);
          removeEventListener('pointerdown', retry);
        } else if (!fallback && !document.hidden) {
          fallback = startFallbackBeat();
          addEventListener('keydown', retry);
          addEventListener('pointerdown', retry);
        }
      };
      m.ctx.addEventListener('statechange', watch);
      setTimeout(watch, 1000);
    } catch {
      // No Web Audio: keep the beat clock alive so the strobes, herd and DJ booth still work.
      fallback = startFallbackBeat();
    }
  });

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || !music) return;
    muted = !muted;
    music.muted = muted;
  });
  // Pause the scheduler's sound when the tab is hidden, so it doesn't pile up.
  document.addEventListener('visibilitychange', () => {
    if (!music) return;
    if (document.hidden) void music.ctx.suspend();
    else void music.ctx.resume();
  });

  bus.on('zone:entered', ({ zone }) => {
    if (!state.ending) music?.setMix(ZONE_MIX[zone]);
    if (state.started && !state.ending) music?.sfxZone();
  });
  bus.on('trip:changed', ({ trip }) => music?.setTrip(trip / TRIP_MAX, state.brainFreezeActive));

  bus.on('player:step', () => music?.sfxStep());
  bus.on('player:stomp', () => music?.sfxNeigh());
  bus.on('fragment:found', () => music?.sfxPickup(state.fragments.length));
  bus.on('item:slipped', () => music?.sfxSlip());
  bus.on('item:consumed', ({ item }) => {
    if (!music) return;
    if (item === 'mate') music.sfxMate();
    else if (item === 'bag') music.sfxHoof();
    else {
      music.sfxIce();
      music.setTrip(state.trip / TRIP_MAX, true);
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
  bus.on('intro:land', () => {
    music?.sfxThud();
    music?.setMix(ZONE_MIX[state.zone]);
  });
  bus.on('player:caught', () => {
    music?.sfxSiren();
    music?.dive(3, 300);
  });
  bus.on('selfie:flash', () => music?.sfxCamera());
  bus.on('fragment:found', ({ id }) => {
    if (id === 4) music?.sfxKeys();
  });
  bus.on('door:refused', () => music?.sfxBad());
  bus.on('shutters:open', () => music?.sfxGate());
  bus.on('secret:dj', () => music?.sfxCrowd());
  bus.on('crowd:cheer', () => music?.cheer());
  bus.on('crowd:bump', () => music?.sfxBump());
  // Face to face: the club drops away to a muffled thump while you talk.
  bus.on('npc:focus', () => {
    music?.setMix({ cutoff: 600, volume: 0.7, warm: 0 });
    music?.sfxFocus();
  });
  bus.on('npc:unfocus', () => {
    if (!state.ending) music?.setMix(ZONE_MIX[state.zone]);
  });
  bus.on('game:finale', () => {
    music?.setFinale();
    music?.cheer();
    music?.sfxSiren();
  });
  // The leather choir opens the music up, wherever you are.
  bus.on('music:choir', ({ near }) => {
    music?.setChoir(near);
    music?.setMix(near ? { ...ZONE_MIX[state.zone], cutoff: 18000, volume: 1.1 } : ZONE_MIX[state.zone]);
  });
  bus.on('trip:max', () => music?.dive(2.5));
  bus.on('ending:show', ({ ending }) => {
    if (!music) return;
    if (ending === 'partial_memory') music.setMix({ cutoff: 300, volume: 0.6, warm: 0 });
    // The resident horse DJ keeps the music going.
    else if (ending === 'full_memory') music.fadeOut(6);
  });
}
