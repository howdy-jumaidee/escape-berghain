// Entry point. Owned by Dee (Opus only). Wires systems together.
// /?viewer=<model> opens the model viewer instead of the game.
// Phones see the vertical poster and a desktop-only note without loading Three.js.
const params = new URLSearchParams(location.search);
const viewer = params.get('viewer');

function isPhone(): boolean {
  if (params.has('desktop')) return false;
  if (params.has('mobile')) return true;
  const mobileUa = /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent);
  const narrowTouch =
    window.matchMedia('(hover: none) and (pointer: coarse)').matches &&
    Math.min(window.innerWidth, window.innerHeight) <= 700;
  return mobileUa || narrowTouch;
}

if (viewer) {
  import('./look/viewer').then((m) => m.startViewer(viewer));
} else if (isPhone()) {
  import('./ui/mobile').then((m) => m.showMobilePoster());
} else {
  import('./game-boot');
}
