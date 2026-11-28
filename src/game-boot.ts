// Game boot. Owned by Dee (Opus only). Creates each system and runs the frame loop.
// Systems never import each other. They talk through the bus; this file only wires and ticks them.
import * as THREE from 'three';
import { bus, state, BEAT_SECONDS } from './contracts';
import { debug } from './data';
import { buildScene } from './look/scene';
import { World } from './world';
import { Horse } from './player/horse';
import { TripFx } from './fx/trip';
import { startGame } from './game';
import { startUi } from './ui';
import { Npcs } from './npc';
import { startAudio } from './audio';

/** Render at a fraction of the screen resolution and scale up with hard pixels: grit, and speed. */
const PIXEL_SCALE = 0.42;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PIXEL_SCALE);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.imageRendering = 'pixelated';
document.body.appendChild(renderer.domElement);

const { scene, strobes, flicker, lasers, house, update: updateLook } = buildScene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 300);

const world = new World();
scene.add(world.root);

const npcs = new Npcs();
scene.add(npcs.root);

// The horse collides with the level (and 9 m galleries/stairs), gets shoved by the floor-0 crowd,
// then resolved again so the crowd can't push it into a wall.
let horseY = 0;
const horse = new Horse((pos, r) => {
  world.resolve(pos, r, state.floor, horseY);
  npcs.pushPlayer(pos, r, horseY);
  world.resolve(pos, r, state.floor, horseY);
});
horse.setPosition(world.level.start.x, world.level.start.z);
scene.add(horse.root);

// Dancers block security torches: hide in the crowd.
world.setTorchBlocker((x, z) => npcs.blocks(x, z));

const fx = new TripFx(renderer, scene, camera);
startGame();
startUi();
startAudio();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx.composer.setSize(innerWidth, innerHeight);
});

// Strobes flash on the beat clock, and sometimes stutter. The camera kicks with the kick drum.
let flash = 0;
let kick = 0;
let stutter = 0;
bus.on('beat', ({ n }) => {
  flash = 1;
  kick = 1;
  strobes.forEach((l, i) => (l.userData.on = (n + i) % 2 === 0));
  // Every 16 bars, a bar of stuttering strobe. Constantly at closing time.
  if (n % 64 >= 60 || state.finale) stutter = BEAT_SECONDS;
});
let houseLights = 0;
bus.on('game:finale', () => (houseLights = 1));

// Two views, V cycles them: follow cam behind the horse (the default), then the horse's own eyes.
type View = 'follow' | 'eyes';
const VIEWS: View[] = ['follow', 'eyes'];
let view: View = 'follow';
let baseFov = 62;
camera.fov = baseFov;
camera.updateProjectionMatrix();
horse.setCameraMode('follow');

const setView = (next: View) => {
  view = next;
  horse.root.visible = !focus && view !== 'eyes';
  horse.setCameraMode(view);
  baseFov = 62;
};
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || e.repeat || !state.started || state.ending) return;
  setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
});

const lookAt = new THREE.Vector3();
const horseNdc = new THREE.Vector3();
const camBase = new THREE.Vector3();
const follow = new THREE.Vector3();
const eyeAnchor = new THREE.Vector3();
let followYaw = horse.facing;
let snapCam = true;
bus.on('player:teleport', () => {
  snapCam = true;
});

