// Look: lights, fog and haze. Owned by Emma. The level geometry is built by src/world/ from levels/level1.json.
// World coordinates: cell [col, row] centre is at x = col*4+2, z = row*4+2. Main hall is x 4..44, z 4..36.
// The lights below are placeholders at the right spots so every zone reads. Emma: retune freely (issue #5).
import * as THREE from 'three';

export interface Look {
  scene: THREE.Scene;
  /** Flash on the beat. */
  strobes: THREE.PointLight[];
  /** Toilet corridor tube light. Flickers. */
  flicker: THREE.PointLight;
}

export function buildScene(): Look {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x0a0610, 0.02);

  scene.add(new THREE.AmbientLight(0x2a2035, 1.6));
  scene.add(new THREE.HemisphereLight(0x2a2245, 0x080808, 1.4));

  // One cold white work light cutting through the haze over the dance floor.
  const work = new THREE.SpotLight(0xdfe8ff, 900, 50, Math.PI / 7, 0.6);
  work.position.set(10, 17, 30);
  work.target.position.set(13, 0, 27);
  scene.add(work, work.target);

  // Red and purple strobes near the DJ booth.
  const strobes = [0xff1744, 0x9c27ff].map((c, i) => {
    const l = new THREE.PointLight(c, 300, 40);
    l.position.set(i === 0 ? 15 : 31, 7, 12);
    scene.add(l);
    return l;
  });

  // Bar: dirty amber.
  const bar = new THREE.PointLight(0xff8a3c, 160, 20);
  bar.position.set(54, 4, 9);
  scene.add(bar);

  // Toilet corridor: sick green tube light.
  const flicker = new THREE.PointLight(0xc8ffd8, 120, 18);
  flicker.position.set(54, 3, 28);
  scene.add(flicker);

  // Panorama Bar: warmer, pinker.
  const pano = new THREE.PointLight(0xff4fa0, 260, 30);
  pano.position.set(22, 5, 43);
  scene.add(pano);

  // Back exit: green exit sign, morning leaking under the door.
  const exit = new THREE.PointLight(0x22ff66, 120, 16);
  exit.position.set(62, 3, 46);
  scene.add(exit);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  sign.position.set(62, 3.2, 47.8);
  scene.add(sign);
  const morning = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xffe9c0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  morning.rotation.x = -Math.PI / 2;
  morning.position.set(62, 0.02, 47.4);
  scene.add(morning);

  return { scene, strobes, flicker };
}
