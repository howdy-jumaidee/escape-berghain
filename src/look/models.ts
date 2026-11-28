// Model loading with a grey box fallback. Owned by Emma.
// Drop <name>.glb into public/models/ and it replaces the box automatically.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();
const grey = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });

function fetchModel(name: string): Promise<THREE.Object3D | null> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader
        .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
        .then((gltf) => {
          gltf.scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry?.computeBoundingSphere();
          });
          return gltf.scene;
        })
        .catch(() => null),
    );
  }
  return cache.get(name)!;
}

function cloneModel(model: THREE.Object3D, disableCulling = false): THREE.Object3D {
  const clone = cloneSkinned(model);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (disableCulling || (mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    if (mesh.material) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    }
  });
  return clone;
}

/**
 * Returns a group right away with a grey box of `size` (metres, origin at the base).
 * If public/models/<name>.glb exists, the box is swapped for the model when it loads.
 */
export function placeModel(name: string, size: THREE.Vector3Like, material: THREE.Material = grey): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  if (isCharacterModel(name)) group.userData.painterlyRole = 'character';
  const box = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  box.position.y = size.y / 2;
  group.add(box);

  fetchModel(name).then((model) => {
    if (!model) return;
    group.remove(box);
    box.geometry.dispose();
    group.add(cloneModel(model, name === 'npc_spirit_guide'));
  });
  return group;
}

export function isCharacterModel(name: string): boolean {
  return /^(npc_|crowd_|horse_)/.test(name);
}

export function loadModel(name: string): Promise<THREE.Object3D | null> {
  return fetchModel(name).then((m) => {
    if (!m) return null;
    const model = cloneModel(m);
    if (isCharacterModel(name)) model.userData.painterlyRole = 'character';
    return model;
  });
}
