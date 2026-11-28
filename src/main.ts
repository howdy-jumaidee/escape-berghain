// Entry point. Owned by Dee (Opus only). Wires systems together.
// /?viewer=<model> opens the model viewer instead of the game.
// Phones in portrait and narrow desktop windows see the vertical poster. Rotating a phone horizontally boots and plays the game.
const params = new URLSearchParams(location.search);
const viewer = params.get('viewer');
const SMALL_SCREEN_PX = 768;

const isTouchDevice =
  /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) ||
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function shouldShowPoster(): boolean {
  if (params.has('desktop')) return false;
  if (params.has('mobile')) return true;
  if (isTouchDevice) return window.innerHeight >= window.innerWidth;
  return window.innerWidth <= SMALL_SCREEN_PX;
}

if (viewer) {
  import('./look/viewer').then((m) => m.startViewer(viewer));
} else {
  let booted = false;
  let mobileMod: Promise<typeof import('./ui/mobile')> | null = null;

  const sync = () => {
    if (shouldShowPoster()) {
      mobileMod ??= import('./ui/mobile');
      mobileMod.then((m) => (booted ? m.toggleMobileOverlay(true) : m.showMobilePoster()));
    } else {
      if (mobileMod) mobileMod.then((m) => m.toggleMobileOverlay(false));
      if (!booted) {
        booted = true;
        import('./game-boot');
      }
    }
  };

  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', () => window.setTimeout(sync, 120));
}
