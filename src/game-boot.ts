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
const cutaway = new THREE.Plane(new THREE.Vector3(0, -1, 0), 9);
renderer.clippingPlanes = [cutaway];
// On another floor the cutaway moves up with you.
bus.on('player:floor', ({ floor }) => (cutaway.constant = floor * FLOOR_HEIGHT + 9));

const { scene, strobes, flicker, lasers, house } = buildScene();
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 200);

const world = new World();
scene.add(world.root);

const npcs = new Npcs();
scene.add(npcs.root);

// The horse collides with the level, gets shoved by the crowd, then the level again so the crowd can't push it into a wall.
const horse = new Horse((pos, r) => {
  world.resolve(pos, r);
  npcs.pushPlayer(pos, r);
  world.resolve(pos, r);
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

// Three views, V cycles them: top down (the default), a low follow cam behind the horse, and the horse's own eyes.
type View = 'top' | 'follow' | 'eyes';
const VIEWS: View[] = ['top', 'follow', 'eyes'];
let view: View = 'top';
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || e.repeat || !state.started) return;
  view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  horse.root.visible = view !== 'eyes';
  baseFov = view === 'top' ? FOV : 62;
});
let baseFov = FOV;
const camOffset = new THREE.Vector3(0, 24, 14);
const lookAt = new THREE.Vector3();
camera.position.copy(horse.root.position).add(camOffset);
const timer = new THREE.Timer();
const follow = new THREE.Vector3();
let t = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  t += dt;

  horse.update(dt);
  world.update(dt, camera.position);
  npcs.update(dt);

  const h = horse.facing;
  const fwdX = Math.sin(h);
  const fwdZ = Math.cos(h);
  if (view === 'top') {
    follow.copy(horse.root.position).add(camOffset);
    lookAt.copy(horse.root.position);
    horse.cameraYaw = Math.PI;
  } else if (view === 'follow') {
    follow.set(horse.root.position.x - fwdX * 6, horse.root.position.y + 3.6, horse.root.position.z - fwdZ * 6);
    lookAt.set(horse.root.position.x + fwdX * 4, horse.root.position.y + 1.2, horse.root.position.z + fwdZ * 4);
    horse.cameraYaw = Math.atan2(fwdX, fwdZ);
  } else {
    follow.set(horse.root.position.x + fwdX * 0.9, horse.root.position.y + 1.75, horse.root.position.z + fwdZ * 0.9);
    lookAt.set(horse.root.position.x + fwdX * 10, horse.root.position.y + 1.5, horse.root.position.z + fwdZ * 10);
    horse.cameraYaw = Math.atan2(fwdX, fwdZ);
  }
  camera.position.lerp(follow, 1 - Math.exp(-(view === 'eyes' ? 12 : 4) * dt));
  fx.setCameraBase(camera.position);
  camera.lookAt(lookAt);

  // Kick: a small zoom punch on every beat.
  kick = Math.max(0, kick - dt * 6);
  camera.fov = baseFov - kick * kick * 1.2;
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

  fx.update(dt);
  fx.render(dt);
});

// Playtesting: /?debug puts window.eb = { state, bus, world, npcs, horse } on the page.
if (debug.on) (window as unknown as { eb: unknown }).eb = { state, bus, world, npcs, horse };
