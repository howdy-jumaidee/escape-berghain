// Look: lights, fog, greybox hall. Owned by Emma. Replace boxes with models from public/models/.
import * as THREE from 'three';
import { placeModel } from './models';

export function buildScene(): { scene: THREE.Scene; strobes: THREE.PointLight[] } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x0a0610, 0.035);

  scene.add(new THREE.AmbientLight(0x221a2a, 0.6));

  const work = new THREE.SpotLight(0xdfe8ff, 40, 40, Math.PI / 7, 0.6);
  work.position.set(-8, 16, -6);
  work.target.position.set(-6, 0, -6);
  scene.add(work, work.target);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.7 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), concrete);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Pillars, 18 m like the real hall.
  for (const x of [-12, -4, 4, 12]) {
    for (const z of [-10, 0, 10]) {
      const p = placeModel('hall_pillar', { x: 1.2, y: 18, z: 1.2 }, concrete);
      p.position.set(x, 0, z);
      scene.add(p);
    }
  }

  // Speaker towers.
  for (const x of [-7, 7]) {
    const s = placeModel('hall_speaker', { x: 1.5, y: 5, z: 1.5 }, steel);
    s.position.set(x, 0, -14);
    scene.add(s);
  }

  // Back exit: green sign.
  const exit = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x22ff66 }),
  );
  exit.position.set(0, 3.5, 19.9);
  scene.add(exit);

  const strobes = [0xff1744, 0x9c27ff].map((c, i) => {
    const l = new THREE.PointLight(c, 30, 30);
    l.position.set(i === 0 ? -6 : 6, 6, -8);
    scene.add(l);
    return l;
  });

  return { scene, strobes };
}
