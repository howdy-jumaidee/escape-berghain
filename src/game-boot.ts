// Game boot. Owned by Dee (Opus only). Creates each system and runs the frame loop.
// Systems never import each other. They talk through the bus; this file only wires and ticks them.
import * as THREE from 'three';
import { bus, state, BEAT_SECONDS, FLOOR_HEIGHT } from './contracts';
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
const FOV = 32;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PIXEL_SCALE);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.imageRendering = 'pixelated';
document.body.appendChild(renderer.domElement);
// Cutaway: nothing above 9 m is drawn, like a dollhouse with the roof off.
// In the top-down view nothing above 12 m is drawn (a dollhouse with the roof off). The low views see all the way up.
const CUTAWAY = 12;
const cutaway = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUTAWAY);
renderer.clippingPlanes = [cutaway];

const { scene, strobes, flicker, lasers, house, update: updateLook } = buildScene();
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 300);

const world = new World();
scene.add(world.root);

const npcs = new Npcs();
scene.add(npcs.root);

// The horse collides with the level (and 9 m galleries/stairs), gets shoved by the floor-0 crowd,
// then resolved again so the crowd can't push it into a wall.
let horseY = 0;
const horse = new Horse((pos, r) => {
  world.resolve(pos, r, state.floor, horseY);
  if (state.floor === 0 && horseY < 1.5) npcs.pushPlayer(pos, r);
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

// Three views, V cycles them: low follow cam behind the horse (the default), the horse's own eyes, and top down.
type View = 'top' | 'follow' | 'eyes';
const VIEWS: View[] = ['top', 'follow', 'eyes'];
let view: View = 'follow';
let baseFov = 62;
camera.fov = baseFov;
camera.updateProjectionMatrix();
horse.setCameraMode('follow');

const setView = (next: View) => {
  view = next;
  horse.root.visible = !focus && view !== 'eyes';
  horse.setCameraMode(view);
  baseFov = view === 'top' ? FOV : 62;
};
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || e.repeat || !state.started || state.ending) return;
  setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
});

const camOffset = new THREE.Vector3(0, 28, 16);
const lookAt = new THREE.Vector3();
const camBase = new THREE.Vector3();
const follow = new THREE.Vector3();
const eyeAnchor = new THREE.Vector3();
let followYaw = horse.facing;
let snapCam = true;
bus.on('player:teleport', () => {
  snapCam = true;
});

// Face to face: walk into a special NPC and the camera is pulled into your eyes, staring at their face.
// A dolly zoom (closer while the lens widens) makes the room stretch behind them. Like an old RPG, but wrong.
let focus: { face: THREE.Vector3; dir: THREE.Vector2; t: number } | null = null;
bus.on('npc:focus', ({ x, y, z }) => {
  // Fix the angle once, from the NPC towards where the camera is now, so it can't flip if the horse slides.
  const dir = new THREE.Vector2(camBase.x - x, camBase.z - z);
  const toHorse = new THREE.Vector2(horse.root.position.x - x, horse.root.position.z - z);
  if (toHorse.length() > 0.4) dir.copy(toHorse);
  if (dir.length() < 0.01) dir.set(0, 1);
  dir.normalize();
  focus = { face: new THREE.Vector3(x, horse.root.position.y + y, z), dir, t: 0 };
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

  if (view === 'top') {
    follow.set(px, py, pz).add(camOffset);
    lookAt.set(px, py, pz);
    horse.cameraYaw = Math.PI;
  } else if (view === 'follow') {
    follow.set(px - fwdX * 6, py + 3.6, pz - fwdZ * 6);
    world.clipCamera(eyeAnchor, follow, 0.45, py);
    lookAt.set(px + fwdX * 4, py + 1.35, pz + fwdZ * 4);
    horse.cameraYaw = followYaw;
  } else {
    follow.set(px + fwdX * 0.65, py + 1.75, pz + fwdZ * 0.65);
    world.clipCamera(eyeAnchor, follow, 0.3, py);
    lookAt.set(px + fwdX * 10, py + 1.5, pz + fwdZ * 10);
    horse.cameraYaw = horse.facing;
  }
  cutaway.constant = state.floor * FLOOR_HEIGHT + (view === 'top' && !focus ? CUTAWAY : 1000);
  let focusFov = 0;
  let roll = 0;
  if (focus) {
    focus.t += dt;
    const e = 1 - Math.pow(1 - Math.min(1, focus.t / 1.1), 3);
    const dist = 2.6 - e * 1.35;
    follow.set(focus.face.x + focus.dir.x * dist, focus.face.y - 0.05, focus.face.z + focus.dir.y * dist);
    lookAt.copy(focus.face);
    // Dolly zoom: the face grows a little while everything behind it stretches away.
    focusFov = 2 * Math.atan((0.75 - e * 0.25) / dist) * (180 / Math.PI);
    roll = Math.sin(focus.t * 0.9) * 0.05;
  }

  if (snapCam) {
    camBase.copy(follow);
    snapCam = false;
  } else {
    camBase.lerp(follow, 1 - Math.exp(-(focus ? 7 : view === 'eyes' ? 14 : 6) * dt));
    if (view !== 'top' && !focus) world.clipCamera(eyeAnchor, camBase, 0.35, py);
  }

  world.update(dt, camBase, view === 'top' && !focus);
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

  fx.setCameraBase(camBase, focus ? 0.12 : view === 'top' ? 1 : view === 'follow' ? 0.45 : 0.2);
  fx.update(dt);
  if (view !== 'top' && !focus) world.clipCamera(eyeAnchor, camera.position, 0.25, py);
  camera.lookAt(lookAt);
  if (roll) camera.rotateZ(roll);
  fx.render(dt);
});

// Playtesting: /?debug puts window.eb = { state, bus, world, npcs, horse, camera } on the page.
if (debug.on) (window as unknown as { eb: unknown }).eb = { state, bus, world, npcs, horse, camera };
