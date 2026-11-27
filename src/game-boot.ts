// Game boot. Owned by Dee (Opus only). Creates each system and runs the frame loop.
// Systems never import each other. They talk through the bus; this file only wires and ticks them.
import * as THREE from 'three';
import { bus, state } from './contracts';
import { buildScene } from './look/scene';
import { World } from './world';
import { Horse } from './player/horse';
import { TripFx } from './fx/trip';
import { startGame } from './game';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
// Cutaway: nothing above 9 m is drawn, like a dollhouse with the roof off.
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 9)];

const { scene, strobes, flicker } = buildScene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);

const world = new World();
scene.add(world.root);

const horse = new Horse((pos, r) => world.resolve(pos, r));
horse.setPosition(world.level.start.x, world.level.start.z);
scene.add(horse.root);


const fx = new TripFx(renderer, scene, camera);
// Until the UI lands (click to start), start right away.
state.started = true;
startGame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx.composer.setSize(innerWidth, innerHeight);
});

// Strobes flash on the beat clock.
let flash = 0;
bus.on('beat', ({ n }) => {
  flash = 1;
  strobes.forEach((l, i) => (l.userData.on = (n + i) % 2 === 0));
});

// Fixed, angled, top down camera.
const camOffset = new THREE.Vector3(0, 24, 14);
camera.position.copy(horse.root.position).add(camOffset);
const timer = new THREE.Timer();
let t = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  t += dt;

  horse.update(dt);
  world.update(dt, camera.position);

  const target = horse.root.position.clone().add(camOffset);
  camera.position.lerp(target, 1 - Math.exp(-4 * dt));
  fx.setCameraBase(camera.position);
  camera.lookAt(horse.root.position);

  flash = Math.max(0, flash - dt * 7);
  strobes.forEach((l) => (l.intensity = l.userData.on ? 60 + flash * 900 : 40));
  flicker.intensity = Math.random() < 0.04 ? 10 : 120 + Math.sin(t * 50) * 15;

  fx.update(dt);
  fx.render(dt);
});

// Handy in the console while playtesting: window.eb.state, window.eb.bus.
(window as unknown as { eb: unknown }).eb = { state, bus };
