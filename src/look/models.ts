// Model loading with a grey box fallback. Owned by Emma.
// Drop <name>.glb into public/models/ and it replaces the box automatically.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();
const grey = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });

function fetchModel(name: string): Promise<THREE.Object3D | null> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader
        .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
        .then((gltf) => gltf.scene)
        .catch(() => null),
    );
  }
  return cache.get(name)!;
}

/**
 * Returns a group right away with a grey box of `size` (metres, origin at the base).
 * If public/models/<name>.glb exists, the box is swapped for the model when it loads.
 */
export function placeModel(name: string, size: THREE.Vector3Like, material: THREE.Material = grey): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const box = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  box.position.y = size.y / 2;
  group.add(box);

  fetchModel(name).then((model) => {
    if (!model) return;
    group.remove(box);
    group.add(model.clone(true));
  });
  return group;
}

export function loadModel(name: string): Promise<THREE.Object3D | null> {
  return fetchModel(name).then((m) => (m ? m.clone(true) : null));
}
