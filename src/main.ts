// Entry point. Owned by Dee (Opus only). Wires systems together.
// /?viewer=<model> opens the model viewer instead of the game.
// Phones and small screens (<= 768 px) see the vertical poster and a desktop-only note without loading Three.js.
const params = new URLSearchParams(location.search);
const viewer = params.get('viewer');
const SMALL_SCREEN_PX = 768;

function isSmallOrPhone(): boolean {
  if (params.has('desktop')) return false;
  if (params.has('mobile')) return true;
  if (window.innerWidth <= SMALL_SCREEN_PX) return true;
  const mobileUa = /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent);
  const touchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return mobileUa || touchOnly;
}

if (viewer) {
  import('./look/viewer').then((m) => m.startViewer(viewer));
} else if (isSmallOrPhone()) {
  import('./ui/mobile').then((m) => m.showMobilePoster());
} else {
  import('./game-boot');
  if (!params.has('desktop')) {
    const mq = window.matchMedia(`(max-width: ${SMALL_SCREEN_PX}px)`);
    let mod: Promise<typeof import('./ui/mobile')> | null = null;
    const sync = () => {
      if (mq.matches) {
        mod ??= import('./ui/mobile');
        mod.then((m) => m.toggleMobileOverlay(true));
      } else if (mod) {
        mod.then((m) => m.toggleMobileOverlay(false));
      }
    };
    mq.addEventListener('change', sync);
  }
}
