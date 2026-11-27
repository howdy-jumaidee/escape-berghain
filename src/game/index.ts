// Game: endings, losses and easter eggs. Issues #13 and #21.
// Listens on the bus and decides what the outcome is. Draws nothing itself.
import { bus, state, cellCenter, type EndingId } from '../contracts';
import level1 from '../../levels/level1.json';

const RAT_SECONDS = 30;
const PASS_OUT_TRIP = 45;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

export function startGame(): void {
  // Endings: the back exit decides by how much you remember.
  bus.on('exit:reached', () => {
    const ending: EndingId = state.fragments.length >= 5 ? 'full_memory' : 'partial_memory';
    showEnding(ending);
  });
  bus.on('secret:dj', () => showEnding('secret_dj'));

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
  });
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

  // The only mirror in the building, behind the ice cream counter.
  const m = (level1 as unknown as { markers?: Record<string, [number, number]> }).markers?.mirror;
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

function showEnding(ending: EndingId): void {
  if (state.ending) return;
  state.ending = ending;
  bus.emit('ending:show', { ending });
}
