// Game: the rules. Fragments, the club clock, endings, losses, closing time and easter eggs. Issues #11, #13, #20, #21.
// Listens on the bus and decides what happens. Draws nothing itself.
// It is the only system that adds fragments: others emit fragment:claim and this answers with fragment:found.
import {
  bus,
  state,
  cellCenter,
  BeatCounter,
  PASS_OUTS_TO_HERD,
  type EndingId,
  type FragmentId,
} from '../contracts';
import { level, debug } from '../data';

const RAT_SECONDS = 30;
const DJ_STOMPS = 8;
const DJ_RANGE = 2.8;
const PASS_OUT_TRIP = 45;
/** Real seconds per club minute. A good run (about 8 minutes) gets home around 11:30. */
const SECONDS_PER_MINUTE = 1.5;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

export function startGame(): void {
  // Fragments: one owner.
  bus.on('fragment:claim', ({ id }) => found(id));

  // Endings: the back exit decides by how much you remember.
  bus.on('exit:reached', () => showEnding(state.fragments.length >= 5 ? 'full_memory' : 'partial_memory'));
  // Secret ending: the crowd turns first, then the card.
  bus.on('secret:dj', () => setTimeout(() => showEnding('secret_dj'), 1800));

  // Loss: trip at max. Wake up in the toilet queue. Three times and you're one of the herd.
  bus.on('trip:max', () => {
    if (state.ending) return;
    state.passOuts++;
    if (state.passOuts >= PASS_OUTS_TO_HERD) {
      setTimeout(() => showEnding('herd'), 1200);
      return;
    }
    state.trip = PASS_OUT_TRIP;
    bus.emit('trip:changed', { trip: state.trip });
    bus.emit('player:respawn', { zone: 'toilet_corridor' });
    bus.emit('ui:say', { key: 'story:losses.passed_out', seconds: 4 });
    const warning = `story:spirit_guide.herd_warning_${state.passOuts}`;
    setTimeout(() => bus.emit('ui:say', { key: warning, seconds: 5 }), 4500);
  });

  // Loss: caught. Back to the last checkpoint.
  bus.on('player:caught', () => {
    if (state.ending) return;
    bus.emit('player:respawn', { zone: state.checkpoint });
    bus.emit('ui:say', { key: 'story:losses.caught', seconds: 5 });
  });

  // Spirit guide speaks after each fragment. With all five: closing time.
  bus.on('fragment:found', ({ id }) => {
    bus.emit('ui:say', { key: `story:spirit_guide.fragment_${id}`, seconds: 4 });
    if (state.fragments.length === 5 && !state.finale) {
      setTimeout(() => {
        if (state.ending) return;
        state.finale = true;
        bus.emit('game:finale', {});
        bus.emit('ui:say', { key: 'story:finale.start', seconds: 5 });
      }, 4500);
    }
  });

  // Fragment 2: no mirrors, so look down at your own leg. Only readable with your glasses on.
  bus.on('player:look', () => {
    if (state.ending) return;
    if (!state.fragments.includes(1)) return bus.emit('ui:say', { key: 'story:spirit_guide.look_blurry', seconds: 3 });
    if (state.fragments.includes(2)) return bus.emit('ui:say', { key: 'story:spirit_guide.look_again', seconds: 2.5 });
    found(2);
  });

  bus.on('door:refused', () => bus.emit('ui:say', { key: 'story:door', seconds: 3 }));
  let warned = false;
  bus.on('trip:changed', ({ trip }) => {
    if (trip > 70 && !warned) {
      warned = true;
      bus.emit('ui:say', { key: 'story:spirit_guide.trip_high', seconds: 4 });
    }
    if (trip < 50) warned = false;
  });

  // The club clock. Sunday 06:12 onwards; Mum's lunch is at 13:00.
  state.minutes += Math.floor(debug.time / SECONDS_PER_MINUTE);
  let acc = 0;
  let lastFrame = performance.now();
  const clock = () => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.started && !state.ending) {
      acc += dt;
      while (acc >= SECONDS_PER_MINUTE) {
        acc -= SECONDS_PER_MINUTE;
        state.minutes++;
        bus.emit('clock:tick', { minutes: state.minutes });
        if (state.minutes === 12 * 60 + 30) bus.emit('ui:say', { key: 'story:spirit_guide.half_twelve', seconds: 4 });
      }
    }
    requestAnimationFrame(clock);
  };
  requestAnimationFrame(clock);

  // Playtest flags.
  if (debug.trip !== null) state.trip = Math.max(0, Math.min(99, debug.trip));
  bus.on('intro:land', () => debug.fragments.forEach((id) => found(id)));

  // Konami code: rat for 30 seconds.
  let k = 0;
  let ratTimer = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    k = e.code === KONAMI[k] ? k + 1 : e.code === KONAMI[0] ? 1 : 0;
    if (k < KONAMI.length) return;
    k = 0;
    if (!state.started || state.ending) return;
    state.rat = true;
    bus.emit('player:rat', { active: true });
    bus.emit('ui:say', { key: 'story:easter.rat', seconds: 3 });
    clearTimeout(ratTimer);
    ratTimer = window.setTimeout(() => {
      state.rat = false;
      bus.emit('player:rat', { active: false });
      bus.emit('ui:say', { key: 'story:easter.rat_end', seconds: 2 });
    }, RAT_SECONDS * 1000);
  });

  if (level.markers.dj_booth) startDjBooth(level.markers.dj_booth);

  // The only mirror in the building, behind the ice cream counter.
  const m = level.markers.mirror;
  if (m) {
    const c = cellCenter(m[0], m[1]);
    // Mirror hangs on the north wall of the cell; you stand between it and the counter.
    const spot = { x: c.x, z: c.z - 1.4 };
    let last = -Infinity;
    bus.on('player:moved', ({ x, z }) => {
      const now = performance.now();
      if (Math.hypot(x - spot.x, z - spot.z) > 1.1 || now - last < 8000) return;
      last = now;
      bus.emit('mirror:seen', {});
      bus.emit('ui:say', { key: 'story:easter.mirror', seconds: 2 });
    });
  }
}

function found(id: FragmentId): void {
  if (state.fragments.includes(id) || state.ending) return;
  state.fragments.push(id);
  bus.emit('fragment:found', { id });
  state.checkpoint = state.zone;
  bus.emit('checkpoint:set', { zone: state.zone });
}

/** The DJ booth: stomp on the beat eight times in a row and the decks are yours. */
function startDjBooth(cell: [number, number]): void {
  const booth = cellCenter(cell[0], cell[1]);
  const counter = new BeatCounter();
  let hintAt = -Infinity;
  let done = false;
  bus.on('beat', ({ n, time }) => counter.beat(n, time));
  bus.on('player:moved', ({ x, z }) => {
    if (done || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE + 0.5) return;
    const now = performance.now();
    if (now - hintAt < 25000) return;
    hintAt = now;
    bus.emit('ui:say', { key: 'story:dj.hint', seconds: 4 });
  });
  bus.on('player:stomp', ({ x, z, time }) => {
    if (done || state.ending || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE) return;
    if (counter.stomp(time) < DJ_STOMPS) return;
    done = true;
    bus.emit('secret:dj', {});
    bus.emit('crowd:cheer', {});
  });
}

function showEnding(ending: EndingId): void {
  if (state.ending) return;
  state.ending = ending;
  bus.emit('ending:show', { ending });
}
