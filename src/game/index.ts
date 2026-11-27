// Game: endings, losses and easter eggs. Issues #13 and #21.
// Listens on the bus and decides what the outcome is. Draws nothing itself.
import { bus, state, cellCenter, BEAT_SECONDS, type EndingId, type FragmentId } from '../contracts';
import level1 from '../../levels/level1.json';

const RAT_SECONDS = 30;
const DJ_STOMPS = 8;
const DJ_RANGE = 2.8;
const STOMP_WINDOW_MS = 150;
const PASS_OUT_TRIP = 45;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

export function startGame(): void {
  // Endings: the back exit decides by how much you remember.
  bus.on('exit:reached', () => {
    const ending: EndingId = state.fragments.length >= 5 ? 'full_memory' : 'partial_memory';
    showEnding(ending);
  });
  // Secret ending: the crowd turns first, then the card.
  bus.on('secret:dj', () => setTimeout(() => showEnding('secret_dj'), 1800));

  // Loss: trip at max. Fade out, wake up in the toilet queue, keep your fragments.
  bus.on('trip:max', () => {
    if (state.ending) return;
    state.trip = PASS_OUT_TRIP;
    bus.emit('trip:changed', { trip: state.trip });
    bus.emit('player:respawn', { zone: 'toilet_corridor' });
    bus.emit('ui:say', { key: 'story:losses.passed_out', seconds: 5 });
  });

  // Loss: caught. Back to the last checkpoint.
  bus.on('player:caught', () => {
    if (state.ending) return;
    bus.emit('player:respawn', { zone: state.checkpoint });
    bus.emit('ui:say', { key: 'story:losses.caught', seconds: 5 });
  });

  // Spirit guide speaks after each fragment, and once when things get blurry.
  bus.on('fragment:found', ({ id }) => {
    bus.emit('ui:say', { key: `story:spirit_guide.fragment_${id}`, seconds: 4 });
    if (state.fragments.length === 5) {
      setTimeout(() => bus.emit('ui:say', { key: 'story:spirit_guide.all', seconds: 5 }), 4500);
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

  const markers = (level1 as unknown as { markers?: Record<string, [number, number]> }).markers ?? {};
  if (markers.dj_booth) startDjBooth(markers.dj_booth);

  // The only mirror in the building, behind the ice cream counter.
  const m = markers.mirror;
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
  if (state.fragments.includes(id)) return;
  state.fragments.push(id);
  bus.emit('fragment:found', { id });
  state.checkpoint = state.zone;
  bus.emit('checkpoint:set', { zone: state.zone });
}

/** The DJ booth: stomp on the beat eight times in a row and the decks are yours. */
function startDjBooth(cell: [number, number]): void {
  const booth = cellCenter(cell[0], cell[1]);
  let beatN = 0;
  let beatTime = 0;
  let count = 0;
  let lastN = -10;
  let hintAt = -Infinity;
  let done = false;
  bus.on('beat', ({ n, time }) => {
    beatN = n;
    beatTime = time;
  });
  bus.on('player:moved', ({ x, z }) => {
    if (done || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE + 0.5) return;
    const now = performance.now();
    if (now - hintAt < 25000) return;
    hintAt = now;
    bus.emit('ui:say', { key: 'story:dj.hint', seconds: 4 });
  });
  bus.on('player:stomp', ({ x, z, time }) => {
    if (done || state.ending || !beatTime || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE) return;
    const period = BEAT_SECONDS * 1000;
    const since = time - beatTime;
    const nearest = since < period / 2 ? beatN : beatN + 1;
    const err = Math.min(Math.abs(since), Math.abs(period - since));
    if (err > STOMP_WINDOW_MS) {
      count = 0;
      return;
    }
    if (nearest === lastN) return;
    count = nearest === lastN + 1 ? count + 1 : 1;
    lastN = nearest;
    if (count >= DJ_STOMPS) {
      done = true;
      bus.emit('secret:dj', {});
    }
  });
}

function showEnding(ending: EndingId): void {
  if (state.ending) return;
  state.ending = ending;
  bus.emit('ending:show', { ending });
}
