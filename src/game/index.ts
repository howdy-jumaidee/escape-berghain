// Game: the rules. Fragments, endings, losses, closing time and the secret DJ. Issues #11, #13, #20, #21.
// Listens on the bus and decides what happens. Draws nothing itself.
// It is the only system that adds fragments: others emit fragment:claim and this answers with fragment:found.
import {
  bus,
  state,
  cellCenter,
  BeatCounter,
  PASS_OUTS_TO_HERD,
  lock,
  type EndingId,
  type FragmentId,
} from '../contracts';
import { level, debug } from '../data';

const DJ_STOMPS = 8;
const DJ_RANGE = 2.8;
const PASS_OUT_TRIP = 45;
let endingPending = false;

export function startGame(): void {
  // Fragments: one owner.
  bus.on('fragment:claim', ({ id }) => found(id));

  // Endings: the back exit decides by how much you remember.
  bus.on('exit:reached', () => {
    if (state.ending || endingPending) return;
    showEnding(state.fragments.length >= 5 ? 'full_memory' : 'partial_memory');
  });
  // Secret ending: the crowd turns first, then the card.
  bus.on('secret:dj', () => {
    if (state.ending || endingPending) return;
    endingPending = true;
    lock('ending');
    setTimeout(() => showEnding('secret_dj'), 1800);
  });

  // Loss: trip at max. Wake up in the toilet queue. Three times and you're one of the herd.
  bus.on('trip:max', () => {
    if (state.ending || endingPending) return;
    state.passOuts++;
    if (state.passOuts >= PASS_OUTS_TO_HERD) {
      endingPending = true;
      lock('ending');
      setTimeout(() => showEnding('herd'), 1200);
      return;
    }
    state.trip = PASS_OUT_TRIP;
    bus.emit('trip:changed', { trip: state.trip });
    bus.emit('player:respawn', { zone: 'toilet_corridor' });
    bus.emit('ui:say', { key: 'story:losses.passed_out', seconds: 4 });
    const warning = `story:spirit_guide.herd_warning_${state.passOuts}`;
    setTimeout(() => {
      if (!state.ending && !endingPending) bus.emit('ui:say', { key: warning, seconds: 5 });
    }, 4500);
  });

  // Loss: caught. Back to the last checkpoint.
  bus.on('player:caught', () => {
    if (state.ending || endingPending) return;
    bus.emit('player:respawn', { zone: state.checkpoint });
    bus.emit('ui:say', { key: 'story:losses.caught', seconds: 5 });
  });

  // Spirit guide speaks after each fragment. With all five: closing time.
  bus.on('fragment:found', ({ id }) => {
    bus.emit('ui:say', { key: `story:spirit_guide.fragment_${id}`, seconds: 4 });
    if (state.fragments.length === 5 && !state.finale) {
      setTimeout(() => {
        if (state.ending || endingPending) return;
        state.finale = true;
        bus.emit('game:finale', {});
        bus.emit('ui:say', { key: 'story:finale.start', seconds: 5 });
      }, 4500);
    }
  });

  // Fragment 2: no mirrors, so look down at your own leg. Only readable with your glasses on.
  bus.on('player:look', () => {
    if (state.ending || endingPending) return;
    if (!state.fragments.includes(1)) return bus.emit('ui:say', { key: 'story:spirit_guide.look_blurry', seconds: 3 });
    if (state.fragments.includes(2)) return bus.emit('ui:say', { key: 'story:spirit_guide.look_again', seconds: 2.5 });
    found(2);
  });

  bus.on('door:refused', () => bus.emit('ui:say', { key: 'story:door', seconds: 3 }));
  // Playtest flags.
  if (debug.trip !== null && Number.isFinite(debug.trip)) state.trip = Math.max(0, Math.min(99, debug.trip));
  bus.on('intro:land', () => debug.fragments.forEach((id) => found(id)));

  if (level.markers.dj_booth) startDjBooth(level.markers.dj_booth);

}

function found(id: FragmentId): void {
  if (state.fragments.includes(id) || state.ending || endingPending) return;
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
    if (done || state.ending || endingPending || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE) return;
    if (counter.stomp(time) < DJ_STOMPS) return;
    done = true;
    bus.emit('secret:dj', {});
    bus.emit('crowd:cheer', {});
  });
}

function showEnding(ending: EndingId): void {
  if (state.ending) return;
  endingPending = false;
  state.ending = ending;
  bus.emit('ending:show', { ending });
}
