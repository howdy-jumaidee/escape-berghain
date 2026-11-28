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
  unlock,
  type EndingId,
  type FragmentId,
} from '../contracts';
import { level, debug } from '../data';

const DJ_STOMPS = 8;
const DJ_RANGE = 2.8;
const PASS_OUT_TRIP = 45;
const CAUGHT_RAGDOLL_MS = 1350;
const PASSOUT_RAGDOLL_MS = 1300;
/** A memory lands: a quick reaction first, then the spirit guide's next step. */
const REACTION_S = 2.4;
/** The opening surprise: one odd rumour, reliably inside the first two minutes. */
const SURPRISE_MS = 55000;
const FIRST_LINE_MS = 4300;
const CAUGHT_LINES = 3;
const PASSED_OUT_LINES = 2;
let endingPending = false;
let collapsing = false;
let collapseTimer = 0;
let catches = 0;
let lastFoundAt = -Infinity;
let metUnicorn = false;

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

  // Loss: trip at max. Let the horse ragdoll onto the floor before waking in the toilet queue.
  // Three times and you're one of the herd.
  bus.on('trip:max', () => {
    if (state.ending || endingPending || collapsing) return;
    collapsing = true;
    state.passOuts++;
    lock('ragdoll');
    const isHerd = state.passOuts >= PASS_OUTS_TO_HERD;
    if (isHerd) {
      endingPending = true;
      lock('ending');
    }
    clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(() => {
      collapseTimer = 0;
      collapsing = false;
      if (isHerd) {
        unlock('ragdoll');
        showEnding('herd');
        return;
      }
      if (!state.ending && !endingPending) {
        state.trip = PASS_OUT_TRIP;
        bus.emit('trip:changed', { trip: state.trip });
        bus.emit('player:respawn', { zone: 'toilet_corridor' });
        bus.emit('ui:say', { key: `story:losses.passed_out_lines.${(state.passOuts - 1) % PASSED_OUT_LINES}`, seconds: 4 });
        const warning = `story:spirit_guide.herd_warning_${state.passOuts}`;
        setTimeout(() => {
          if (!state.ending && !endingPending) bus.emit('ui:say', { key: warning, seconds: 5 });
        }, 4500);
      }
      unlock('ragdoll');
    }, PASSOUT_RAGDOLL_MS);
  });

  // Loss: caught. Let the horse tumble & flop across the concrete before respawning at checkpoint.
  bus.on('player:caught', () => {
    if (state.ending || endingPending || collapsing) return;
    collapsing = true;
    lock('ragdoll');
    clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(() => {
      collapseTimer = 0;
      collapsing = false;
      if (!state.ending && !endingPending) {
        // Back where you were, not the far start. The back exit is the one exception: the van
        // doesn't park you next to the way out, it takes you to your last memory instead.
        const zone = state.zone === 'back_exit' ? state.checkpoint : state.zone;
        bus.emit('player:respawn', { zone });
        bus.emit('ui:say', { key: `story:losses.caught_lines.${catches++ % CAUGHT_LINES}`, seconds: 5 });
      }
      unlock('ragdoll');
    }, CAUGHT_RAGDOLL_MS);
  });

  // Spirit guide speaks after each fragment. With all five: closing time.
  // Goal gradient: the reaction is keyed by how many you have, so it warms up to "almost there".
  let guideTimer = 0;
  bus.on('fragment:found', ({ id }) => {
    lastFoundAt = performance.now();
    bus.emit('ui:say', { key: `story:found.${state.fragments.length}`, seconds: REACTION_S });
    clearTimeout(guideTimer);
    guideTimer = window.setTimeout(() => {
      if (!state.ending && !endingPending) bus.emit('ui:say', { key: `story:spirit_guide.fragment_${id}`, seconds: 4 });
    }, REACTION_S * 1000);
    if (state.fragments.length === 5 && !state.finale) {
      setTimeout(() => {
        if (state.ending || endingPending) return;
        state.finale = true;
        bus.emit('game:finale', {});
        bus.emit('ui:say', { key: 'story:finale.start', seconds: 5 });
      }, REACTION_S * 1000 + 4500);
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
  bus.on('intro:land', () => {
    debug.fragments.forEach((id) => found(id));
    // No HUD. One line, then it goes. The title already said the goal; this is step one.
    // The spawn sits in the herd's line, so the herd hint lands first. Wait it out so step one isn't covered.
    window.setTimeout(() => {
      if (state.fragments.length === 0 && !state.ending) bus.emit('ui:say', { key: 'story:spirit_guide.first', seconds: 7 });
    }, FIRST_LINE_MS);
    // Curiosity: one strange rumour early on. Waits out a talk or a fresh find, but always lands.
    const surprise = () => {
      if (state.ending || endingPending || metUnicorn) return;
      if (state.inputLocked || collapsing || performance.now() - lastFoundAt < 7000) {
        window.setTimeout(surprise, 3000);
        return;
      }
      bus.emit('ui:say', { key: 'story:surprise.unicorn_rumour', seconds: 6 });
    };
    window.setTimeout(surprise, SURPRISE_MS);
  });
  bus.on('unicorn:near', ({ near }) => {
    if (near) metUnicorn = true;
  });

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
    if (done || state.floor !== 0 || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE + 0.5) return;
    const now = performance.now();
    if (now - hintAt < 25000) return;
    hintAt = now;
    bus.emit('ui:say', { key: 'story:dj.hint', seconds: 4 });
  });
  bus.on('player:stomp', ({ x, z, time }) => {
    if (done || state.floor !== 0 || state.ending || endingPending || Math.hypot(x - booth.x, z - booth.z) > DJ_RANGE) return;
    if (counter.stomp(time) < DJ_STOMPS) return;
    done = true;
    bus.emit('secret:dj', {});
    bus.emit('crowd:cheer', {});
  });
}

function showEnding(ending: EndingId): void {
  if (state.ending) return;
  clearTimeout(collapseTimer);
  collapseTimer = 0;
  collapsing = false;
  unlock('ragdoll');
  endingPending = false;
  state.ending = ending;
  bus.emit('ending:show', { ending });
}
