// Model viewer for Emma: open /?viewer=hall_pillar
// Shows the model next to a 1.8 m human box and a 1 m grid, in the game's lighting.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadModel } from './models';

export function startViewer(name: string): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(5, 10, 5);
  scene.add(key);
  scene.add(new THREE.GridHelper(20, 20, 0x666666, 0x333333));

  const human = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3366ff, transparent: true, opacity: 0.4 }),
  );
  human.position.set(-1.5, 0.9, 0);
  scene.add(human);

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 500);
  camera.position.set(4, 3, 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);

  const hud = document.getElementById('hud')!;
  hud.textContent = `Loading ${name}.glb ...`;

  loadModel(name).then((model) => {
    if (!model) {
      hud.textContent = `public/models/${name}.glb not found or failed to load`;
      return;
    }
    scene.add(model);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    let tris = 0;
    model.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    hud.textContent = `${name}  ·  ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m  ·  ${Math.round(tris)} tris  ·  blue box = 1.8 m human`;
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}