// Face to face: walk into a special NPC and the camera frames their face without clipping into walls.
const FOCUS_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
const focusTest = new THREE.Vector3();
let focus: { face: THREE.Vector3; dir: THREE.Vector2; t: number } | null = null;
bus.on('npc:focus', ({ x, y, z }) => {
  const face = new THREE.Vector3(x, y, z);
  const dir = new THREE.Vector2(horse.root.position.x - x, horse.root.position.z - z);
  if (dir.length() < 0.15) dir.set(camBase.x - x, camBase.z - z);
  if (dir.length() < 0.01) dir.set(0, 1);
  dir.normalize();

  // Pick the angle closest to dir that keeps clear line of sight (preferring >= 1.5 m clearance).
  const bestDir = dir.clone();
  let bestClear = -1;
  for (const off of FOCUS_OFFSETS) {
    const cos = Math.cos(off);
    const sin = Math.sin(off);
    const cx = dir.x * cos - dir.y * sin;
    const cz = dir.x * sin + dir.y * cos;
    focusTest.set(face.x + cx * 2.25, face.y - 0.04, face.z + cz * 2.25);
    world.clipCamera(face, focusTest, 0.35, 0);
    const clear = Math.hypot(focusTest.x - face.x, focusTest.z - face.z);
    if (clear >= 2.0) {
      bestDir.set(cx, cz);
      bestClear = clear;
      break;
    }
    const beatsBest =
      (clear >= 1.5 && bestClear < 1.5) ||
      (clear >= 1.5 && clear > bestClear + 0.15) ||
      (bestClear < 1.5 && clear > bestClear);
    if (beatsBest) {
      bestDir.set(cx, cz);
      bestClear = clear;
    }
  }
  focus = { face, dir: bestDir, t: 0 };
  npcs.setFocusFacing(face.x + bestDir.x, face.z + bestDir.y);
  horse.root.visible = false;
});
bus.on('npc:unfocus', () => {
  focus = null;
  horse.root.visible = view !== 'eyes';
});
const timer = new THREE.Timer();
let t = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  t += dt;

  horseY = horse.root.position.y;
  horse.update(dt);

  // Smooth stair/gallery elevation (0 -> 9 m).
  const elev = world.elevationAt(horse.root.position.x, horse.root.position.z, state.floor, horse.root.position.y);
  if (elev.floor !== state.floor) {
    state.floor = elev.floor;
    bus.emit('player:floor', { floor: elev.floor });
  }
  horse.setElevation(elev.y);
  horseY = elev.y;

  // Smoothly trail the horse's facing in third-person so drunk twitches don't whip the room around.
  if (snapCam) {
    followYaw = horse.facing;
  } else {
    const yawDiff = Math.atan2(Math.sin(horse.facing - followYaw), Math.cos(horse.facing - followYaw));
    followYaw += yawDiff * (1 - Math.exp(-(view === 'eyes' ? 14 : 6) * dt));
  }
  const h = view === 'eyes' ? horse.facing : followYaw;
  const fwdX = Math.sin(h);
  const fwdZ = Math.cos(h);
  const px = horse.root.position.x;
  const py = horse.root.position.y;
  const pz = horse.root.position.z;
  eyeAnchor.set(px, py + (view === 'eyes' ? 1.75 : 2.1), pz);

  if (view === 'follow') {
    follow.set(px - fwdX * 6, py + 3.6, pz - fwdZ * 6);
    world.clipCamera(eyeAnchor, follow, 0.45, py);
    lookAt.set(px + fwdX * 4, py + 1.35, pz + fwdZ * 4);
  } else {
    follow.set(px + fwdX * 0.65, py + 1.75, pz + fwdZ * 0.65);
    world.clipCamera(eyeAnchor, follow, 0.3, py);
    lookAt.set(px + fwdX * 10, py + 1.5, pz + fwdZ * 10);
  }
  let focusFov = 0;
  let roll = 0;
  if (focus) {
    focus.t += dt;
    const e = 1 - Math.pow(1 - Math.min(1, focus.t / 1.1), 3);
    const dist = 2.35 - e * 0.4;
    follow.set(focus.face.x + focus.dir.x * dist, focus.face.y - 0.04, focus.face.z + focus.dir.y * dist);
    world.clipCamera(focus.face, follow, 0.35, 0);
    lookAt.copy(focus.face);
    // Clean portrait framing: gentle push-in with subtle lens tightening.
    focusFov = 44 - e * 5;
    roll = Math.sin(focus.t * 0.9) * 0.012;
  }

  if (snapCam) {
    camBase.copy(follow);
    snapCam = false;
  } else {
    camBase.lerp(follow, 1 - Math.exp(-(focus ? 7 : view === 'eyes' ? 14 : 6) * dt));
    if (focus) {
      world.clipCamera(focus.face, camBase, 0.3, 0);
    } else {
      world.clipCamera(eyeAnchor, camBase, 0.35, py);
    }
  }

  world.update(dt, camBase, false);
  npcs.update(dt);
  updateLook(dt);

  // Kick: a small zoom punch on every beat.
  kick = Math.max(0, kick - dt * 6);
  camera.fov = (focus ? focusFov : baseFov) - kick * kick * 1.2;
  camera.updateProjectionMatrix();

  flash = Math.max(0, flash - dt * 7);
  stutter = Math.max(0, stutter - dt);
  const strobing = stutter > 0 && Math.floor(t * 24) % 2 === 0;
  strobes.forEach((l) => (l.intensity = strobing ? 1400 : l.userData.on ? 60 + flash * 900 : 40));
  flicker.intensity = Math.random() < 0.04 ? 10 : 120 + Math.sin(t * 50) * 15;

  // Lasers sweep on the beat.
  lasers.rotation.y = Math.sin(t * 0.9) * 0.5 + flash * 0.05;
  lasers.children.forEach((b, i) => (b.rotation.x = 0.08 + Math.sin(t * 1.3 + i) * 0.06));

  // Closing time: the house lights flicker on.
  if (houseLights) house.intensity = (Math.random() < 0.08 ? 0.2 : 1.6) * Math.min(1, (houseLights += dt * 0.5) - 1 + 0.3);

  fx.setCameraBase(camBase, focus ? 0.12 : view === 'follow' ? 0.45 : 0.2);
  // Same soft spill in both views. Follow is flagged so the shafts wrap the horse instead of filling the eyes.
  fx.setSpill(focus ? 0.35 : view === 'eyes' ? 0.55 : 0.45, !focus && view === 'follow' ? 1 : 0);
  fx.update(dt);
  if (focus) {
    world.clipCamera(focus.face, camera.position, 0.3, 0);
  } else {
    world.clipCamera(eyeAnchor, camera.position, 0.25, py);
  }
  camera.lookAt(lookAt);
  if (roll) camera.rotateZ(roll);
  // Where the horse sits in the frame, so follow-cam light can rim the body.
  horseNdc.copy(horse.root.position);
  horseNdc.y += 1.05;
  horseNdc.project(camera);
  fx.setHorse(horseNdc.x * 0.5 + 0.5, horseNdc.y * 0.5 + 0.5);
  fx.render(dt);
});

// Playtesting: /?debug puts window.eb = { state, bus, world, npcs, horse, camera } on the page.
if (debug.on) (window as unknown as { eb: unknown }).eb = { state, bus, world, npcs, horse, camera };
