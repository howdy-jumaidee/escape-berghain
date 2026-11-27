// Game boot. Owned by Dee (Opus only).
import * as THREE from 'three';
import { bus, state } from './contracts';
import { buildScene } from './look/scene';
import { Horse } from './player/horse';
import { TripFx } from './fx/trip';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const { scene, strobes } = buildScene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

const horse = new Horse(() => {});
// Until the UI lands (click to start), start right away.
state.started = true;
scene.add(horse.root);

const fx = new TripFx(renderer, scene, camera);
const hud = document.getElementById('hud')!;

bus.on('trip:max', () => {
  hud.textContent = 'You passed out in the toilet queue. (Losses come in issue #13)';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx.composer.setSize(innerWidth, innerHeight);
});

const camOffset = new THREE.Vector3(0, 14, 12);
const timer = new THREE.Timer();
let t = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  t += dt;

  horse.update(dt);

  const target = horse.root.position.clone().add(camOffset);
  camera.position.lerp(target, 1 - Math.exp(-4 * dt));
  fx.setCameraBase(camera.position);
  camera.lookAt(horse.root.position);

  // 128 BPM strobes.
  const beat = (t * 128) / 60;
  strobes.forEach((l, i) => (l.intensity = (Math.sin(beat * Math.PI + i * Math.PI) > 0.6 ? 60 : 4)));

  fx.update(dt);
  if (!state.ending && state.trip < 100) hud.textContent = `Trip ${Math.round(state.trip)}  ·  WASD to walk`;
  fx.render(dt);
});
