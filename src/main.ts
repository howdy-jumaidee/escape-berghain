// Entry point. Owned by Dee (Opus only). Wires systems together.
// /?viewer=<model> opens the model viewer instead of the game.
const viewer = new URLSearchParams(location.search).get('viewer');
if (viewer) {
  import('./look/viewer').then((m) => m.startViewer(viewer));
} else {
  import('./game-boot');
}
